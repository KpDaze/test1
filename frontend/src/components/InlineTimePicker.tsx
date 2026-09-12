import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Modal, StyleSheet, ScrollView } from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { useTheme, spacing, radius, type Palette } from "@/src/theme";
import { Pressable } from "@/src/components/FeedbackPressable";
import { formatClockTime } from "@/src/timeUtils";

type Props = {
  value: string; // stored internally as "HH:MM"
  onChange: (hhmm: string) => void;
  onClose: () => void;
  visible: boolean;
};

const HOURS24 = Array.from({ length: 24 }, (_, i) => i);
const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 5-min steps

export default function InlineTimePicker({ value, onChange, onClose, visible }: Props) {
  const { colors, clockFormat } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [h0, m0] = /^\d{2}:\d{2}$/.test(value) ? value.split(":").map(Number) : [9, 0];
  const [hour, setHour] = useState(h0);
  const [minute, setMinute] = useState(Math.round(m0 / 5) * 5 % 60);

  useEffect(() => {
    if (!visible || !/^\d{2}:\d{2}$/.test(value)) return;
    const [nextHour, nextMinute] = value.split(":").map(Number);
    setHour(nextHour);
    setMinute(Math.round(nextMinute / 5) * 5 % 60);
  }, [value, visible]);

  const done = () => {
    onChange(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    onClose();
  };

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour12 = hour % 12 || 12;
  const setHour12 = (h: number) => {
    setHour((h % 12) + (period === "PM" ? 12 : 0));
  };
  const setPeriod = (next: "AM" | "PM") => {
    if (next === "AM" && hour >= 12) setHour(hour - 12);
    if (next === "PM" && hour < 12) setHour(hour + 12);
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="inline-time-picker-backdrop">
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation?.()}
          testID="inline-time-picker-card"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Select time</Text>
            <Text style={styles.preview} testID="time-picker-preview">
              {formatClockTime(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, clockFormat)}
            </Text>
          </View>

          <View style={styles.columnsRow}>
            <View style={styles.columnCol}>
              <Text style={styles.colLabel}>HOUR</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={styles.colScroll}>
                {(clockFormat === "12h" ? HOURS12 : HOURS24).map((h) => {
                  const active = clockFormat === "12h" ? displayHour12 === h : hour === h;
                  return (
                    <Pressable
                      key={h}
                      testID={`time-hour-${h}`}
                      onPress={() => clockFormat === "12h" ? setHour12(h) : setHour(h)}
                      style={[styles.item, active && styles.itemActive]}
                    >
                      <Text style={[styles.itemText, active && styles.itemTextActive]}>
                        {clockFormat === "12h" ? String(h) : String(h).padStart(2, "0")}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <Text style={styles.colon}>:</Text>
            <View style={styles.columnCol}>
              <Text style={styles.colLabel}>MIN</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={styles.colScroll}>
                {MINUTES.map((m) => (
                  <Pressable
                    key={m}
                    testID={`time-min-${m}`}
                    onPress={() => setMinute(m)}
                    style={[styles.item, minute === m && styles.itemActive]}
                  >
                    <Text style={[styles.itemText, minute === m && styles.itemTextActive]}>
                      {String(m).padStart(2, "0")}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            {clockFormat === "12h" && (
              <View style={styles.periodCol}>
                <Text style={styles.colLabel}>AM/PM</Text>
                {(["AM", "PM"] as const).map((p) => (
                  <Pressable
                    key={p}
                    testID={`time-period-${p.toLowerCase()}`}
                    onPress={() => setPeriod(p)}
                    style={[styles.periodItem, period === p && styles.itemActive]}
                  >
                    <Text style={[styles.periodText, period === p && styles.itemTextActive]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <Pressable testID="time-picker-cancel" onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable testID="time-picker-done" onPress={done} style={styles.doneBtn}>
              <Icon name="checkmark" size={16} color={colors.onBrandPrimary} />
              <Text style={styles.doneBtnText}>Done</Text>
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
      maxWidth: 340,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    title: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
    preview: { color: colors.brand, fontSize: 22, fontWeight: "800", letterSpacing: 0.5 },
    columnsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      height: 200,
    },
    columnCol: { flex: 1 },
    periodCol: { width: 66, alignSelf: "stretch", paddingTop: 1 },
    colLabel: {
      color: colors.muted,
      fontSize: 10,
      letterSpacing: 1.5,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: spacing.xs,
    },
    colScroll: { flex: 1 },
    item: {
      paddingVertical: 10,
      alignItems: "center",
      borderRadius: radius.sm,
      marginVertical: 2,
    },
    periodItem: {
      paddingVertical: 14,
      alignItems: "center",
      borderRadius: radius.sm,
      marginTop: spacing.sm,
    },
    itemActive: { backgroundColor: colors.brandTertiary },
    itemText: { color: colors.onSurfaceSecondary, fontSize: 18, fontWeight: "600" },
    periodText: { color: colors.onSurfaceSecondary, fontSize: 16, fontWeight: "700" },
    itemTextActive: { color: colors.onBrandTertiary, fontWeight: "800" },
    colon: { color: colors.onSurface, fontSize: 22, fontWeight: "800", marginTop: 22 },
    footer: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 12,
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelBtnText: { color: colors.onSurface, fontWeight: "600" },
    doneBtn: {
      flex: 1,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
      paddingVertical: 12,
      backgroundColor: colors.brand,
      borderRadius: radius.md,
    },
    doneBtnText: { color: colors.onBrandPrimary, fontWeight: "700" },
  });
}
