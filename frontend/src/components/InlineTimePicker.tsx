import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Modal, StyleSheet, ScrollView } from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { fonts, typeScale, type Palette } from "@/src/theme";
import { componentTokens, layoutTokens, useDesignSystem } from "@/src/designSystem";
import { Pressable } from "@/src/components/FeedbackPressable";
import { formatClockTime } from "@/src/timeUtils";

type Props = { value: string; onChange: (hhmm: string) => void; onClose: () => void; visible: boolean };
const HOURS24 = Array.from({ length: 24 }, (_, i) => i);
const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

export default function InlineTimePicker({ value, onChange, onClose, visible }: Props) {
  const { colors, clockFormat, visual } = useDesignSystem();
  const styles = useMemo(() => makeStyles(colors, visual), [colors, visual]);
  const [h0, m0] = /^\d{2}:\d{2}$/.test(value) ? value.split(":").map(Number) : [9, 0];
  const [hour, setHour] = useState(h0);
  const [minute, setMinute] = useState(Math.round(m0 / 5) * 5 % 60);

  useEffect(() => {
    if (!visible || !/^\d{2}:\d{2}$/.test(value)) return;
    const [nextHour, nextMinute] = value.split(":").map(Number);
    setHour(nextHour);
    setMinute(Math.round(nextMinute / 5) * 5 % 60);
  }, [value, visible]);

  const done = () => { onChange(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`); onClose(); };
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour12 = hour % 12 || 12;
  const setHour12 = (h: number) => setHour((h % 12) + (period === "PM" ? 12 : 0));
  const setPeriod = (next: "AM" | "PM") => {
    if (next === "AM" && hour >= 12) setHour(hour - 12);
    if (next === "PM" && hour < 12) setHour(hour + 12);
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="inline-time-picker-backdrop">
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation?.()} testID="inline-time-picker-card">
          <View style={styles.header}>
            <View>
              <Text allowFontScaling={false} style={styles.eyebrow}>SELECT TIME</Text>
              <Text allowFontScaling={false} style={styles.title}>Shift time</Text>
            </View>
            <Text allowFontScaling={false} style={styles.preview} testID="time-picker-preview">{formatClockTime(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, clockFormat)}</Text>
          </View>
          <View style={styles.columnsRow}>
            <View style={styles.columnCol}>
              <Text allowFontScaling={false} style={styles.colLabel}>HOUR</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={styles.colScroll}>
                {(clockFormat === "12h" ? HOURS12 : HOURS24).map((h) => {
                  const active = clockFormat === "12h" ? displayHour12 === h : hour === h;
                  return <Pressable key={h} testID={`time-hour-${h}`} onPress={() => clockFormat === "12h" ? setHour12(h) : setHour(h)} style={[styles.item, active && styles.itemActive]}><Text allowFontScaling={false} style={[styles.itemText, active && styles.itemTextActive]}>{clockFormat === "12h" ? String(h) : String(h).padStart(2, "0")}</Text></Pressable>;
                })}
              </ScrollView>
            </View>
            <Text allowFontScaling={false} style={styles.colon}>:</Text>
            <View style={styles.columnCol}>
              <Text allowFontScaling={false} style={styles.colLabel}>MIN</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={styles.colScroll}>
                {MINUTES.map((m) => <Pressable key={m} testID={`time-min-${m}`} onPress={() => setMinute(m)} style={[styles.item, minute === m && styles.itemActive]}><Text allowFontScaling={false} style={[styles.itemText, minute === m && styles.itemTextActive]}>{String(m).padStart(2, "0")}</Text></Pressable>)}
              </ScrollView>
            </View>
            {clockFormat === "12h" && <View style={styles.periodCol}><Text allowFontScaling={false} style={styles.colLabel}>AM/PM</Text>{(["AM", "PM"] as const).map((p) => <Pressable key={p} testID={`time-period-${p.toLowerCase()}`} onPress={() => setPeriod(p)} style={[styles.periodItem, period === p && styles.itemActive]}><Text allowFontScaling={false} style={[styles.periodText, period === p && styles.itemTextActive]}>{p}</Text></Pressable>)}</View>}
          </View>
          <View style={styles.footer}>
            <Pressable testID="time-picker-cancel" onPress={onClose} style={styles.cancelBtn}><Text allowFontScaling={false} style={styles.cancelBtnText}>Cancel</Text></Pressable>
            <Pressable testID="time-picker-done" onPress={done} style={styles.doneBtn}><Icon name="checkmark" size={16} color={visual.onAccent} /><Text allowFontScaling={false} style={styles.doneBtnText}>Done</Text></Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: Palette, visual: ReturnType<typeof useDesignSystem>["visual"]) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(17,33,48,0.48)", justifyContent: "center", alignItems: "center", padding: layoutTokens.screenPadding },
    card: { backgroundColor: visual.card, borderRadius: componentTokens.cardRadius, padding: componentTokens.cardPadding, width: "100%", maxWidth: 340, borderWidth: 1, borderColor: visual.border, shadowColor: visual.steel, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10 },
    eyebrow: { color: visual.accent, fontFamily: fonts.textBold, ...typeScale.eyebrow },
    title: { color: visual.text, fontFamily: fonts.displayBold, ...typeScale.cardTitle, marginTop: 1 },
    preview: { color: visual.accentStrong, fontFamily: fonts.displayBold, ...typeScale.statValue },
    columnsRow: { flexDirection: "row", alignItems: "center", gap: 8, height: 200 },
    columnCol: { flex: 1 },
    periodCol: { width: 66, alignSelf: "stretch", paddingTop: 1 },
    colLabel: { color: visual.muted, fontFamily: fonts.textBold, ...typeScale.micro, letterSpacing: 1, textAlign: "center", marginBottom: 4 },
    colScroll: { flex: 1 },
    item: { paddingVertical: 9, alignItems: "center", borderRadius: componentTokens.controlRadius, marginVertical: 2 },
    periodItem: { paddingVertical: 13, alignItems: "center", borderRadius: componentTokens.controlRadius, marginTop: 8 },
    itemActive: { backgroundColor: visual.accentSurface },
    itemText: { color: colors.onSurfaceSecondary, fontFamily: fonts.textMedium, ...typeScale.itemTitle },
    periodText: { color: colors.onSurfaceSecondary, fontFamily: fonts.textBold, ...typeScale.body },
    itemTextActive: { color: visual.accentStrong, fontFamily: fonts.textBold, fontWeight: "900" },
    colon: { color: visual.textStrong, fontFamily: fonts.displayBold, ...typeScale.statValue, marginTop: 22 },
    footer: { flexDirection: "row", gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: visual.divider },
    cancelBtn: { flex: 1, minHeight: layoutTokens.touchTarget, alignItems: "center", justifyContent: "center", backgroundColor: visual.cardMuted, borderRadius: componentTokens.controlRadius, borderWidth: 1, borderColor: visual.border },
    cancelBtnText: { color: visual.textStrong, fontFamily: fonts.textBold, ...typeScale.button },
    doneBtn: { flex: 1, minHeight: layoutTokens.touchTarget, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, backgroundColor: visual.accent, borderRadius: componentTokens.controlRadius },
    doneBtnText: { color: visual.onAccent, fontFamily: fonts.textBold, ...typeScale.button },
  });
}
