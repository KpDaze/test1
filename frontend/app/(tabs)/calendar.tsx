import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, PanResponder, Alert } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";
import { api, Shift, Profile } from "@/src/api";
import { spacing, radius, type Palette, fonts, typeScale } from "@/src/theme";
import { useDesignSystem } from "@/src/designSystem";
import { Pressable } from "@/src/components/FeedbackPressable";
import { alarmClockTime, formatClockTime, fmtDMY, fmtWeekday } from "@/src/timeUtils";
import { rangeFor, shiftDurationHours, formatHours } from "@/src/shiftUtils";
import { cancelShiftAlarm } from "@/src/notifications";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function isNightShift(shift: Shift) {
  const [sh, sm] = shift.start_time.split(":").map(Number);
  const [eh, em] = shift.end_time.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return start >= 18 * 60 || end <= start;
}

export default function CalendarScreen() {
  const { colors, clockFormat, colorTheme, effective, visual } = useDesignSystem();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const useMockupLight = colorTheme === "teal" && effective === "light";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState<string>(ymd(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingFortnight, setDeletingFortnight] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([api.listShifts(monthKey(cursor)), api.getProfile()]);
      setShifts(s);
      setProfile(p);
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shiftsByDate = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    for (const s of shifts) (map[s.date] ||= []).push(s);
    return map;
  }, [shifts]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const arr: (string | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) arr.push(null);
    for (let d = 1; d <= last; d++) arr.push(ymd(new Date(cursor.getFullYear(), cursor.getMonth(), d)));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  const changeMonth = useCallback((offset: number) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1);
    const selectedDay = Number(selected.split("-")[2]) || 1;
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    setCursor(next);
    setSelected(ymd(new Date(next.getFullYear(), next.getMonth(), Math.min(selectedDay, lastDay))));
  }, [cursor, selected]);

  const calendarPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, gesture) =>
      Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
    onPanResponderRelease: (_evt, gesture) => {
      if (gesture.dx <= -45) changeMonth(1);
      else if (gesture.dx >= 45) changeMonth(-1);
    },
  }), [changeMonth]);

  const dayShifts = shiftsByDate[selected] || [];
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const selectedFortnight = rangeFor("fortnight", selected, {
    weekStartDow: profile?.pay_week_start_dow,
    fortnightAnchor: profile?.pay_fortnight_anchor ?? null,
  });

  const deleteFortnight = useCallback(async () => {
    if (deletingFortnight) return;
    const range = rangeFor("fortnight", selected, {
      weekStartDow: profile?.pay_week_start_dow,
      fortnightAnchor: profile?.pay_fortnight_anchor ?? null,
    });
    const allShifts = await api.listShifts();
    const inFortnight = allShifts.filter((shift) => shift.date >= range.start && shift.date <= range.endInclusive);
    if (!inFortnight.length) {
      Alert.alert("No shifts in this fortnight", `There are no stored shifts from ${fmtDMY(range.start)} to ${fmtDMY(range.endInclusive)}.`);
      return;
    }
    Alert.alert(
      "Delete full fortnight?",
      `${fmtDMY(range.start)} – ${fmtDMY(range.endInclusive)}\n\nThis will remove ${inFortnight.length} stored shift${inFortnight.length === 1 ? "" : "s"} so you can scan the corrected roster again. Deletion history is kept in ShiftMate.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Delete ${inFortnight.length} shift${inFortnight.length === 1 ? "" : "s"}`,
          style: "destructive",
          onPress: async () => {
            setDeletingFortnight(true);
            try {
              for (const shift of inFortnight) {
                if (shift.alarm_enabled) await cancelShiftAlarm(shift.id);
                await api.deleteShift(shift.id);
              }
              await load();
              Alert.alert("Fortnight cleared", `${inFortnight.length} shift${inFortnight.length === 1 ? "" : "s"} removed. You can scan the corrected roster again.`);
            } catch (error: any) {
              Alert.alert("Could not clear fortnight", error?.message || "One or more shifts could not be removed.");
            } finally {
              setDeletingFortnight(false);
            }
          },
        },
      ],
    );
  }, [deletingFortnight, load, profile?.pay_fortnight_anchor, profile?.pay_week_start_dow, selected]);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandLockup}>
            <View style={styles.logoMark}><Icon name="heart" size={22} color={colors.onBrandPrimary} /></View>
            <View>
              <Text style={styles.brandSmall}>ShiftMate</Text>
              <Text style={styles.screenTitle}>Calendar</Text>
            </View>
          </View>
          <Pressable onPress={() => router.push("/shift/new?date=" + selected)} style={styles.addCircle} testID="calendar-add-shift">
            <Icon name="add" size={24} color={colors.onBrandPrimary} />
          </Pressable>
        </View>

        <View style={styles.calendarCard} {...calendarPanResponder.panHandlers} testID="calendar-swipe-area">
          <View style={styles.monthHeader}>
            <Pressable testID="cal-prev-month" onPress={() => changeMonth(-1)} style={styles.monthArrow} hitSlop={10}>
              <Icon name="chevron-back" size={20} color={colors.brand} />
            </Pressable>
            <View style={styles.monthTitleBlock}>
              <Text style={styles.monthTitle}>{monthLabel}</Text>
              <Text style={styles.swipeHint}>Swipe to change month</Text>
            </View>
            <Pressable testID="cal-next-month" onPress={() => changeMonth(1)} style={styles.monthArrow} hitSlop={10}>
              <Icon name="chevron-forward" size={20} color={colors.brand} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <Text key={i} style={styles.weekDay}>{d}</Text>)}
          </View>
          <View style={styles.grid}>
            {cells.map((d, i) => d === null ? <View key={i} style={styles.cell} /> : (
              <Pressable key={d} testID={`cal-day-${d}`} onPress={() => setSelected(d)} style={styles.cell}>
                <View style={[styles.dayCircle, selected === d && styles.dayCircleSelected]}>
                  <Text style={[styles.cellText, selected === d && styles.cellTextSelected]}>{parseInt(d.split("-")[2], 10)}</Text>
                </View>
                {shiftsByDate[d]?.length ? <View style={[styles.dot, selected === d && styles.dotSelected]} /> : null}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.eyebrow}>SELECTED DAY</Text>
            <Text style={styles.selectedTitle}>{fmtWeekday(selected)}</Text>
            <Text style={styles.selectedDate}>{fmtDMY(selected)}</Text>
          </View>
          {dayShifts.length ? <View style={styles.countPill}><Text style={styles.countText}>{dayShifts.length} shift{dayShifts.length === 1 ? "" : "s"}</Text></View> : null}
        </View>

        {profile?.pay_period_type === "fortnight" ? (
          <View style={styles.fortnightCard} testID="calendar-fortnight-manager">
            <View style={styles.fortnightIcon}><Icon name="calendar-number-outline" size={20} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fortnightLabel}>PAY FORTNIGHT</Text>
              <Text style={styles.fortnightRange}>{fmtDMY(selectedFortnight.start)} – {fmtDMY(selectedFortnight.endInclusive)}</Text>
              <Text style={styles.fortnightHint}>Wrong roster? Clear this whole fortnight and scan it again.</Text>
            </View>
            <Pressable testID="delete-selected-fortnight" onPress={deleteFortnight} disabled={deletingFortnight} style={styles.deleteButton}>
              {deletingFortnight ? <ActivityIndicator size="small" color={colors.error} /> : <Icon name="trash-outline" size={18} color={colors.error} />}
            </Pressable>
          </View>
        ) : null}

        {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 30 }} /> : dayShifts.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}><Icon name="calendar-clear-outline" size={25} color={colors.brand} /></View>
            <Text style={styles.emptyTitle}>No shifts this day</Text>
            <Text style={styles.emptyText}>Add one manually if you need to.</Text>
            <Pressable testID="agenda-add-btn" onPress={() => router.push(`/shift/new?date=${selected}`)} style={styles.primaryButton}>
              <Icon name="add" size={16} color={colors.onBrandPrimary} /><Text style={styles.primaryButtonText}>Add shift</Text>
            </Pressable>
          </View>
        ) : dayShifts.map((s) => {
          const night = isNightShift(s);
          const alarm = s.alarm_enabled ? alarmClockTime(s.date, s.start_time, profile?.alarm_lead_minutes ?? 150) : null;
          const shiftSurface = useMockupLight
            ? (night ? visual.nightSurface : visual.daySurface)
            : (night ? colors.brandTertiary : colors.successSurface);
          const shiftAccent = useMockupLight
            ? (night ? visual.nightAccent : visual.dayAccent)
            : (night ? colors.brand : colors.success);
          const houseSurface = useMockupLight ? visual.houseSurface : colors.brandTertiary;
          const houseAccent = useMockupLight ? visual.houseAccent : colors.brand;
          return (
            <Pressable key={s.id} testID={`agenda-shift-${s.id}`} onPress={() => router.push(`/shift/${s.id}`)} style={styles.shiftCard}>
              <View style={styles.shiftTop}>
                <Text style={styles.shiftTime}>{formatClockTime(s.start_time, clockFormat)} – {formatClockTime(s.end_time, clockFormat)}</Text>
                <Text style={styles.duration}>{formatHours(shiftDurationHours(s.start_time, s.end_time))}</Text>
              </View>
              <View style={styles.shiftMeta}>
                <View style={[styles.housePill, { backgroundColor: houseSurface }]}><Icon name="home" size={13} color={houseAccent} /><Text style={[styles.houseText, { color: houseAccent }]} numberOfLines={1}>{s.house_name || "No location"}</Text></View>
                <View style={[styles.kindPill, { backgroundColor: shiftSurface }]}>
                  <Icon name={night ? "moon" : "sunny"} size={11} color={shiftAccent} />
                  <Text style={[styles.kindText, { color: shiftAccent }]}>{night ? "Night" : "Day"}</Text>
                </View>
              </View>
              {alarm ? <View style={styles.alarmRow}><Icon name="alarm-outline" size={13} color={colors.brand} /><Text style={styles.alarmText}>Alarm {formatClockTime(alarm.time, clockFormat)}</Text></View> : null}
              <Icon name="chevron-forward" size={19} color={colors.muted} style={styles.chevron} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
    brandLockup: { flexDirection: "row", alignItems: "center", gap: 11 },
    logoMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] },
    brandSmall: { fontFamily: fonts.textBold, ...typeScale.eyebrow, color: colors.brand },
    screenTitle: { fontFamily: fonts.displayBold, ...typeScale.screenTitle, color: colors.onSurface },
    addCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
    calendarCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 15, marginBottom: 22 },
    monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
    monthArrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    monthTitleBlock: { alignItems: "center" },
    monthTitle: { fontFamily: fonts.displayBold, ...typeScale.statValue, color: colors.onSurface },
    swipeHint: { fontFamily: fonts.text, ...typeScale.caption, color: colors.muted, marginTop: 2 },
    weekRow: { flexDirection: "row", marginBottom: 4 },
    weekDay: { fontFamily: fonts.textBold, ...typeScale.micro, flex: 1, textAlign: "center", color: colors.muted },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", position: "relative" },
    dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    dayCircleSelected: { backgroundColor: colors.brand },
    cellText: { fontFamily: fonts.textMedium, ...typeScale.body, color: colors.onSurfaceSecondary },
    cellTextSelected: { color: colors.onBrandPrimary, fontWeight: "900" },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.brand, position: "absolute", bottom: 3 },
    dotSelected: { backgroundColor: colors.onBrandPrimary },
    sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    eyebrow: { fontFamily: fonts.textBold, ...typeScale.eyebrow, color: colors.brand },
    selectedTitle: { fontFamily: fonts.displayBold, ...typeScale.sectionTitle, color: colors.onSurface, marginTop: 2 },
    selectedDate: { fontFamily: fonts.text, ...typeScale.bodySmall, color: colors.muted, marginTop: 1 },
    countPill: { backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
    countText: { fontFamily: fonts.textBold, ...typeScale.label, color: colors.onBrandTertiary },
    fortnightCard: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 13, marginBottom: 12 },
    fortnightIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    fortnightLabel: { fontFamily: fonts.textBold, ...typeScale.eyebrow, color: colors.brand },
    fortnightRange: { fontFamily: fonts.textBold, ...typeScale.itemTitle, color: colors.onSurface, marginTop: 2 },
    fortnightHint: { fontFamily: fonts.text, ...typeScale.caption, color: colors.muted, marginTop: 2 },
    deleteButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.errorSurface, alignItems: "center", justifyContent: "center" },
    emptyCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 24, alignItems: "center" },
    emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    emptyTitle: { fontFamily: fonts.displayBold, ...typeScale.cardTitle, color: colors.onSurface, marginTop: 9 },
    emptyText: { fontFamily: fonts.text, ...typeScale.bodySmall, color: colors.muted, marginTop: 3 },
    primaryButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, marginTop: 14 },
    primaryButtonText: { fontFamily: fonts.textBold, ...typeScale.action, color: colors.onBrandPrimary },
    shiftCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 15, paddingRight: 38, marginBottom: 10, position: "relative" },
    shiftTop: { flexDirection: "row", alignItems: "center", gap: 8 },
    shiftTime: { fontFamily: fonts.displayBold, ...typeScale.shiftTime, color: colors.onSurface },
    duration: { fontFamily: fonts.textMedium, ...typeScale.duration, color: colors.onSurfaceSecondary, marginLeft: "auto" },
    shiftMeta: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 9 },
    housePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5, maxWidth: "68%" },
    houseText: { fontFamily: fonts.textMedium, ...typeScale.house, color: colors.onBrandTertiary, flexShrink: 1 },
    kindPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 5 },
    kindText: { fontFamily: fonts.textMedium, ...typeScale.badge },
    alarmRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
    alarmText: { fontFamily: fonts.text, ...typeScale.metadata, color: colors.muted },
    chevron: { position: "absolute", right: 12, top: "50%", marginTop: -9 },
  });
}
