import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { fonts, typeScale } from "@/src/theme";
import { componentTokens, useDesignSystem } from "@/src/designSystem";

type IconName = React.ComponentProps<typeof Icon>["name"];

export function BrandScreenHeader({ title, subtitle, trailing }: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  const { visual } = useDesignSystem();
  return (
    <View style={styles.brandHeader}>
      <View style={[styles.brandMark, { backgroundColor: visual.accent }]}>
        <Icon name="heart" size={22} color={visual.onAccent} />
      </View>
      <View style={styles.brandHeaderText}>
        <Text allowFontScaling={false} style={[styles.brandEyebrow, { color: visual.accent }]}>ShiftMate</Text>
        <Text allowFontScaling={false} style={[styles.screenTitle, { color: visual.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.screenSubtitle, { color: visual.muted }]}>{subtitle}</Text> : null}
      </View>
      {trailing ? <View style={styles.brandTrailing}>{trailing}</View> : null}
    </View>
  );
}

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
      <Icon name={night ? "moon" : "sunny"} size={compact ? 10 : 12} color={accent} />
      <Text allowFontScaling={false} style={[styles.badgeText, compact && styles.badgeTextCompact, { color: accent }]}>
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
      <Icon name="home" size={compact ? 10 : 12} color={visual.houseAccent} />
      <Text
        allowFontScaling={false}
        style={[styles.houseText, compact && styles.houseTextCompact, { color: visual.houseAccent }]}
        numberOfLines={1}
      >
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: componentTokens.brandMarkSize,
    marginBottom: 20,
  },
  brandMark: {
    width: componentTokens.brandMarkSize,
    height: componentTokens.brandMarkSize,
    borderRadius: componentTokens.compactCardRadius,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-8deg" }],
    marginRight: 11,
  },
  brandHeaderText: { flex: 1, minWidth: 0 },
  brandEyebrow: {
    fontFamily: fonts.textBold,
    ...typeScale.eyebrow,
  },
  screenTitle: {
    fontFamily: fonts.displayBold,
    ...typeScale.screenTitle,
  },
  screenSubtitle: {
    fontFamily: fonts.text,
    ...typeScale.bodySmall,
    marginTop: 2,
  },
  brandTrailing: { marginLeft: 10, alignItems: "flex-end", justifyContent: "center" },
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
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minHeight: 18,
  },
  badgeText: {
    fontFamily: fonts.textMedium,
    ...typeScale.badge,
  },
  badgeTextCompact: {
    fontSize: 9.5,
    lineHeight: 12,
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
    gap: 3,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minHeight: 18,
  },
  houseText: {
    fontFamily: fonts.textMedium,
    ...typeScale.house,
    flexShrink: 1,
  },
  houseTextCompact: {
    fontSize: 9.5,
    lineHeight: 12,
  },
});
