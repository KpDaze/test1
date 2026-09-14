import React from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { fonts, typeScale } from "@/src/theme";
import { componentTokens, useDesignSystem } from "@/src/designSystem";

type IconName = React.ComponentProps<typeof Icon>["name"];

const BRAND_MARK = require("../../assets/branding/shiftmate-mark-source.png");

export function BrandScreenHeader({ title, subtitle, trailing }: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  const { visual } = useDesignSystem();
  return (
    <View style={styles.brandHeader}>
      <Image
        source={BRAND_MARK}
        resizeMode="contain"
        style={[styles.brandMark, { backgroundColor: visual.accent }]}
      />
      <View style={styles.brandHeaderText}>
        <Text allowFontScaling={false} style={[styles.brandEyebrow, { color: visual.accent }]}>ShiftMate</Text>
        <Text allowFontScaling={false} style={[styles.screenTitle, { color: visual.text }]}>{title}</Text>
        {subtitle ? <Text allowFontScaling={false} style={[styles.screenSubtitle, { color: visual.muted }]}>{subtitle}</Text> : null}
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
  const { visual, exactReference } = useDesignSystem();
  return (
    <View
      style={[
        styles.surfaceCard,
        {
          backgroundColor: visual.card,
          borderColor: visual.border,
          borderRadius: compact ? componentTokens.compactCardRadius : componentTokens.cardRadius,
          shadowColor: visual.steel,
          shadowOpacity: exactReference ? 0.04 : 0.09,
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
        {subtitle ? <Text allowFontScaling={false} style={[styles.sectionSubtitle, { color: visual.muted }]}>{subtitle}</Text> : null}
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
      <Icon name={night ? "moon" : "sunny"} size={compact ? 10 : 11} color={accent} />
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
      <Icon name="home" size={compact ? 10 : 11} color={visual.houseAccent} />
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
    marginBottom: 18,
  },
  brandMark: {
    width: componentTokens.brandMarkSize,
    height: componentTokens.brandMarkSize,
    borderRadius: componentTokens.compactCardRadius,
    marginRight: 9,
    transform: [{ rotate: "-8deg" }],
  },
  brandHeaderText: { flex: 1, minWidth: 0, justifyContent: "center" },
  brandEyebrow: {
    fontFamily: fonts.textBold,
    ...typeScale.eyebrow,
  },
  screenTitle: {
    fontFamily: fonts.displayBold,
    ...typeScale.screenTitle,
    marginTop: -1,
  },
  screenSubtitle: {
    fontFamily: fonts.text,
    ...typeScale.bodySmall,
    marginTop: 1,
  },
  brandTrailing: { marginLeft: 10, alignItems: "flex-end", justifyContent: "center" },
  surfaceCard: {
    borderWidth: 1,
    padding: componentTokens.cardPadding,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 13,
    marginBottom: 8,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
    paddingHorizontal: 7,
    paddingVertical: 3,
    minHeight: 21,
    flexShrink: 0,
  },
  badgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    minHeight: 19,
  },
  badgeText: {
    fontFamily: fonts.textMedium,
    ...typeScale.badge,
  },
  badgeTextCompact: {
    ...typeScale.micro,
  },
  housePill: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minHeight: 21,
    flexShrink: 1,
  },
  housePillCompact: {
    borderRadius: componentTokens.pillRadius,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minHeight: 19,
  },
  houseText: {
    fontFamily: fonts.textMedium,
    ...typeScale.house,
    flexShrink: 1,
  },
  houseTextCompact: {
    ...typeScale.micro,
  },
});
