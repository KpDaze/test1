import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Modal, StyleSheet } from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { useTheme, spacing, radius, type Palette } from "@/src/theme";
import { fmtDMY } from "@/src/timeUtils";
import { Pressable } from "@/src/components/FeedbackPressable";

type Props = {
  value: string; // ISO YYYY-MM-DD
  onChange: (iso: string) => void;
  onClose: () => void;
  visible: boolean;
  minYear?: number;
  maxYear?: number;
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function InlineDatePicker({
  value,
  onChange,
  onClose,
  visible,
  minYear = 2000,
  maxYear = 2099,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
    const startWeekday = first.getDay();
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const arr: (string | null)[] = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let d = 1; d <= last; d++) {
      arr.push(ymd(new Date(cursor.getFullYear(), cursor.getMonth(), d)));
    }
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

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const selected = initial;

  const pick = (iso: string) => {
    onChange(iso);
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="inline-date-picker-backdrop">
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation?.()} testID="inline-date-picker-card">
          <View style={styles.header}>
            <Pressable testID="picker-prev-month" onPress={goPrev} hitSlop={12}>
              <Icon name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.monthTitle}>{monthLabel}</Text>
            <Pressable testID="picker-next-month" onPress={goNext} hitSlop={12}>
              <Icon name="chevron-forward" size={22} color={colors.onSurface} />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <Text key={i} style={styles.weekDay}>
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((d, i) =>
              d === null ? (
                <View key={i} style={styles.cell} />
              ) : (
                <Pressable
                  key={i}
                  testID={`picker-day-${d}`}
                  style={[styles.cell, selected === d && styles.cellSelected]}
                  onPress={() => pick(d)}
                >
                  <Text style={[styles.cellText, selected === d && styles.cellTextSelected]}>
                    {parseInt(d.split("-")[2], 10)}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
          <View style={styles.footer}>
            <Text style={styles.footerLabel}>Selected</Text>
            <Text style={styles.footerVal}>{fmtDMY(selected)}</Text>
            <Pressable testID="picker-close" onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.lg,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      width: "100%",
      maxWidth: 360,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.md,
    },
    monthTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
    weekRow: { flexDirection: "row", paddingBottom: 6 },
    weekDay: { flex: 1, textAlign: "center", color: colors.muted, fontSize: 12, fontWeight: "600" },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    cellSelected: { backgroundColor: colors.brandTertiary, borderRadius: radius.sm },
    cellText: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "600" },
    cellTextSelected: { color: colors.onBrandTertiary, fontWeight: "800" },
    footer: {
      marginTop: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    footerLabel: { color: colors.muted, fontSize: 12 },
    footerVal: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: "700" },
    closeBtn: {
      backgroundColor: colors.brand,
      paddingHorizontal: spacing.lg,
      paddingVertical: 10,
      borderRadius: radius.md,
    },
    closeBtnText: { color: colors.onBrandPrimary, fontWeight: "700" },
  });
}
