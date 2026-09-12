import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";
import { api, House, Profile, Shift } from "@/src/api";
import { useTheme, radius, type Palette, type ClockFormat } from "@/src/theme";
import { Pressable } from "@/src/components/FeedbackPressable";
import { alarmClockTime, formatClockTime, formatLeadHours, fmtDMY, parseDMY, todayIso } from "@/src/timeUtils";
import { formatHoursDelta, totalDelta, latestEditPhase } from "@/src/shiftUtils";
import InlineDatePicker from "@/src/components/InlineDatePicker";
import InlineTimePicker from "@/src/components/InlineTimePicker";
import { cancelShiftAlarm, scheduleShiftAlarm, ensureShiftAlarmPermissions } from "@/src/notifications";
import { recognizeShiftSpeech } from "@/modules/shiftmate-android/src";
import { parseVoiceShift } from "@/src/voiceShiftParser";

function isValidTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}
function isValidDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }

function ManualTimeInput({ value, onChange, testID, colors, clockFormat }: {
  value: string; onChange: (value: string) => void; testID: string; colors: Palette; clockFormat: ClockFormat;
}) {
  const [storedHours = "00", storedMinutes = "00"] = value.split(":");
  const hour24 = Math.min(23, Math.max(0, Number(storedHours) || 0));
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const [hourText, setHourText] = useState(clockFormat === "12h" ? String(hour24 % 12 || 12) : storedHours);
  const [minuteText, setMinuteText] = useState(storedMinutes);

  useEffect(() => {
    const [h = "00", m = "00"] = value.split(":");
    const n = Math.min(23, Math.max(0, Number(h) || 0));
    setHourText(clockFormat === "12h" ? String(n % 12 || 12) : h);
    setMinuteText(m);
  }, [value, clockFormat]);

  const commitHour = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    if (!digits) {
      setHourText(clockFormat === "12h" ? String(hour24 % 12 || 12) : storedHours);
      return;
    }
    const n = Number(digits);
    if (clockFormat === "24h") {
      if (n > 23) { setHourText(storedHours); return; }
      const normalized = String(n).padStart(2, "0");
      setHourText(normalized);
      onChange(`${normalized}:${storedMinutes}`);
      return;
    }
    if (n < 1 || n > 12) { setHourText(String(hour24 % 12 || 12)); return; }
    const h24 = (n % 12) + (period === "PM" ? 12 : 0);
    setHourText(String(n));
    onChange(`${String(h24).padStart(2, "0")}:${storedMinutes}`);
  };

  const commitMinute = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    if (!digits) { setMinuteText(storedMinutes); return; }
    const n = Number(digits);
    if (n > 59) { setMinuteText(storedMinutes); return; }
    const normalized = String(n).padStart(2, "0");
    setMinuteText(normalized);
    onChange(`${storedHours}:${normalized}`);
  };

  const updateHour = (raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, 2);
    setHourText(next);
    if (next.length === 2) commitHour(next);
  };
  const updateMinute = (raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, 2);
    setMinuteText(next);
    if (next.length === 2) commitMinute(next);
  };
  const changePeriod = (next: "AM" | "PM") => {
    let h = hour24;
    if (next === "AM" && h >= 12) h -= 12;
    if (next === "PM" && h < 12) h += 12;
    onChange(`${String(h).padStart(2, "0")}:${storedMinutes}`);
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 7 }} testID={testID}>
        <TextInput value={hourText} onChangeText={updateHour} onBlur={() => commitHour(hourText)} keyboardType="number-pad" maxLength={2} selectTextOnFocus style={{ flex: 1, color: colors.onSurface, fontSize: 22, fontWeight: "900", textAlign: "center", paddingVertical: 12 }} />
        <Text style={{ color: colors.brand, fontSize: 22, fontWeight: "900" }}>:</Text>
        <TextInput value={minuteText} onChangeText={updateMinute} onBlur={() => commitMinute(minuteText)} keyboardType="number-pad" maxLength={2} selectTextOnFocus style={{ flex: 1, color: colors.onSurface, fontSize: 22, fontWeight: "900", textAlign: "center", paddingVertical: 12 }} />
      </View>
      {clockFormat === "12h" ? <View style={{ flexDirection: "row", gap: 5, marginTop: 5 }}>{(["AM", "PM"] as const).map((p) => <Pressable key={p} onPress={() => changePeriod(p)} style={{ flex: 1, alignItems: "center", paddingVertical: 5, borderRadius: 999, backgroundColor: period === p ? colors.brandTertiary : colors.surface }}><Text style={{ color: period === p ? colors.brand : colors.muted, fontSize: 10, fontWeight: "800" }}>{p}</Text></Pressable>)}</View> : null}
    </View>
  );
}

