import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";
import { api, Shift, Profile, House } from "@/src/api";
import { fonts, typeScale, type Palette } from "@/src/theme";
import { useDesignSystem, layoutTokens, componentTokens } from "@/src/designSystem";
import { Pressable } from "@/src/components/FeedbackPressable";
import { alarmClockTime, formatClockTime, fmtDMY, todayIso } from "@/src/timeUtils";
import {
  earningsFor,
  formatHours,
  formatHoursDelta,
  formatMoney,
  rangeFor,
  resolveShiftHouseName,
  shiftDurationHours,
  totalDelta,
  totalsInRange,
} from "@/src/shiftUtils";

type PayPeriodKind = "week" | "fortnight" | "month";

type HomeLayout = {
  compact: boolean;
  veryCompact: boolean;
};

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function moveByPayPeriod(iso: string, kind: PayPeriodKind, offset: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (kind === "month") {
    dt.setDate(1);
    dt.setMonth(dt.getMonth() + offset);
  } else {
    dt.setDate(dt.getDate() + offset * (kind === "fortnight" ? 14 : 7));
  }
  return isoFromDate(dt);
}

function dateParts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    day: String(d).padStart(2, "0"),
    month: dt.toLocaleDateString("en-AU", { month: "short" }).toUpperCase(),
    weekday: dt.toLocaleDateString("en-AU", { weekday: "short" }).toUpperCase(),
  };
}

function isNightShift(shift: Shift): boolean {
  const start = toMinutes(shift.start_time);
  const end = toMinutes(shift.end_time);
  return start >= 18 * 60 || end <= start;
}

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(name?: string) {
  const first = (name || "").trim().split(/\s+/)[0];
  return first || "there";
}

function initialsFor(name?: string) {
  const bits = (name || "").trim().split(/\s+/).filter(Boolean);
  if (bits.length >= 2) return `${bits[0][0]}${bits[bits.length - 1][0]}`.toUpperCase();
  const first = bits[0] || "";
  return first.slice(0, 2).toUpperCase() || "--";
}

