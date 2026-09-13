import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { fonts, typeScale } from "@/src/theme";
import { componentTokens, useDesignSystem } from "@/src/designSystem";

type IconName = React.ComponentProps<typeof Icon>["name"];

export function SurfaceCard({ children, compact = false, style }: {
  children: React.ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { visual } = useDesignSystem();
  return (
    <View
      style={[
        styles.surfaceCard,
        {
          backgroundColor: visual.card,
          borderColor: visual.border,
          borderRadius: compact ? componentTokens.compactCardRadius : componentTokens.cardRadius,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeader({ icon, title, subtitle, trailing }: {
  icon: IconName;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  const { visual } = useDesignSystem();
  return (
    <View style={styles.sectionRow}>
      <View style={[styles.sectionIcon, { backgroundColor: visual.accentSurface }]}>
        <Icon name={icon} size={18} color={visual.accentMid} />
      </View>
      <View style={styles.sectionText}>
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: visual.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.sectionSubtitle, { color: visual.muted }]}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

export function ShiftTypeBadge({ night, compact = false }: { night: boolean; compact?: boolean }) {
  const { visual } = useDesignSystem();
  const surface = night ? visual.nightSurface : visual.daySurface;
  const accent = night ? visual.nightAccent : visual.dayAccent;
  return (
    <View style={[styles.badge, compact && styles.badgeCompact, { backgroundColor: surface }]}>
      <Icon name={night ? "moon" : "sunny"} size={compact ? 11 : 12} color={accent} />
      <Text allowFontScaling={false} style={[styles.badgeText, { color: accent }]}>
        {night ? "Night shift" : "Day shift"}
      </Text>
    </View>
  );
}

export function HousePill({ name, compact = false, style }: {
  name: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { visual } = useDesignSystem();
  return (
    <View style={[styles.housePill, compact && styles.housePillCompact, { backgroundColor: visual.houseSurface }, style]}>
      <Icon name="home" size={compact ? 11 : 12} color={visual.houseAccent} />
      <Text
        allowFontScaling={false}
        style={[styles.houseText, { color: visual.houseAccent }]}
        numberOfLines={1}
      >
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  surfaceCard: {
    borderWidth: 1,
    padding: componentTokens.cardPadding,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginBottom: 9,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionText: { flex: 1 },
  sectionTitle: {
    fontFamily: fonts.displayBold,
    ...typeScale.sectionTitleCompact,
  },
  sectionSubtitle: {
    fontFamily: fonts.text,
    ...typeScale.bodySmall,
    marginTop: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: componentTokens.pillRadius,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 23,
    flexShrink: 0,
  },
  badgeCompact: {
    paddingHorizontal: 7,
    minHeight: 22,
  },
  badgeText: {
    fontFamily: fonts.textMedium,
    ...typeScale.badge,
  },
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
  housePillCompact: {
    borderRadius: componentTokens.pillRadius,
    paddingHorizontal: 8,
  },
  houseText: {
    fontFamily: fonts.textMedium,
    ...typeScale.house,
    flexShrink: 1,
  },
});
