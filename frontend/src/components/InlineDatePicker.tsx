import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Modal, StyleSheet } from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { fonts, typeScale, type Palette } from "@/src/theme";
import { componentTokens, layoutTokens, useDesignSystem } from "@/src/designSystem";
import { fmtDMY } from "@/src/timeUtils";
import { Pressable } from "@/src/components/FeedbackPressable";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  onClose: () => void;
  visible: boolean;
  minYear?: number;
  maxYear?: number;
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function InlineDatePicker({ value, onChange, onClose, visible, minYear = 2000, maxYear = 2099 }: Props) {
  const { colors, visual } = useDesignSystem();
  const styles = useMemo(() => makeStyles(colors, visual), [colors, visual]);
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ymd(new Date());
  const [y, m] = initial.split("-").map(Number);
  const [cursor, setCursor] = useState(new Date(y, m - 1, 1));

  useEffect(() => {
    if (!visible || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const [nextYear, nextMonth] = value.split("-").map(Number);
    setCursor(new Date(nextYear, nextMonth - 1, 1));
  }, [value, visible]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const arr: (string | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) arr.push(null);
    for (let d = 1; d <= last; d++) arr.push(ymd(new Date(cursor.getFullYear(), cursor.getMonth(), d)));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  const goPrev = () => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    if (next.getFullYear() >= minYear) setCursor(next);
  };
  const goNext = () => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    if (next.getFullYear() <= maxYear) setCursor(next);
  };
  const selected = initial;
  const pick = (iso: string) => { onChange(iso); onClose(); };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="inline-date-picker-backdrop">
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation?.()} testID="inline-date-picker-card">
          <View style={styles.header}>
            <Pressable testID="picker-prev-month" onPress={goPrev} style={styles.arrowButton} hitSlop={10}>
              <Icon name="chevron-back" size={19} color={visual.accentStrong} />
            </Pressable>
            <Text allowFontScaling={false} style={styles.monthTitle}>{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
            <Pressable testID="picker-next-month" onPress={goNext} style={styles.arrowButton} hitSlop={10}>
              <Icon name="chevron-forward" size={19} color={visual.accentStrong} />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <Text allowFontScaling={false} key={i} style={styles.weekDay}>{d}</Text>)}
          </View>
          <View style={styles.grid}>
            {cells.map((d, i) => d === null ? <View key={i} style={styles.cell} /> : (
              <Pressable key={d} testID={`picker-day-${d}`} style={styles.cell} onPress={() => pick(d)}>
                <View style={[styles.dayCircle, selected === d && styles.dayCircleSelected]}>
                  <Text allowFontScaling={false} style={[styles.cellText, selected === d && styles.cellTextSelected]}>{parseInt(d.split("-")[2], 10)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <View style={styles.footer}>
            <View style={styles.selectedBlock}>
              <Text allowFontScaling={false} style={styles.footerLabel}>SELECTED</Text>
              <Text allowFontScaling={false} style={styles.footerVal}>{fmtDMY(selected)}</Text>
            </View>
            <Pressable testID="picker-close" onPress={onClose} style={styles.closeBtn}>
              <Text allowFontScaling={false} style={styles.closeBtnText}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: Palette, visual: ReturnType<typeof useDesignSystem>["visual"]) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(17,33,48,0.48)", justifyContent: "center", alignItems: "center", padding: layoutTokens.screenPadding },
    card: { backgroundColor: visual.card, borderRadius: componentTokens.cardRadius, padding: componentTokens.cardPadding, width: "100%", maxWidth: 360, borderWidth: 1, borderColor: visual.border, shadowColor: visual.steel, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    arrowButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: visual.accentSurface, alignItems: "center", justifyContent: "center" },
    monthTitle: { color: visual.text, fontFamily: fonts.displayBold, ...typeScale.cardTitle, textAlign: "center" },
    weekRow: { flexDirection: "row", paddingBottom: 5 },
    weekDay: { flex: 1, textAlign: "center", color: visual.muted, fontFamily: fonts.textBold, ...typeScale.micro },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
    dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    dayCircleSelected: { backgroundColor: visual.accent },
    cellText: { color: colors.onSurfaceSecondary, fontFamily: fonts.textMedium, ...typeScale.body },
    cellTextSelected: { color: visual.onAccent, fontFamily: fonts.textBold, fontWeight: "900" },
    footer: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: visual.divider },
    selectedBlock: { flex: 1 },
    footerLabel: { color: visual.muted, fontFamily: fonts.textBold, ...typeScale.micro },
    footerVal: { color: visual.text, fontFamily: fonts.textMedium, ...typeScale.body, marginTop: 2 },
    closeBtn: { minHeight: layoutTokens.touchTarget, minWidth: 86, backgroundColor: visual.accent, paddingHorizontal: 16, borderRadius: componentTokens.controlRadius, alignItems: "center", justifyContent: "center" },
    closeBtnText: { color: visual.onAccent, fontFamily: fonts.textBold, ...typeScale.button },
  });
}
