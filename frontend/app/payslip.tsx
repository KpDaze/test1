import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";
import { api, PayslipCompareResponse, PayslipEntry, Shift } from "@/src/api";
import { useTheme, radius, type Palette, fonts, typeScale } from "@/src/theme";
import { Pressable } from "@/src/components/FeedbackPressable";
import { fmtDMY, parseDMY } from "@/src/timeUtils";
import { formatHours, formatHoursDelta, rangeFor, shiftDurationHours } from "@/src/shiftUtils";
import { parseQueenslandGovPayslip, type QueenslandGovPayslip } from "@/src/payslipParser";
import { recognizeRosterImage } from "@/modules/shiftmate-ocr/src";

type QldAdjustmentComparison = {
  date: string;
  paidHours: number;
  recordedHours: number | null;
  delta: number | null;
};

type QldComparison = {
  payslip: QueenslandGovPayslip;
  currentRecordedHours: number | null;
  currentDelta: number | null;
  adjustments: QldAdjustmentComparison[];
  comparedStart: string | null;
  comparedEnd: string | null;
  usedConfiguredCycle: boolean;
};

function sumShiftHours(shifts: Shift[]): number {
  return Math.round(shifts.reduce((sum, shift) => sum + shiftDurationHours(shift.start_time, shift.end_time), 0) * 100) / 100;
}

function parsePastedText(text: string): { entries: PayslipEntry[]; failed: string[] } {
  const entries: PayslipEntry[] = [];
  const failed: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const now = new Date();
  for (const line of lines) {
    const dateMatch = line.match(/(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?|\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) { failed.push(line); continue; }
    let dateStr = dateMatch[0];
    let iso: string | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) iso = dateStr;
    else {
      if (!/[\/\-.]\d{2,4}$/.test(dateStr) || /^\d{1,2}[\/\-.]\d{1,2}$/.test(dateStr)) dateStr = `${dateStr}/${now.getFullYear()}`;
      iso = parseDMY(dateStr);
    }
    if (!iso) { failed.push(line); continue; }
    const rest = line.slice((dateMatch.index ?? 0) + dateMatch[0].length);
    let hours: number | null = null;
    const hm = rest.match(/(\d+)\s*h(?:ours?)?\s*(\d+)?\s*m?/i);
    const colon = rest.match(/(\d{1,2}):(\d{2})/);
    const decimal = rest.match(/(\d+(?:\.\d+)?)\s*h?/);
    if (hm) hours = Number(hm[1]) + Number(hm[2] || 0) / 60;
    else if (colon) hours = Number(colon[1]) + Number(colon[2]) / 60;
    else if (decimal) hours = Number(decimal[1]);
    if (hours === null || !Number.isFinite(hours) || hours < 0 || hours > 24) { failed.push(line); continue; }
    entries.push({ date: iso, paid_hours: Math.round(hours * 100) / 100 });
  }
  return { entries, failed };
}