export default function ShiftDetail() {
  const { colors, clockFormat } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; date?: string; mode?: string }>();
  const isNew = params.id === "new";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(params.date || todayIso());
  const [dateInput, setDateInput] = useState(fmtDMY(params.date || todayIso()));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [houseId, setHouseId] = useState<string | null>(null);
  const [alarmOn, setAlarmOn] = useState(true);
  const [notes, setNotes] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState<"start" | "end" | null>(null);
  const [typeStart, setTypeStart] = useState(true);
  const [typeEnd, setTypeEnd] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, h] = await Promise.all([api.getProfile(), api.listHouses()]);
      setProfile(p); setHouses(h); setHouseId(p.default_house_id || h[0]?.id || null);
      if (!isNew && params.id) {
        const s = await api.getShift(params.id);
        setShift(s); setDate(s.date); setDateInput(fmtDMY(s.date)); setStart(s.start_time); setEnd(s.end_time);
        const matching = s.house_id || h.find((house) => house.name.trim().toLowerCase() === (s.house_name || s.original_house_name || "").trim().toLowerCase())?.id || null;
        setHouseId(matching); setAlarmOn(s.alarm_enabled); setNotes(s.notes || "");
      }
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, [isNew, params.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (params.mode === "voice" && isNew && !recording && !transcribing) {
      const timer = setTimeout(() => { void startRecording(); }, 400); return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.mode]);
  useEffect(() => { if (isNew && params.date) { setDate(params.date); setDateInput(fmtDMY(params.date)); } }, [params.date, isNew]);

  const currentHouseName = () => houses.find((h) => h.id === houseId)?.name || shift?.house_name || shift?.original_house_name || "";

  const save = async () => {
    const iso = parseDMY(dateInput) || (isValidDate(date) ? date : null);
    if (!iso || !isValidTime(start) || !isValidTime(end)) return setMessage("Enter a valid date and both start and finish times.");
    setSaving(true);
    try {
      if (alarmOn) await ensureShiftAlarmPermissions();
      const houseName = currentHouseName();
      const saved = isNew
        ? await api.addShift({ date: iso, start_time: start, end_time: end, house_id: houseId, house_name: houseName, alarm_enabled: alarmOn, notes, source: params.mode === "voice" ? "voice" : "manual" })
        : shift ? await api.updateShift(shift.id, { date: iso, start_time: start, end_time: end, house_id: houseId, house_name: houseName, alarm_enabled: alarmOn, notes }) : null;
      if (!saved) return;
      if (alarmOn) await scheduleShiftAlarm(saved.id, saved.date, saved.start_time, profile?.alarm_lead_minutes ?? 150, houseName);
      else await cancelShiftAlarm(saved.id);
      router.back();
    } catch (error: any) { setMessage(error?.message || "The shift could not be saved."); }
    finally { setSaving(false); }
  };

  const deleteShift = async () => { if (shift) { await cancelShiftAlarm(shift.id); await api.deleteShift(shift.id); router.back(); } };

  async function startRecording() {
    setMessage(null); setRecording(true); setTranscribing(true);
    try {
      if (Platform.OS !== "android") return setMessage("On-device voice entry is currently available only in the installed Android build.");
      const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) return setMessage("Microphone permission is required for on-device voice entry.");
      const speech = await recognizeShiftSpeech();
      const parsed = [speech.transcript, ...speech.alternatives].map((candidate) => parseVoiceShift(candidate, houses)).sort((a, b) => b.confidence - a.confidence)[0];
      setVoiceTranscript(parsed.transcript);
      if (parsed.date && isValidDate(parsed.date)) { setDate(parsed.date); setDateInput(fmtDMY(parsed.date)); }
      if (parsed.start_time) { setStart(parsed.start_time); setTypeStart(true); }
      if (parsed.end_time) { setEnd(parsed.end_time); setTypeEnd(true); }
      if (parsed.house_id) setHouseId(parsed.house_id);
      if (parsed.warnings.length) setMessage(parsed.warnings.join(" "));
    } catch (e: any) { setMessage(e?.message || "On-device speech recognition failed. No audio was uploaded."); }
    finally { setRecording(false); setTranscribing(false); }
  }

  if (loading) return <View style={[styles.root, styles.center]}><ActivityIndicator color={colors.brand} /></View>;
  const houseName = currentHouseName();
  const delta = shift ? totalDelta(shift) : 0;
  const phase = shift ? latestEditPhase(shift) : null;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable testID="shift-back-btn" onPress={() => router.back()} style={styles.roundButton}><Icon name="chevron-back" size={21} color={colors.brand} /></Pressable>
          <View style={{ flex: 1 }}><Text style={styles.brandSmall}>ShiftMate</Text><Text style={styles.title}>{isNew ? "Add shift" : "Shift details"}</Text></View>
          {!isNew ? <Pressable testID="shift-delete-btn" onPress={deleteShift} style={[styles.roundButton, { backgroundColor: colors.errorSurface }]}><Icon name="trash-outline" size={19} color={colors.error} /></Pressable> : null}
        </View>

        {!isNew ? <View style={styles.summaryCard}><View style={styles.summaryIcon}><Icon name="calendar" size={21} color={colors.brand} /></View><View style={{ flex: 1 }}><Text style={styles.summaryDate}>{fmtDMY(date)}</Text><Text style={styles.summaryTime}>{formatClockTime(start, clockFormat)} – {formatClockTime(end, clockFormat)}</Text>{houseName ? <Text style={styles.summaryHouse}><Icon name="home" size={11} color={colors.brand} /> {houseName}</Text> : null}</View></View> : null}

        <Pressable testID="voice-record-btn" onPress={startRecording} disabled={recording || transcribing} style={styles.voiceCard}>
          <View style={styles.iconCircle}>{transcribing ? <ActivityIndicator size="small" color={colors.brand} /> : <Icon name="mic" size={20} color={colors.brand} />}</View>
          <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{transcribing ? "Listening on this phone…" : "Dictate this shift"}</Text><Text style={styles.help}>Try “Saturday 7 AM to 7 PM at Donilla”.</Text></View><Icon name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
        {message ? <View style={styles.messageCard}><Icon name="information-circle-outline" size={17} color={colors.brand} /><Text style={styles.messageText}>{message}</Text></View> : null}
        {voiceTranscript ? <Text style={styles.transcript}>Heard: {voiceTranscript}</Text> : null}
        {phase && delta !== 0 ? <View style={[styles.changePill, { backgroundColor: delta > 0 ? colors.successSurface : colors.errorSurface }]}><Text style={{ color: delta > 0 ? colors.success : colors.error, fontWeight: "900", fontSize: 11 }}>CHANGED {formatHoursDelta(delta)} · {phase}</Text></View> : null}

        <View style={styles.card}>
          <View style={styles.cardHeading}><View style={styles.iconCircle}><Icon name="calendar-outline" size={18} color={colors.brand} /></View><View><Text style={styles.eyebrow}>DATE</Text><Text style={styles.cardTitle}>When is the shift?</Text></View></View>
          <Pressable testID="shift-date-picker-trigger" onPress={() => setShowDatePicker(true)} style={styles.selector}><Text style={styles.selectorText}>{fmtDMY(date)}</Text><Icon name="chevron-down" size={16} color={colors.brand} /></Pressable>
          <InlineDatePicker visible={showDatePicker} value={date} onChange={(iso) => { setDate(iso); setDateInput(fmtDMY(iso)); }} onClose={() => setShowDatePicker(false)} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}><View style={styles.iconCircle}><Icon name="time-outline" size={18} color={colors.brand} /></View><View><Text style={styles.eyebrow}>HOURS</Text><Text style={styles.cardTitle}>Start and finish</Text></View></View>
          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>START</Text>{typeStart ? <ManualTimeInput testID="shift-start-input" value={start} onChange={setStart} colors={colors} clockFormat={clockFormat} /> : <Pressable onPress={() => setShowTimePicker("start")} style={styles.timePickerButton}><Text style={styles.timePickerText}>{formatClockTime(start, clockFormat)}</Text></Pressable>}<Pressable onPress={() => setTypeStart((v) => !v)}><Text style={styles.switchInputMode}>{typeStart ? "use picker" : "type manually"}</Text></Pressable></View>
            <View style={styles.arrowCircle}><Icon name="arrow-forward" size={16} color={colors.brand} /></View>
            <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>FINISH</Text>{typeEnd ? <ManualTimeInput testID="shift-end-input" value={end} onChange={setEnd} colors={colors} clockFormat={clockFormat} /> : <Pressable onPress={() => setShowTimePicker("end")} style={styles.timePickerButton}><Text style={styles.timePickerText}>{formatClockTime(end, clockFormat)}</Text></Pressable>}<Pressable onPress={() => setTypeEnd((v) => !v)}><Text style={styles.switchInputMode}>{typeEnd ? "use picker" : "type manually"}</Text></Pressable></View>
          </View>
          <InlineTimePicker visible={showTimePicker !== null} value={showTimePicker === "end" ? end : start} onChange={(value) => showTimePicker === "end" ? setEnd(value) : setStart(value)} onClose={() => setShowTimePicker(null)} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}><View style={styles.iconCircle}><Icon name="home-outline" size={18} color={colors.brand} /></View><View><Text style={styles.eyebrow}>HOUSE</Text><Text style={styles.cardTitle}>Where are you working?</Text></View></View>
          <View style={styles.houseWrap}>{houses.length ? houses.map((house) => <Pressable key={house.id} testID={`shift-house-${house.id}`} onPress={() => setHouseId(house.id)} style={[styles.housePill, houseId === house.id && styles.housePillActive]}><Icon name="home" size={12} color={houseId === house.id ? colors.brand : colors.muted} /><Text style={[styles.houseText, houseId === house.id && styles.houseTextActive]}>{house.name}</Text></Pressable>) : <Text style={styles.help}>Add a house in Settings first.</Text>}</View>
        </View>

        <View style={styles.alarmCard}><View style={styles.iconCircle}><Icon name="alarm-outline" size={19} color={colors.brand} /></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Shift alarm</Text><Text style={styles.help}>{alarmOn ? (() => { const a = alarmClockTime(date, start, profile?.alarm_lead_minutes ?? 150); return `${formatClockTime(a.time, clockFormat)}${a.sameDay ? "" : ` on ${a.dateStr}`} · ${formatLeadHours(profile?.alarm_lead_minutes ?? 150)} before`; })() : "Off"}</Text></View><Switch testID="shift-alarm-toggle" value={alarmOn} onValueChange={setAlarmOn} trackColor={{ false: colors.surfaceTertiary, true: colors.brand }} /></View>

        {!isNew && shift?.edits?.length ? <View style={styles.card}><View style={styles.cardHeading}><View style={styles.iconCircle}><Icon name="time-outline" size={18} color={colors.brand} /></View><View style={{ flex: 1 }}><Text style={styles.eyebrow}>CHANGE HISTORY</Text><Text style={styles.cardTitle}>Every saved change</Text></View><View style={styles.countPill}><Text style={styles.countText}>{shift.edits.length}</Text></View></View>
          <View style={styles.historyRow}><View style={styles.historyDot}><Icon name="flag-outline" size={13} color={colors.brand} /></View><View style={{ flex: 1 }}><Text style={styles.historyTitle}>ORIGINAL ROSTERED SHIFT</Text><Text style={styles.historyText}>{fmtDMY(shift.original_date || shift.date)} · {formatClockTime(shift.original_start_time || shift.start_time, clockFormat)}–{formatClockTime(shift.original_end_time || shift.end_time, clockFormat)}</Text><Text style={styles.historyStamp}>{shift.original_house_name || shift.house_name}</Text></View></View>
          {shift.edits.map((edit, index) => <View key={`${edit.changed_at}-${index}`} style={styles.historyRow}><View style={styles.historyDot}><Text style={styles.historyDotText}>{index + 1}</Text></View><View style={{ flex: 1 }}><View style={styles.historyTop}><Text style={styles.historyTitle}>CHANGE {index + 1}</Text><Text style={{ color: edit.hours_delta > 0 ? colors.success : edit.hours_delta < 0 ? colors.error : colors.muted, fontSize: 11, fontWeight: "900" }}>{edit.hours_delta === 0 ? "±0" : formatHoursDelta(edit.hours_delta)}</Text></View><Text style={styles.historyText}>{formatClockTime(edit.previous_start, clockFormat)}–{formatClockTime(edit.previous_end, clockFormat)} → {formatClockTime(edit.new_start, clockFormat)}–{formatClockTime(edit.new_end, clockFormat)}</Text><Text style={styles.historyStamp}>{new Date(edit.changed_at).toLocaleString()} · {edit.phase}</Text></View></View>)}
        </View> : null}

        <View style={styles.card}><View style={styles.cardHeading}><View style={styles.iconCircle}><Icon name="document-text-outline" size={18} color={colors.brand} /></View><View><Text style={styles.eyebrow}>NOTES</Text><Text style={styles.cardTitle}>Anything to remember?</Text></View></View><TextInput testID="shift-notes-input" value={notes} onChangeText={setNotes} multiline textAlignVertical="top" placeholder="Optional notes" placeholderTextColor={colors.muted} style={styles.notesInput} /></View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) + 10 }]}><Pressable testID="shift-save-btn" onPress={save} disabled={saving} style={styles.saveButton}>{saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Icon name="checkmark-circle-outline" size={18} color={colors.onBrandPrimary} /><Text style={styles.saveText}>{isNew ? "Add shift" : "Save changes"}</Text></>}</Pressable></View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface }, center: { alignItems: "center", justifyContent: "center" },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 18 },
    roundButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
    brandSmall: { color: colors.brand, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
    title: { color: colors.onSurface, fontSize: 28, lineHeight: 30, fontWeight: "900", letterSpacing: -0.7 },
    summaryCard: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, marginBottom: 10 },
    summaryIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
    summaryDate: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
    summaryTime: { color: colors.onSurface, fontSize: 20, fontWeight: "900", marginTop: 1 },
    summaryHouse: { color: colors.brand, fontSize: 11, fontWeight: "800", marginTop: 4 },
    voiceCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, marginBottom: 10 },
    iconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 15, marginBottom: 10 },
    cardHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
    eyebrow: { color: colors.brand, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
    cardTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "900", marginTop: 1 },
    help: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
    messageCard: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.brandTertiary, borderRadius: 12, padding: 10, marginBottom: 8 },
    messageText: { color: colors.onBrandTertiary, fontSize: 11, flex: 1 },
    transcript: { color: colors.muted, fontSize: 10, marginHorizontal: 3, marginBottom: 8 },
    changePill: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 9 },
    selector: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 },
    selectorText: { flex: 1, color: colors.onSurface, fontSize: 17, fontWeight: "900" },
    timeRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    fieldLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 5 },
    arrowCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginTop: 17 },
    timePickerButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, minHeight: 53, alignItems: "center", justifyContent: "center" },
    timePickerText: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
    switchInputMode: { color: colors.brand, fontSize: 9, fontWeight: "800", textAlign: "right", marginTop: 4 },
    houseWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    housePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 7 },
    housePillActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
    houseText: { color: colors.muted, fontSize: 11, fontWeight: "700" }, houseTextActive: { color: colors.onBrandTertiary, fontWeight: "900" },
    alarmCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, marginBottom: 10 },
    countPill: { minWidth: 30, height: 30, borderRadius: 15, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }, countText: { color: colors.brand, fontSize: 12, fontWeight: "900" },
    historyRow: { flexDirection: "row", gap: 9, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.divider },
    historyDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    historyDotText: { color: colors.brand, fontSize: 10, fontWeight: "900" },
    historyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    historyTitle: { color: colors.onSurface, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
    historyText: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 3 },
    historyStamp: { color: colors.muted, fontSize: 9, marginTop: 3 },
    notesInput: { minHeight: 86, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.onSurface, fontSize: 13, padding: 11 },
    footer: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: 10 },
    saveButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.brand, borderRadius: 13, paddingVertical: 13 },
    saveText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "900" },
  });
}