export default function Dashboard() {
  const { colors, clockFormat, exactReference, visual, dateTiles } = useDesignSystem();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const useMockupLight = exactReference;
  const layout = useMemo<HomeLayout>(
    () => ({ compact: width < 400, veryCompact: width < 360 }),
    [width],
  );
  const styles = useMemo(() => makeStyles(colors, visual, useMockupLight, layout), [colors, visual, useMockupLight, layout]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [periodOffset, setPeriodOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      const [p, s, h] = await Promise.all([api.getProfile(), api.listShifts(), api.listHouses()]);
      setProfile(p);
      setShifts(s);
      setHouses(h);
    } catch (error) {
      console.warn(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const wantsHorizontalSwipe = (_evt: unknown, gesture: { dx: number; dy: number }) =>
    Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25;

  const periodPanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: wantsHorizontalSwipe,
      onMoveShouldSetPanResponderCapture: wantsHorizontalSwipe,
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx <= -45) setPeriodOffset((value) => value + 1);
        else if (gesture.dx >= 45) setPeriodOffset((value) => value - 1);
      },
    }),
    [],
  );

  const now = todayIso();
  const nowMin = nowMinutes();
  const upcoming = shifts
    .filter((shift) => shift.date > now || (shift.date === now && toMinutes(shift.end_time) > nowMin))
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))
    .slice(0, 6);

  const payPeriodKind = (profile?.pay_period_type ?? "week") as PayPeriodKind;
  const periodFocus = moveByPayPeriod(now, payPeriodKind, periodOffset);
  const range = rangeFor(payPeriodKind, periodFocus, {
    weekStartDow: profile?.pay_week_start_dow,
    fortnightAnchor: profile?.pay_fortnight_anchor ?? null,
  });
  const totals = totalsInRange(shifts, range.start, range.endInclusive, houses);
  const rangeShifts = shifts.filter((shift) => shift.date >= range.start && shift.date <= range.endInclusive);
  const earnings = earningsFor(rangeShifts, houses);
  const activeHouses = totals.byHouse.filter((row) => row.house !== "No location").length;

  const exactAccent = visual.accent;
  const exactOnAccent = visual.onAccent;
  const changedPositive = visual.dayAccent;
  const changedNegative = visual.danger;
  const daySurface = visual.daySurface;
  const dayAccent = visual.dayAccent;
  const nightSurface = visual.nightSurface;
  const nightAccent = visual.nightAccent;
  const houseSurface = visual.houseSurface;
  const houseAccent = visual.houseAccent;
  const railDayAccent = visual.accent;
  const quoteIconColor = visual.accentMid;

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + styles.safeTop.paddingTop, paddingBottom: insets.bottom + styles.safeBottom.paddingBottom },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={exactAccent}
          />
        }
      >
        <View style={styles.brandRow}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}><Icon name="heart" size={24} color={exactOnAccent} /></View>
            <View style={styles.brandTextBlock}>
              <Text allowFontScaling={false} style={styles.brandName}>
                <Text style={styles.brandNameShift}>Shift</Text>
                <Text style={styles.brandNameMate}>Mate</Text>
              </Text>
              <Text allowFontScaling={false} style={styles.brandTagline}>SUPPORTING BRIGHTER DAYS</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable testID="dashboard-reminders-btn" onPress={() => router.push("/(tabs)/settings")} style={styles.bellButton}>
              <Icon name="notifications-outline" size={styles.iconBell.width as number} color={visual.textStrong} />
            </Pressable>
            <Pressable testID="dashboard-settings-btn" onPress={() => router.push("/(tabs)/settings")} style={styles.initialsCircle}>
              <Text allowFontScaling={false} style={styles.initialsText}>{initialsFor(profile?.name)}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.greetingRow}>
          <View style={styles.greetingBlock}>
            <Text allowFontScaling={false} style={styles.greetingSmall}>{greetingForNow()},</Text>
            <Text allowFontScaling={false} style={styles.greetingName}>{firstName(profile?.name)}</Text>
            <Text allowFontScaling={false} style={styles.greetingSub}>Here’s your upcoming shifts.</Text>
          </View>

          <View style={styles.greetingRight}>
            <Text allowFontScaling={false} style={styles.todayDate}>
              {new Date().toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </Text>
            <View style={styles.quoteCard}>
              <Icon name="sunny-outline" size={styles.iconQuote.width as number} color={quoteIconColor} />
              <Text allowFontScaling={false} style={styles.quoteText}>“Make a difference every shift.”</Text>
            </View>
          </View>
        </View>

        <View style={styles.payCard} testID="totals-card" {...periodPanResponder.panHandlers}>
          <View style={styles.payTopRow}>
            <View style={styles.payTitleWrap}>
              <View style={styles.clockCircle}>
                <Icon name="time-outline" size={styles.iconClock.width as number} color={visual.accentMid} />
              </View>
              <View style={styles.payTitleText}>
                <Text allowFontScaling={false} style={styles.payEyebrow}>THIS PAY PERIOD</Text>
                <Text allowFontScaling={false} style={styles.payRange}>{fmtDMY(range.start)} – {fmtDMY(range.endInclusive)}</Text>
                {periodOffset !== 0 ? (
                  <Pressable testID="totals-current-cycle" onPress={() => setPeriodOffset(0)}>
                    <Text allowFontScaling={false} style={styles.payOffset}>
                      {periodOffset < 0
                        ? `${Math.abs(periodOffset)} pay cycle${Math.abs(periodOffset) === 1 ? "" : "s"} back`
                        : `${periodOffset} pay cycle${periodOffset === 1 ? "" : "s"} ahead`} · tap for current
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <Pressable testID="dashboard-payslip-btn" onPress={() => router.push("/payslip")} style={styles.payslipBtn}>
              <Text allowFontScaling={false} style={styles.payslipBtnText}>Payslips</Text>
              <Icon name="chevron-forward" size={styles.iconPayChevron.width as number} color={visual.accentStrong} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={exactAccent} style={styles.payLoader} />
          ) : (
            <View style={styles.payStats}>
              <View style={styles.statCell}>
                <Text allowFontScaling={false} style={styles.statValue}>{formatHours(totals.totalHours)}</Text>
                <Text allowFontScaling={false} style={styles.statLabel}>Total Hours</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text allowFontScaling={false} style={styles.statValue}>{earnings.total > 0 ? formatMoney(earnings.total) : "—"}</Text>
                <Text allowFontScaling={false} style={styles.statLabel}>Est. Pay</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text allowFontScaling={false} style={styles.statValue}>{totals.count}</Text>
                <Text allowFontScaling={false} style={styles.statLabel}>Shifts</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text allowFontScaling={false} style={styles.statValue}>{activeHouses}</Text>
                <Text allowFontScaling={false} style={styles.statLabel}>Houses</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.upcomingHeader}>
          <View style={styles.upcomingTitleWrap}>
            <Icon name="calendar-outline" size={styles.iconCalendar.width as number} color={visual.accentMid} />
            <Text allowFontScaling={false} style={styles.upcomingTitle}>Upcoming Shifts</Text>
          </View>
          <Pressable onPress={() => router.push("/(tabs)/calendar")} style={styles.seeAllBtn}>
            <Text allowFontScaling={false} style={styles.seeAllText}>See all</Text>
            <Icon name="chevron-forward" size={styles.iconSeeAll.width as number} color={visual.accentStrong} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={exactAccent} style={styles.listLoader} />
        ) : upcoming.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="calendar-clear-outline" size={styles.iconEmpty.width as number} color={exactAccent} />
            <Text allowFontScaling={false} style={styles.emptyTitle}>No upcoming shifts</Text>
            <Text allowFontScaling={false} style={styles.emptyText}>Scan a roster or add a shift when you’re ready.</Text>
            <View style={styles.emptyActions}>
              <Pressable onPress={() => router.push("/(tabs)/scan")} style={styles.emptyPrimary}>
                <Icon name="scan" size={styles.iconSmall.width as number} color={exactOnAccent} />
                <Text allowFontScaling={false} style={styles.emptyPrimaryText}>Scan roster</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/shift/new")} style={styles.emptySecondary}>
                <Text allowFontScaling={false} style={styles.emptySecondaryText}>Add manually</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.timeline}>
            {upcoming.map((shift, index) => {
              const parts = dateParts(shift.date);
              const night = isNightShift(shift);
              const duration = shiftDurationHours(shift.start_time, shift.end_time);
              const delta = totalDelta(shift);
              const houseName = resolveShiftHouseName(shift, houses);
              const alarm = shift.alarm_enabled
                ? alarmClockTime(shift.date, shift.start_time, profile?.alarm_lead_minutes ?? 150)
                : null;
              const dateTone = dateTiles[index % dateTiles.length];
              const note = (shift.notes || "").trim();
              const metadata = [
                note,
                alarm ? `Alarm ${formatClockTime(alarm.time, clockFormat)}` : "",
              ].filter(Boolean).join(" · ");

              return (
                <View key={shift.id} style={styles.shiftRow}>
                  <View style={[styles.dateTile, { backgroundColor: dateTone.surface }]}>
                    <Text allowFontScaling={false} style={styles.dateDay}>{parts.day}</Text>
                    <Text allowFontScaling={false} style={styles.dateMonth}>{parts.month}</Text>
                    <Text allowFontScaling={false} style={[styles.dateWeekday, { color: dateTone.accent }]}>{parts.weekday}</Text>
                  </View>

                  <View style={styles.railColumn}>
                    {index > 0 ? <View style={styles.railTop} /> : null}
                    <View style={[styles.railNode, { backgroundColor: night ? nightAccent : railDayAccent }]} />
                    {index < upcoming.length - 1 ? <View style={styles.railBottom} /> : null}
                  </View>

                  <Pressable testID={`upcoming-shift-${shift.id}`} onPress={() => router.push(`/shift/${shift.id}`)} style={styles.shiftCard}>
                    <View style={styles.shiftTopLine}>
                      <View style={styles.shiftIdentity}>
                        <Text allowFontScaling={false} style={styles.shiftTime} numberOfLines={1}>
                          {formatClockTime(shift.start_time, clockFormat)} – {formatClockTime(shift.end_time, clockFormat)}
                        </Text>
                        <View style={[styles.shiftTypeBadge, { backgroundColor: night ? nightSurface : daySurface }]}>
                          <Icon name={night ? "moon" : "sunny"} size={styles.iconBadge.width as number} color={night ? nightAccent : dayAccent} />
                          <Text allowFontScaling={false} style={[styles.shiftTypeText, { color: night ? nightAccent : dayAccent }]} numberOfLines={1}>
                            {night ? "Night shift" : "Day shift"}
                          </Text>
                        </View>
                      </View>
                      <Text allowFontScaling={false} style={styles.duration}>{formatHours(duration)}</Text>
                    </View>

                    <View style={styles.houseRow}>
                      <View style={[styles.housePill, { backgroundColor: houseSurface }]}>
                        <Icon name="home" size={styles.iconHouse.width as number} color={houseAccent} />
                        <Text allowFontScaling={false} style={[styles.houseText, { color: houseAccent }]} numberOfLines={1}>{houseName}</Text>
                      </View>
                    </View>

                    {metadata || delta !== 0 ? (
                      <View style={styles.cardMetaLine}>
                        {metadata ? (
                          <Text allowFontScaling={false} style={styles.secondaryText} numberOfLines={1}>{metadata}</Text>
                        ) : <View style={styles.secondarySpacer} />}
                        {delta !== 0 ? (
                          <Text allowFontScaling={false} style={[styles.changedText, { color: delta > 0 ? changedPositive : changedNegative }]}>
                            Changed {formatHoursDelta(delta)}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}

                    <Icon name="chevron-forward" size={styles.iconCardChevron.width as number} color={visual.textStrong} style={styles.cardChevron} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: Palette, visual: ReturnType<typeof useDesignSystem>["visual"], useMockupLight: boolean, layout: HomeLayout) {
  const { compact, veryCompact } = layout;
  const page = visual.page;
  const card = visual.card;
  const pale = visual.cardMuted;
  const aqua = visual.accentSurface;
  const text = visual.text;
  const deep = visual.textStrong;
  const muted = visual.muted;
  const teal = visual.accent;
  const activeTeal = visual.accentStrong;
  const border = visual.border;
  const divider = visual.divider;
  const screenPadding = veryCompact ? 16 : 18;
  const railNodeTop = 29;
  const railNodeSize = 11;
  const railCenter = railNodeTop + railNodeSize / 2;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: page },
    safeTop: { paddingTop: 6 },
    safeBottom: { paddingBottom: 28 },
    container: { paddingHorizontal: screenPadding },

    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 52,
      marginBottom: 14,
    },
    brandLockup: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
    brandMark: { width: 44, height: 44, marginRight: 6, borderRadius: 14, backgroundColor: teal, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] },
    brandTextBlock: { flexShrink: 1, justifyContent: "center" },
    brandName: { ...typeScale.wordmark, fontFamily: fonts.displayBold },
    brandNameShift: { color: deep },
    brandNameMate: { color: teal },
    brandTagline: { color: muted, fontFamily: fonts.textBold, fontSize: 7, lineHeight: 9, fontWeight: "800", letterSpacing: 2.05 },
    headerActions: { flexDirection: "row", alignItems: "center", gap: compact ? 4 : 7, marginLeft: 8 },
    bellButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
    initialsCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: aqua,
    },
    initialsText: { color: activeTeal, fontFamily: fonts.textBold, fontSize: 12, lineHeight: 15, fontWeight: "900" },
    iconBell: { width: 24 },

    greetingRow: {
      flexDirection: veryCompact ? "column" : "row",
      alignItems: veryCompact ? "stretch" : "flex-start",
      justifyContent: "space-between",
      gap: veryCompact ? 12 : 0,
      marginBottom: 16,
    },
    greetingBlock: { width: veryCompact ? "100%" : "56%", paddingTop: 1 },
    greetingSmall: { color: muted, fontFamily: fonts.text, ...typeScale.greetingLead },
    greetingName: { color: text, fontFamily: fonts.displayBold, ...typeScale.greetingName },
    greetingSub: { color: muted, fontFamily: fonts.text, ...typeScale.body, marginTop: 2 },
    greetingRight: {
      width: veryCompact ? "100%" : "41%",
      alignItems: veryCompact ? "stretch" : "flex-end",
      gap: 6,
    },
    todayDate: {
      color: muted,
      fontFamily: fonts.text,
      ...typeScale.bodySmall,
      fontWeight: "500",
      paddingRight: veryCompact ? 0 : 2,
      textAlign: veryCompact ? "left" : "right",
    },
    quoteCard: {
      width: "100%",
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: aqua,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    iconQuote: { width: 23 },
    quoteText: { flex: 1, color: activeTeal, fontFamily: fonts.textBold, ...typeScale.bodySmall, fontWeight: "800" },

    payCard: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 18,
      paddingHorizontal: compact ? 13 : 16,
      paddingTop: 15,
      paddingBottom: 16,
      marginBottom: 24,
      shadowColor: visual.steel,
      shadowOpacity: useMockupLight ? 0.08 : 0.15,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    payTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
    payTitleWrap: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
    payTitleText: { flex: 1, minWidth: 0 },
    clockCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: aqua, alignItems: "center", justifyContent: "center" },
    iconClock: { width: 25 },
    payEyebrow: { color: deep, fontFamily: fonts.textBold, ...typeScale.eyebrow },
    payRange: { color: muted, fontFamily: fonts.text, ...typeScale.bodySmall, marginTop: 2 },
    payOffset: { color: activeTeal, fontFamily: fonts.textMedium, ...typeScale.changed, marginTop: 3 },
    payslipBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: aqua,
      paddingHorizontal: compact ? 9 : 11,
      paddingVertical: 9,
      borderRadius: 12,
    },
    payslipBtnText: { color: activeTeal, fontFamily: fonts.textMedium, ...typeScale.action },
    iconPayChevron: { width: 14 },
    payLoader: { marginVertical: 16 },
    payStats: { flexDirection: "row", alignItems: "stretch", marginTop: 14, minHeight: 52 },
    statCell: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: compact ? 1 : 3 },
    statDivider: { width: 1, backgroundColor: divider, marginVertical: 3 },
    statValue: { color: text, fontFamily: fonts.displayBold, ...typeScale.statValue, textAlign: "center" },
    statLabel: { color: muted, fontFamily: fonts.textMedium, ...typeScale.statLabel, marginTop: 3, textAlign: "center" },

    upcomingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    upcomingTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
    iconCalendar: { width: 24 },
    upcomingTitle: { color: text, fontFamily: fonts.displayBold, ...typeScale.sectionTitle },
    seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 6, paddingLeft: 8 },
    seeAllText: { color: activeTeal, fontFamily: fonts.textMedium, ...typeScale.action },
    iconSeeAll: { width: 14 },

    timeline: { paddingBottom: 4 },
    shiftRow: { flexDirection: "row", minHeight: 88, paddingBottom: 10 },
    dateTile: {
      width: compact ? 48 : 50,
      height: 64,
      borderRadius: 12,
      backgroundColor: pale,
      alignItems: "center",
      justifyContent: "center",
    },
    dateDay: { color: text, fontFamily: fonts.displayBold, ...typeScale.dateDay },
    dateMonth: { color: deep, fontFamily: fonts.textMedium, ...typeScale.dateMeta, letterSpacing: 0.2 },
    dateWeekday: { fontFamily: fonts.textBold, ...typeScale.dateWeekday, marginTop: 2 },
    railColumn: { width: compact ? 26 : 28, alignItems: "center", position: "relative" },
    railTop: { position: "absolute", top: 0, height: railCenter, width: 2, backgroundColor: divider },
    railBottom: { position: "absolute", top: railCenter, bottom: 0, width: 2, backgroundColor: divider },
    railNode: { width: railNodeSize, height: railNodeSize, borderRadius: railNodeSize / 2, marginTop: railNodeTop, zIndex: 2, borderWidth: 1.5, borderColor: page },
    shiftCard: {
      flex: 1,
      minHeight: 78,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 15,
      paddingLeft: compact ? 10 : 12,
      paddingRight: 36,
      paddingTop: 10,
      paddingBottom: 9,
      position: "relative",
      shadowColor: visual.steel,
      shadowOpacity: useMockupLight ? 0.04 : 0.1,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    shiftTopLine: { flexDirection: "row", alignItems: "center", minHeight: 23, gap: 8 },
    shiftIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: compact ? 4 : 7 },
    shiftTime: { color: text, fontFamily: fonts.displayBold, ...typeScale.shiftTime, flexShrink: 1 },
    shiftTypeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      paddingHorizontal: compact ? 6 : 8,
      paddingVertical: 4,
      minHeight: 23,
      flexShrink: 0,
    },
    iconBadge: { width: 12 },
    shiftTypeText: { fontFamily: fonts.textMedium, ...typeScale.badge },
    duration: { color: deep, fontFamily: fonts.text, ...typeScale.duration, minWidth: 31, textAlign: "right" },
    houseRow: { flexDirection: "row", alignItems: "center", marginTop: 6, paddingRight: 3 },
    housePill: {
      maxWidth: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 4,
      minHeight: 22,
      flexShrink: 1,
    },
    iconHouse: { width: 12 },
    houseText: { fontFamily: fonts.textMedium, ...typeScale.house, flexShrink: 1 },
    cardMetaLine: { minHeight: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 5 },
    secondaryText: { color: muted, fontFamily: fonts.text, ...typeScale.metadata, flex: 1, minWidth: 0 },
    secondarySpacer: { flex: 1 },
    changedText: { fontFamily: fonts.textMedium, ...typeScale.changed, flexShrink: 0 },
    cardChevron: { position: "absolute", right: 10, top: "50%", transform: [{ translateY: -10 }] },
    iconCardChevron: { width: 20 },

    listLoader: { marginTop: 20 },
    emptyCard: {  backgroundColor: card, borderWidth: 1, borderColor: border, borderRadius: componentTokens.cardRadius, padding: 20, alignItems: "center"  },
    iconEmpty: { width: 30 },
    emptyTitle: { color: text, fontFamily: fonts.textBold, fontSize: 16, lineHeight: 20, fontWeight: "800", marginTop: 7 },
    emptyText: { color: muted, fontFamily: fonts.text, ...typeScale.bodySmall, textAlign: "center", marginTop: 4 },
    emptyActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 13 },
    emptyPrimary: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: teal, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
    emptyPrimaryText: { color: visual.onAccent, fontFamily: fonts.textMedium, ...typeScale.action },
    emptySecondary: { borderWidth: 1, borderColor: border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
    emptySecondaryText: { color: deep, fontFamily: fonts.textMedium, ...typeScale.action },
    iconSmall: { width: 14 },
  });
}