export default function PayslipScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [pasted, setPasted] = useState("");
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<PayslipCompareResponse | null>(null);
  const [qldResult, setQldResult] = useState<QldComparison | null>(null);
  const [failedLines, setFailedLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const clear = () => { setPasted(""); setResult(null); setQldResult(null); setFailedLines([]); setError(null); };

  const runCompare = async () => {
    setError(null); setResult(null); setQldResult(null); setFailedLines([]);
    const { entries, failed } = parsePastedText(pasted);
    if (!entries.length) return setError("Couldn't read any date/hours pairs. Try one per line like 15/03/2026 8h.");
    setFailedLines(failed); setComparing(true);
    try { setResult(await api.payslipCompare(entries)); }
    catch (e: any) { setError(e?.message || "Comparison failed."); }
    finally { setComparing(false); }
  };

  const processQueenslandPayslip = async (payslip: QueenslandGovPayslip) => {
    const [allShifts, profile] = await Promise.all([api.listShifts(), api.getProfile()]);
    let currentRecordedHours: number | null = null;
    let currentDelta: number | null = null;
    let comparedStart = payslip.payPeriodStart;
    let comparedEnd = payslip.payPeriodEnd;
    let usedConfiguredCycle = false;

    if (payslip.payPeriodStart && payslip.payPeriodEnd) {
      let periodShifts = allShifts.filter((shift) => shift.date >= payslip.payPeriodStart! && shift.date <= payslip.payPeriodEnd!);
      if (!periodShifts.length) {
        const configured = rangeFor(profile.pay_period_type ?? "fortnight", payslip.payPeriodStart, {
          weekStartDow: profile.pay_week_start_dow,
          fortnightAnchor: profile.pay_fortnight_anchor ?? null,
        });
        const configuredShifts = allShifts.filter((shift) => shift.date >= configured.start && shift.date <= configured.endInclusive);
        if (configuredShifts.length) {
          periodShifts = configuredShifts;
          comparedStart = configured.start;
          comparedEnd = configured.endInclusive;
          usedConfiguredCycle = configured.start !== payslip.payPeriodStart || configured.endInclusive !== payslip.payPeriodEnd;
        }
      }
      if (periodShifts.length) {
        currentRecordedHours = sumShiftHours(periodShifts);
        if (payslip.currentPaidHours !== null) currentDelta = Math.round((payslip.currentPaidHours - currentRecordedHours) * 100) / 100;
      }
    }

    const adjustments = payslip.adjustmentEntries.map((entry): QldAdjustmentComparison => {
      const matching = allShifts.filter((shift) => shift.date === entry.date);
      if (!matching.length) return { date: entry.date, paidHours: entry.paid_hours, recordedHours: null, delta: null };
      const recordedHours = sumShiftHours(matching);
      return { date: entry.date, paidHours: entry.paid_hours, recordedHours, delta: Math.round((entry.paid_hours - recordedHours) * 100) / 100 };
    });

    setQldResult({ payslip, currentRecordedHours, currentDelta, adjustments, comparedStart, comparedEnd, usedConfiguredCycle });
  };

  const processPayslipImage = async (uri: string) => {
    setError(null); setResult(null); setQldResult(null); setFailedLines([]); setComparing(true);
    try {
      const ocr = await recognizeRosterImage(uri);
      const qld = parseQueenslandGovPayslip(ocr.text);
      if (qld.detected) { setPasted(""); await processQueenslandPayslip(qld); return; }
      const parsed = parsePastedText(ocr.text);
      if (!parsed.entries.length) return setError("The photo was readable, but ShiftMate couldn't find paid dates and hours in this payslip layout yet.");
      setPasted(parsed.entries.map((entry) => `${fmtDMY(entry.date)} ${entry.paid_hours}h`).join("\n"));
      setResult(await api.payslipCompare(parsed.entries));
      setFailedLines(parsed.failed);
    } catch (e: any) { setError(`Photo scan failed: ${e?.message || String(e)}`); }
    finally { setComparing(false); }
  };

  const choosePayslipPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError("Photo library permission denied.");
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (!res.canceled && res.assets?.[0]) await processPayslipImage(res.assets[0].uri);
  };
  const takePayslipPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError("Camera permission denied.");
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (!res.canceled && res.assets?.[0]) await processPayslipImage(res.assets[0].uri);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: insets.bottom + 80 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable testID="payslip-back-btn" onPress={() => router.back()} style={styles.roundButton}><Icon name="chevron-back" size={21} color={colors.brand} /></Pressable>
          <View style={{ flex: 1 }}><Text style={styles.brandSmall}>ShiftMate</Text><Text style={styles.title}>Payslip compare</Text></View>
          <View style={styles.logoMark}><Icon name="receipt-outline" size={22} color={colors.brand} /></View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}><Icon name="receipt-outline" size={27} color={colors.brand} /></View>
          <View style={{ flex: 1 }}><Text style={styles.heroTitle}>Check your pay against your shifts</Text><Text style={styles.heroText}>Queensland Government pay advice is recognised automatically and compared with the shifts stored on this phone.</Text></View>
        </View>

        <View style={styles.photoRow}>
          <Pressable testID="payslip-camera-btn" style={styles.actionButton} onPress={takePayslipPhoto} disabled={comparing}><Icon name="camera" size={19} color={colors.brand} /><Text style={styles.actionText}>Take photo</Text></Pressable>
          <Pressable testID="payslip-scan-photo-btn" style={styles.actionButton} onPress={choosePayslipPhoto} disabled={comparing}><Icon name="images-outline" size={19} color={colors.brand} /><Text style={styles.actionText}>Choose photo</Text></Pressable>
        </View>

        {comparing ? <View style={styles.noticeCard}><ActivityIndicator color={colors.brand} /><Text style={styles.noticeText}>Reading payslip on this phone…</Text></View> : null}
        {error ? <View style={[styles.noticeCard, { backgroundColor: colors.errorSurface, borderColor: colors.error }]}><Icon name="alert-circle" size={17} color={colors.error} /><Text style={[styles.noticeText, { color: colors.onErrorSurface }]}>{error}</Text></View> : null}

        {qldResult ? (
          <View testID="qld-payslip-result">
            <View style={styles.detectedCard}>
              <View style={styles.checkCircle}><Icon name="checkmark" size={16} color={colors.onBrandPrimary} /></View>
              <View style={{ flex: 1 }}><Text style={styles.detectedTitle}>Queensland Government pay advice</Text>{qldResult.payslip.payPeriodStart && qldResult.payslip.payPeriodEnd ? <Text style={styles.detectedRange}>{fmtDMY(qldResult.payslip.payPeriodStart)} – {fmtDMY(qldResult.payslip.payPeriodEnd)}</Text> : null}</View>
              {qldResult.payslip.summaryWorkHours !== null ? <View style={styles.hoursPill}><Text style={styles.hoursPillText}>{formatHours(qldResult.payslip.summaryWorkHours)}</Text></View> : null}
            </View>

            <View style={styles.sectionHeader}><Icon name="git-compare-outline" size={20} color={colors.brand} /><Text style={styles.sectionTitle}>Current pay period</Text></View>
            <View style={styles.compareCard} testID="qld-current-period">
              <View style={styles.statRow}><View><Text style={styles.statLabel}>PAID ORDINARY HRS</Text><Text style={styles.statValue}>{qldResult.payslip.currentPaidHours === null ? "Not read" : formatHours(qldResult.payslip.currentPaidHours)}</Text></View><Icon name="arrow-forward" size={18} color={colors.muted} /><View style={{ alignItems: "flex-end" }}><Text style={styles.statLabel}>SHIFTMATE RECORDED</Text><Text style={styles.statValue}>{qldResult.currentRecordedHours === null ? "No exact match" : formatHours(qldResult.currentRecordedHours)}</Text></View></View>
              {qldResult.comparedStart && qldResult.comparedEnd && qldResult.currentRecordedHours !== null ? <Text style={styles.comparedRange}>Compared with stored shifts {fmtDMY(qldResult.comparedStart)} – {fmtDMY(qldResult.comparedEnd)}</Text> : null}
              {qldResult.usedConfiguredCycle ? <View style={styles.infoStrip}><Icon name="information-circle-outline" size={15} color={colors.brand} /><Text style={styles.infoText}>No shifts were stored on the exact OCR dates, so ShiftMate used your configured pay cycle containing that payslip start date.</Text></View> : null}
              {qldResult.currentDelta !== null ? <View style={styles.differenceRow}><Text style={styles.differenceLabel}>Difference</Text><Text style={[styles.differenceValue, { color: qldResult.currentDelta > 0 ? colors.success : qldResult.currentDelta < 0 ? colors.error : colors.onSurface }]}>{qldResult.currentDelta === 0 ? "MATCH" : formatHoursDelta(qldResult.currentDelta)}</Text></View> : <Text style={styles.help}>A difference appears once both paid Ordinary Hrs and stored ShiftMate hours can be read for the period.</Text>}
            </View>

            {qldResult.adjustments.length ? <><View style={styles.sectionHeader}><Icon name="time-outline" size={20} color={colors.brand} /><Text style={styles.sectionTitle}>Adjustments to past pays</Text></View>{qldResult.adjustments.map((row) => {
              const matched = row.recordedHours !== null && row.delta !== null;
              const exact = matched && Math.abs(row.delta!) < 0.01;
              return <View key={row.date} style={styles.adjustmentCard}><View style={styles.adjustmentTop}><Text style={styles.adjustmentDate}>{fmtDMY(row.date)}</Text><View style={[styles.statusPill, { backgroundColor: !matched ? colors.surfaceTertiary : exact ? colors.successSurface : row.delta! < 0 ? colors.errorSurface : colors.warningSurface }]}><Text style={[styles.statusText, { color: !matched ? colors.muted : exact ? colors.success : row.delta! < 0 ? colors.error : colors.warning }]}>{!matched ? "NOT COMPARED" : exact ? "MATCH" : formatHoursDelta(row.delta!)}</Text></View></View><View style={styles.miniStats}><View><Text style={styles.statLabel}>PAID</Text><Text style={styles.miniValue}>{formatHours(row.paidHours)}</Text></View><Icon name="git-compare" size={15} color={colors.muted} /><View><Text style={styles.statLabel}>RECORDED</Text><Text style={styles.miniValue}>{row.recordedHours === null ? "—" : formatHours(row.recordedHours)}</Text></View></View></View>;
            })}</> : null}

            {qldResult.payslip.warnings.length ? <View style={[styles.noticeCard, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}><Icon name="warning-outline" size={17} color={colors.warning} /><View style={{ flex: 1 }}><Text style={[styles.noticeTitle, { color: colors.onWarningSurface }]}>Check the scan</Text>{qldResult.payslip.warnings.map((warning, i) => <Text key={i} style={[styles.noticeText, { color: colors.onWarningSurface }]}>• {warning}</Text>)}</View></View> : null}
            <Pressable testID="qld-payslip-clear" style={styles.clearButton} onPress={clear}><Text style={styles.clearText}>Clear payslip</Text></Pressable>
          </View>
        ) : (
          <>
            <View style={styles.sectionHeader}><Icon name="create-outline" size={20} color={colors.brand} /><Text style={styles.sectionTitle}>Manual comparison</Text></View>
            <View style={styles.manualCard}>
              <Text style={styles.helpNoTop}>Paste one date and paid hours per line, for example 15/03/2026 8h.</Text>
              <TextInput testID="payslip-input" value={pasted} onChangeText={setPasted} placeholder={"15/03/2026 8h\n16/03/2026 6.5\n17/03/2026 4:30"} placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={styles.input} />
              <View style={styles.photoRow}><Pressable testID="payslip-clear-btn" onPress={clear} style={styles.clearHalf}><Text style={styles.clearText}>Clear</Text></Pressable><Pressable testID="payslip-compare-btn" onPress={runCompare} disabled={!pasted.trim() || comparing} style={[styles.primaryHalf, (!pasted.trim() || comparing) && { opacity: 0.4 }]}><Text style={styles.primaryText}>Compare</Text></Pressable></View>
            </View>
          </>
        )}

        {result && !qldResult ? <><View style={styles.sectionHeader}><Icon name="analytics-outline" size={20} color={colors.brand} /><Text style={styles.sectionTitle}>Comparison</Text></View><View style={styles.compareCard} testID="payslip-summary"><View style={styles.statRow}><View><Text style={styles.statLabel}>PAID TOTAL</Text><Text style={styles.statValue}>{formatHours(result.total_paid)}</Text></View><View style={{ alignItems: "center" }}><Text style={styles.statLabel}>DIFFERENCE</Text><Text style={[styles.statValue, { color: result.total_delta > 0 ? colors.success : result.total_delta < 0 ? colors.error : colors.onSurface }]}>{result.total_delta === 0 ? "±0h" : formatHoursDelta(result.total_delta)}</Text></View><View style={{ alignItems: "flex-end" }}><Text style={styles.statLabel}>RECORDED</Text><Text style={styles.statValue}>{formatHours(result.total_recorded)}</Text></View></View></View>{result.results.map((row) => <View key={row.date} style={styles.adjustmentCard}><View style={styles.adjustmentTop}><Text style={styles.adjustmentDate}>{fmtDMY(row.date)}</Text><View style={[styles.statusPill, { backgroundColor: row.match ? colors.successSurface : row.delta < 0 ? colors.errorSurface : colors.warningSurface }]}><Text style={[styles.statusText, { color: row.match ? colors.success : row.delta < 0 ? colors.error : colors.warning }]}>{row.match ? "MATCH" : formatHoursDelta(row.delta)}</Text></View></View><View style={styles.miniStats}><View><Text style={styles.statLabel}>PAID</Text><Text style={styles.miniValue}>{formatHours(row.paid_hours)}</Text></View><Icon name="git-compare" size={15} color={colors.muted} /><View><Text style={styles.statLabel}>RECORDED</Text><Text style={styles.miniValue}>{formatHours(row.recorded_hours)}</Text></View></View></View>)}{failedLines.length ? <View style={[styles.noticeCard, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}><Text style={[styles.noticeText, { color: colors.onWarningSurface }]}>{failedLines.length} line{failedLines.length === 1 ? "" : "s"} could not be read.</Text></View> : null}</> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 18 },
    roundButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    logoMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-6deg" }] },
    brandSmall: { fontFamily: fonts.textBold, ...typeScale.eyebrow, color: colors.brand },
    title: { fontFamily: fonts.displayBold, ...typeScale.screenTitle, color: colors.onSurface },
    heroCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 15, marginBottom: 10 },
    heroIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    heroTitle: { fontFamily: fonts.textBold, ...typeScale.itemTitle, color: colors.onSurface },
    heroText: { fontFamily: fonts.text, ...typeScale.caption, color: colors.muted, marginTop: 2 },
    photoRow: { flexDirection: "row", gap: 8, marginTop: 8 },
    actionButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brandTertiary, borderRadius: 13, paddingVertical: 12 },
    actionText: { fontFamily: fonts.textBold, ...typeScale.action, color: colors.onBrandTertiary },
    noticeCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand, borderRadius: 13, padding: 11, marginTop: 10 },
    noticeTitle: { fontFamily: fonts.textBold, ...typeScale.label, color: colors.onBrandTertiary },
    noticeText: { fontFamily: fonts.text, ...typeScale.caption, color: colors.onBrandTertiary, flex: 1 },
    detectedCard: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand, borderRadius: 16, padding: 12, marginTop: 12 },
    checkCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
    detectedTitle: { fontFamily: fonts.textBold, ...typeScale.itemTitle, color: colors.onBrandTertiary },
    detectedRange: { fontFamily: fonts.text, ...typeScale.caption, color: colors.onBrandTertiary, opacity: 0.76, marginTop: 2 },
    hoursPill: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5 },
    hoursPillText: { fontFamily: fonts.textBold, ...typeScale.label, color: colors.brand },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 20, marginBottom: 8 },
    sectionTitle: { fontFamily: fonts.displayBold, ...typeScale.sectionTitleCompact, color: colors.onSurface },
    compareCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 15 },
    statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    statLabel: { fontFamily: fonts.textBold, ...typeScale.micro, color: colors.muted },
    statValue: { fontFamily: fonts.displayBold, ...typeScale.shiftTime, color: colors.onSurface, marginTop: 3 },
    comparedRange: { fontFamily: fonts.text, ...typeScale.micro, color: colors.muted, marginTop: 10 },
    infoStrip: { flexDirection: "row", gap: 5, backgroundColor: colors.brandTertiary, borderRadius: 10, padding: 8, marginTop: 8 },
    infoText: { fontFamily: fonts.text, ...typeScale.micro, color: colors.onBrandTertiary, flex: 1 },
    differenceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 12, paddingTop: 12 },
    differenceLabel: { fontFamily: fonts.textBold, ...typeScale.label, color: colors.onSurfaceSecondary },
    differenceValue: { fontFamily: fonts.displayBold, ...typeScale.statValue },
    help: { fontFamily: fonts.text, ...typeScale.caption, color: colors.muted, marginTop: 10 },
    helpNoTop: { fontFamily: fonts.text, ...typeScale.caption, color: colors.muted },
    adjustmentCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 15, padding: 12, marginBottom: 8 },
    adjustmentTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    adjustmentDate: { fontFamily: fonts.textBold, ...typeScale.itemTitle, color: colors.onSurface },
    statusPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
    statusText: { fontFamily: fonts.textBold, ...typeScale.micro },
    miniStats: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginTop: 10 },
    miniValue: { fontFamily: fonts.displayBold, ...typeScale.cardTitle, color: colors.onSurface, marginTop: 2 },
    clearButton: { alignItems: "center", backgroundColor: colors.brandTertiary, borderRadius: 12, paddingVertical: 11, marginTop: 10 },
    clearText: { fontFamily: fonts.textBold, ...typeScale.action, color: colors.onBrandTertiary },
    manualCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14 },
    input: { minHeight: 120, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.onSurface, fontSize: 13, padding: 11, marginTop: 9, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },
    clearHalf: { flex: 1, alignItems: "center", backgroundColor: colors.brandTertiary, borderRadius: 12, paddingVertical: 11 },
    primaryHalf: { flex: 1, alignItems: "center", backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 11 },
    primaryText: { fontFamily: fonts.textBold, ...typeScale.action, color: colors.onBrandPrimary },
  });
}
