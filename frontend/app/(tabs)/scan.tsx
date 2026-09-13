import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TextInput, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";
import { api, Profile, House, Shift } from "@/src/api";
import { useTheme, radius, type Palette, fonts, typeScale } from "@/src/theme";
import { Pressable } from "@/src/components/FeedbackPressable";
import { fmtDMY, fmtWeekday, parseDMY } from "@/src/timeUtils";
import { scheduleShiftAlarm, ensureShiftAlarmPermissions } from "@/src/notifications";
import { recognizeRosterImage } from "@/modules/shiftmate-ocr/src";
import { parseRosterOcr, type ParsedRosterCell } from "@/src/rosterParser";
import { archiveRosterImage } from "@/src/rosterArchive";

type ConfirmableCell = ParsedRosterCell & { selected?: boolean; dateInput: string; house_id?: string | null };
const validTime = (value?: string) => Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));

export default function ScanScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ConfirmableCell[]>([]);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanWarnings, setScanWarnings] = useState<string[]>([]);
  const [savingCount, setSavingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadInit = useCallback(async () => {
    const [p, h] = await Promise.all([api.getProfile(), api.listHouses()]);
    setProfile(p); setHouses(h);
  }, []);

  useFocusEffect(useCallback(() => {
    loadInit(); setImageUri(null); setParsed([]); setScanId(null); setScanWarnings([]); setError(null);
  }, [loadInit]));

  const parseImage = async (uri: string) => {
    if (!profile?.name) return setError("Please set your name in Settings first.");
    setParsing(true); setError(null);
    try {
      const archivedUri = await archiveRosterImage(uri);
      setImageUri(archivedUri);
      const ocr = await recognizeRosterImage(archivedUri);
      const result = parseRosterOcr(ocr, profile.name, houses.map((house) => house.name));
      const scan = await api.addRosterScan({ original_uri: archivedUri, ocr_engine: ocr.engine, parser_version: 3, overall_confidence: result.overallConfidence, status: "needs_confirmation", raw_ocr_json: JSON.stringify(ocr) });
      setScanId(scan.id); setScanWarnings(result.warnings);
      const defaultHouse = houses.find((house) => house.id === profile.default_house_id);
      const rows = result.cells.map((cell) => {
        const matchedHouse = houses.find((house) => house.name === cell.house_name);
        return {
          ...cell,
          selected: cell.kind === "shift" && !cell.warnings.some((warning) => /inferred/i.test(warning)),
          dateInput: fmtDMY(cell.date),
          house_id: matchedHouse?.id ?? defaultHouse?.id ?? null,
          house_name: matchedHouse?.name ?? cell.house_name ?? defaultHouse?.name ?? "",
        };
      });
      setParsed(rows);
      if (!rows.length) setError(`No roster entries were confidently found for ${profile.name}. Nothing was saved.`);
    } catch (e: any) { setError(e?.message || "Failed to parse roster."); }
    finally { setParsing(false); }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError("Photo library permission denied.");
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (!res.canceled && res.assets?.[0]) await parseImage(res.assets[0].uri);
  };
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError("Camera permission denied.");
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (!res.canceled && res.assets?.[0]) await parseImage(res.assets[0].uri);
  };

  const toggle = (i: number) => setParsed((prev) => prev.map((p, idx) => idx === i && p.kind === "shift" ? { ...p, selected: !p.selected } : p));
  const updateParsedTime = (i: number, field: "start_time" | "end_time", value: string) => setParsed((prev) => prev.map((cell, idx) => idx === i ? { ...cell, [field]: value } : cell));
  const updateParsedDate = (i: number, value: string) => setParsed((prev) => prev.map((cell, idx) => {
    if (idx !== i) return cell;
    const date = parseDMY(value);
    return { ...cell, dateInput: value, ...(date ? { date } : {}) };
  }));
  const updateParsedHouse = (i: number, house: House) => setParsed((prev) => prev.map((cell, idx) => idx === i ? { ...cell, house_id: house.id, house_name: house.name } : cell));

  const saveChosen = async (chosen: ConfirmableCell[]) => {
    if (!chosen.length) return;
    setSavingCount(chosen.length);
    try {
      await ensureShiftAlarmPermissions();
      const payload = chosen.map((c) => ({
        date: parseDMY(c.dateInput)!, start_time: c.start_time!, end_time: c.end_time!, house_id: c.house_id ?? null,
        house_name: c.house_name, alarm_enabled: true, notes: "", source: "roster" as const,
        roster_scan_id: scanId, confidence: c.confidence, confirmation_status: "confirmed" as const,
      }));
      const created: Shift[] = await api.bulkAddShifts(payload);
      if (scanId) await api.updateRosterScanStatus(scanId, "confirmed");
      const lead = profile?.alarm_lead_minutes ?? 150;
      const alarms = await Promise.allSettled(created.map((shift) => scheduleShiftAlarm(shift.id, shift.date, shift.start_time, lead, shift.house_name)));
      const failures = alarms.filter((item) => item.status === "rejected").length;
      if (failures) {
        Alert.alert("Shifts saved", `${created.length} shifts were saved, but ${failures} alarm${failures === 1 ? "" : "s"} could not be scheduled.`);
        return;
      }
      Alert.alert("Saved", `${created.length} shift${created.length === 1 ? "" : "s"} saved to your calendar.`, [{ text: "OK", onPress: () => router.replace("/(tabs)") }]);
    } catch (e: any) { setError(e?.message || "Failed to save shifts."); }
    finally { setSavingCount(0); }
  };

  const saveSelected = async () => {
    const selected = parsed.filter((cell) => cell.kind === "shift" && cell.selected);
    if (selected.some((cell) => !parseDMY(cell.dateInput))) return setError("Correct each selected shift date before saving.");
    if (selected.some((cell) => !validTime(cell.start_time) || !validTime(cell.end_time))) return setError("Correct each selected shift time using 24-hour HH:MM format before saving.");
    const chosen = selected.filter((cell) => cell.start_time && cell.end_time);
    if (!chosen.length) return;
    try {
      const existing = await api.listShifts();
      const isDuplicate = (cell: ConfirmableCell) => {
        const date = parseDMY(cell.dateInput);
        return existing.some((shift) => shift.date === date && shift.start_time === cell.start_time && shift.end_time === cell.end_time);
      };
      const duplicates = chosen.filter(isDuplicate);
      if (!duplicates.length) return void await saveChosen(chosen);
      const newOnly = chosen.filter((cell) => !isDuplicate(cell));
      const details = duplicates.slice(0, 4).map((cell) => `${cell.dateInput} · ${cell.start_time}–${cell.end_time}`).join("\n");
      const buttons: Parameters<typeof Alert.alert>[2] = [{ text: "Cancel", style: "cancel" }];
      if (newOnly.length) buttons.push({ text: `Save ${newOnly.length} new only`, onPress: () => { void saveChosen(newOnly); } });
      buttons.push({ text: "Save duplicates anyway", style: "destructive", onPress: () => { void saveChosen(chosen); } });
      Alert.alert("Shift already exists", `${duplicates.length} selected shift${duplicates.length === 1 ? " is" : "s are"} already in your calendar:\n\n${details}`, buttons);
    } catch (e: any) { setError(e?.message || "Could not check for existing shifts."); }
  };

  const selectedCount = parsed.filter((p) => p.kind === "shift" && p.selected).length;
  const currentStep = parsed.length ? 3 : imageUri || parsing ? 2 : 1;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: parsed.length ? insets.bottom + 150 : insets.bottom + 90 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.logoMark}><Icon name="heart" size={22} color={colors.onBrandPrimary} /></View>
          <View style={{ flex: 1 }}><Text style={styles.brandSmall}>ShiftMate</Text><Text style={styles.title}>Scan roster</Text><Text style={styles.subtitle}>Read, review and save only the shifts you want.</Text></View>
          <Pressable testID="scan-payslip-btn" onPress={() => router.push("/payslip")} style={styles.payslipShortcut}>
            <Icon name="receipt-outline" size={17} color={colors.brand} />
            <Text style={styles.payslipShortcutText}>Payslip</Text>
          </Pressable>
        </View>

        <View style={styles.progressCard}>
          {["Choose", "Read", "Review"].map((label, index) => {
            const step = index + 1; const active = currentStep >= step;
            return <View key={label} style={styles.progressItem}><View style={[styles.stepCircle, active && styles.stepCircleActive]}>{currentStep > step ? <Icon name="checkmark" size={13} color={colors.onBrandPrimary} /> : <Text style={[styles.stepNumber, active && styles.stepNumberActive]}>{step}</Text>}</View><Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text></View>;
          })}
        </View>

        {!imageUri ? (
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}><Icon name="scan-outline" size={30} color={colors.brand} /></View>
            <Text style={styles.heroTitle}>Choose your roster</Text>
            <Text style={styles.heroText}>Use a straight, clear photo. Sideways photos are rotated before text recognition.</Text>
            <Pressable testID="scan-camera-btn" style={styles.primaryAction} onPress={takePhoto}><Icon name="camera" size={19} color={colors.onBrandPrimary} /><Text style={styles.primaryActionText}>Take a photo</Text></Pressable>
            <Pressable testID="scan-gallery-btn" style={styles.secondaryAction} onPress={pickFromGallery}><Icon name="images-outline" size={19} color={colors.brand} /><Text style={styles.secondaryActionText}>Choose from photos</Text></Pressable>
          </View>
        ) : (
          <View style={styles.imageCard}>
            <View style={styles.cardHeader}><View><Text style={styles.eyebrow}>ROSTER IMAGE</Text><Text style={styles.cardTitle}>{parsing ? "Reading on this phone…" : "Ready to review"}</Text></View><Pressable testID="scan-reset-btn" onPress={() => { setImageUri(null); setParsed([]); setScanId(null); setScanWarnings([]); setError(null); }} style={styles.changeButton}><Icon name="refresh" size={14} color={colors.brand} /><Text style={styles.changeText}>Change</Text></Pressable></View>
            <Image source={{ uri: imageUri }} style={styles.preview} />
          </View>
        )}

        {parsing ? <View style={styles.noticeCard}><ActivityIndicator color={colors.brand} /><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>Reading your roster</Text><Text style={styles.noticeText}>Finding your name, dates, times and house.</Text></View></View> : null}
        {error ? <View style={[styles.noticeCard, { backgroundColor: colors.errorSurface, borderColor: colors.error }]}><Icon name="alert-circle" size={18} color={colors.error} /><Text style={[styles.noticeText, { color: colors.onErrorSurface, flex: 1 }]}>{error}</Text></View> : null}
        {scanWarnings.length ? <View style={[styles.noticeCard, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}><Icon name="warning-outline" size={18} color={colors.warning} /><View style={{ flex: 1 }}><Text style={[styles.noticeTitle, { color: colors.onWarningSurface }]}>Check these scan notes</Text>{scanWarnings.map((warning, i) => <Text key={i} style={[styles.noticeText, { color: colors.onWarningSurface }]}>{warning}</Text>)}</View></View> : null}

        {parsed.length && !parsing ? (
          <>
            <View style={styles.reviewHeader}><View><Text style={styles.eyebrow}>REVIEW SHIFTS</Text><Text style={styles.reviewTitle}>{parsed.length} roster entr{parsed.length === 1 ? "y" : "ies"} found</Text></View><View style={styles.selectedPill}><Text style={styles.selectedCount}>{selectedCount}</Text><Text style={styles.selectedText}>selected</Text></View></View>
            {parsed.map((shift, i) => (
              <View key={i} style={[styles.shiftCard, shift.selected && styles.shiftCardSelected, shift.kind !== "shift" && styles.shiftCardMuted]}>
                <Pressable onPress={() => toggle(i)} disabled={shift.kind !== "shift"} style={[styles.selectCircle, shift.selected && styles.selectCircleActive]}>
                  <Icon name={shift.kind !== "shift" ? "information-circle-outline" : shift.selected ? "checkmark" : "ellipse-outline"} size={18} color={shift.kind !== "shift" ? colors.muted : shift.selected ? colors.onBrandPrimary : colors.brand} />
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {shift.kind === "shift" ? (
                    <>
                      <View style={styles.dateRow}><Text style={styles.weekday}>{fmtWeekday(shift.date, true).toUpperCase()}</Text><TextInput value={shift.dateInput} onChangeText={(value) => updateParsedDate(i, value)} style={[styles.dateInput, !parseDMY(shift.dateInput) && styles.invalid]} keyboardType="numbers-and-punctuation" maxLength={10} /><View style={styles.confidencePill}><Text style={styles.confidenceText}>{Math.round(shift.confidence * 100)}%</Text></View></View>
                      <Text style={styles.fieldLabel}>SHIFT TIME</Text>
                      <View style={styles.timeRow}><TextInput value={shift.start_time} onChangeText={(value) => updateParsedTime(i, "start_time", value)} style={[styles.timeInput, !validTime(shift.start_time) && styles.invalid]} keyboardType="numbers-and-punctuation" maxLength={5} /><Icon name="arrow-forward" size={16} color={colors.brand} /><TextInput value={shift.end_time} onChangeText={(value) => updateParsedTime(i, "end_time", value)} style={[styles.timeInput, !validTime(shift.end_time) && styles.invalid]} keyboardType="numbers-and-punctuation" maxLength={5} /></View>
                      {houses.length ? <><Text style={styles.fieldLabel}>HOUSE</Text><View style={styles.houseRow}>{houses.map((house) => <Pressable key={house.id} onPress={() => updateParsedHouse(i, house)} style={[styles.housePill, shift.house_id === house.id && styles.housePillActive]}><Icon name="home" size={11} color={shift.house_id === house.id ? colors.brand : colors.muted} /><Text style={[styles.houseText, shift.house_id === house.id && styles.houseTextActive]}>{house.name}</Text></Pressable>)}</View></> : <Text style={styles.rawText}>{shift.house_name || "Default house"}</Text>}
                    </>
                  ) : <><Text style={styles.weekday}>{fmtWeekday(shift.date, true).toUpperCase()} · {fmtDMY(shift.date)}</Text><Text style={styles.nonShift}>{shift.kind === "off" ? "R/O" : shift.kind === "leave" ? "LEAVE" : "CHECK THIS CELL"}</Text><Text style={styles.rawText}>{shift.raw_text}</Text></>}
                  {shift.warnings.map((warning, wi) => <Text key={wi} style={styles.warningText}>{warning}</Text>)}
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      {parsed.length && !parsing ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) + 10 }]}>
          <View><Text style={styles.footerCount}>{selectedCount}</Text><Text style={styles.footerLabel}>selected</Text></View>
          <Pressable testID="scan-save-btn" style={[styles.saveButton, !selectedCount && { opacity: 0.4 }]} onPress={saveSelected} disabled={savingCount > 0 || !selectedCount}>{savingCount ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Icon name="calendar" size={17} color={colors.onBrandPrimary} /><Text style={styles.saveButtonText}>Save to calendar</Text></>}</Pressable>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 20 },
    logoMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] },
    brandSmall: { fontFamily: fonts.textBold, ...typeScale.eyebrow, color: colors.brand },
    title: { fontFamily: fonts.displayBold, ...typeScale.screenTitle, color: colors.onSurface },
    subtitle: { fontFamily: fonts.text, ...typeScale.bodySmall, color: colors.muted, marginTop: 2 },
    payslipShortcut: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 8 },
    payslipShortcutText: { fontFamily: fonts.textBold, ...typeScale.action, color: colors.onBrandTertiary },
    progressCard: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 12, marginBottom: 14 },
    progressItem: { flex: 1, alignItems: "center", gap: 5 },
    stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
    stepCircleActive: { backgroundColor: colors.brand },
    stepNumber: { fontFamily: fonts.textBold, ...typeScale.micro, color: colors.muted },
    stepNumberActive: { color: colors.onBrandPrimary },
    stepLabel: { fontFamily: fonts.textMedium, ...typeScale.micro, color: colors.muted },
    stepLabelActive: { color: colors.onSurface, fontWeight: "900" },
    heroCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 22, alignItems: "center" },
    heroIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    heroTitle: { fontFamily: fonts.displayBold, ...typeScale.sectionTitle, color: colors.onSurface, marginTop: 12 },
    heroText: { fontFamily: fonts.text, ...typeScale.bodySmall, color: colors.muted, textAlign: "center", marginTop: 4, marginBottom: 16 },
    primaryAction: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.brand, borderRadius: 13, paddingVertical: 13 },
    primaryActionText: { fontFamily: fonts.textBold, ...typeScale.button, color: colors.onBrandPrimary },
    secondaryAction: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.brandTertiary, borderRadius: 13, paddingVertical: 13, marginTop: 8 },
    secondaryActionText: { fontFamily: fonts.textBold, ...typeScale.button, color: colors.onBrandTertiary },
    imageCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 13 },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    eyebrow: { fontFamily: fonts.textBold, ...typeScale.eyebrow, color: colors.brand },
    cardTitle: { fontFamily: fonts.displayBold, ...typeScale.cardTitle, color: colors.onSurface, marginTop: 2 },
    changeButton: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 6 },
    changeText: { fontFamily: fonts.textBold, ...typeScale.action, color: colors.onBrandTertiary },
    preview: { width: "100%", height: 200, borderRadius: 14, resizeMode: "cover" },
    noticeCard: { flexDirection: "row", alignItems: "flex-start", gap: 9, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand, borderRadius: 14, padding: 12, marginTop: 10 },
    noticeTitle: { fontFamily: fonts.textBold, ...typeScale.label, color: colors.onBrandTertiary },
    noticeText: { fontFamily: fonts.text, ...typeScale.bodySmall, color: colors.onBrandTertiary, marginTop: 1 },
    reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 10 },
    reviewTitle: { fontFamily: fonts.displayBold, ...typeScale.sectionTitle, color: colors.onSurface, marginTop: 2 },
    selectedPill: { flexDirection: "row", alignItems: "baseline", gap: 4, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
    selectedCount: { fontFamily: fonts.displayBold, ...typeScale.cardTitle, color: colors.brand },
    selectedText: { fontFamily: fonts.textBold, ...typeScale.micro, color: colors.onBrandTertiary },
    shiftCard: { flexDirection: "row", gap: 11, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, marginBottom: 9 },
    shiftCardSelected: { borderColor: colors.brand, borderWidth: 2 },
    shiftCardMuted: { opacity: 0.7 },
    selectCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
    selectCircleActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    dateRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    weekday: { fontFamily: fonts.textBold, ...typeScale.dateWeekday, color: colors.brand },
    dateInput: { fontFamily: fonts.textMedium, ...typeScale.inputStrong, minWidth: 100, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.onSurface, paddingHorizontal: 8, paddingVertical: 5, textAlign: "center" },
    confidencePill: { marginLeft: "auto", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 4 },
    confidenceText: { fontFamily: fonts.textBold, ...typeScale.micro, color: colors.muted },
    fieldLabel: { fontFamily: fonts.textBold, ...typeScale.eyebrow, color: colors.muted, marginTop: 11, marginBottom: 5 },
    timeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    timeInput: { fontFamily: fonts.displayBold, ...typeScale.statValue, minWidth: 76, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.onSurface, paddingHorizontal: 8, paddingVertical: 7, textAlign: "center" },
    invalid: { borderColor: colors.error },
    houseRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
    housePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 5 },
    housePillActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
    houseText: { fontFamily: fonts.textMedium, ...typeScale.badge, color: colors.muted },
    houseTextActive: { color: colors.onBrandTertiary, fontWeight: "900" },
    nonShift: { fontFamily: fonts.textBold, ...typeScale.itemTitle, color: colors.onSurface, marginTop: 4 },
    rawText: { fontFamily: fonts.text, ...typeScale.bodySmall, color: colors.muted, marginTop: 3 },
    warningText: { fontFamily: fonts.text, ...typeScale.caption, color: colors.warning, marginTop: 3 },
    footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 15, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: 10 },
    footerCount: { fontFamily: fonts.displayBold, ...typeScale.sectionTitle, color: colors.brand, textAlign: "center" },
    footerLabel: { fontFamily: fonts.textBold, ...typeScale.micro, color: colors.muted },
    saveButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.brand, borderRadius: 13, paddingVertical: 13 },
    saveButtonText: { fontFamily: fonts.textBold, ...typeScale.button, color: colors.onBrandPrimary },
  });
}
