import { useMemo } from "react";
import { MOCKUP_LIGHT } from "@/src/mockupPalette";
import { fonts, radius, spacing, typeScale, useTheme } from "@/src/theme";

export const layoutTokens = {
  screenPadding: 18,
  compactScreenPadding: 16,
  sectionGap: 24,
  cardGap: 10,
  touchTarget: 44,
  bottomNavBaseHeight: 68,
  contentMaxWidth: 560,
} as const;

export const componentTokens = {
  cardRadius: 18,
  compactCardRadius: 15,
  controlRadius: 12,
  quoteRadius: 14,
  dateTileRadius: 12,
  avatarSize: 40,
  headerActionSize: 42,
  brandMarkSize: 44,
  pillRadius: radius.pill,
} as const;

export const typography = {
  fonts,
  ...typeScale,
} as const;

export function useDesignSystem() {
  const theme = useTheme();
  const exactReference = theme.colorTheme === "teal" && theme.effective === "light";

  const visual = useMemo(() => {
    if (exactReference) {
      return {
        page: MOCKUP_LIGHT.background,
        card: MOCKUP_LIGHT.nearWhite,
        cardMuted: MOCKUP_LIGHT.coolPale,
        divider: MOCKUP_LIGHT.paleBlueGrey,
        accentSurface: MOCKUP_LIGHT.paleAqua,
        accent: MOCKUP_LIGHT.teal,
        accentStrong: MOCKUP_LIGHT.activeTeal,
        accentMid: MOCKUP_LIGHT.tealMid,
        text: MOCKUP_LIGHT.navy,
        textStrong: MOCKUP_LIGHT.navyDeep,
        textDeep: MOCKUP_LIGHT.navyDarkest,
        muted: MOCKUP_LIGHT.muted,
        mutedSoft: MOCKUP_LIGHT.mutedSoft,
        steel: MOCKUP_LIGHT.steelBlue,
        daySurface: MOCKUP_LIGHT.daySurface,
        dayAccent: MOCKUP_LIGHT.dayAccent,
        nightSurface: MOCKUP_LIGHT.nightSurface,
        nightAccent: MOCKUP_LIGHT.nightAccent,
        houseSurface: MOCKUP_LIGHT.houseSurface,
        houseAccent: MOCKUP_LIGHT.houseAccent,
        danger: MOCKUP_LIGHT.red,
        warning: MOCKUP_LIGHT.yellow,
        onAccent: MOCKUP_LIGHT.nearWhite,
        border: MOCKUP_LIGHT.coolPale,
      } as const;
    }

    return {
      page: theme.colors.surface,
      card: theme.colors.surfaceSecondary,
      cardMuted: theme.colors.surfaceTertiary,
      divider: theme.colors.divider,
      accentSurface: theme.colors.brandTertiary,
      accent: theme.colors.brand,
      accentStrong: theme.colors.onBrandTertiary,
      accentMid: theme.colors.brandSecondary,
      text: theme.colors.onSurface,
      textStrong: theme.colors.onSurfaceSecondary,
      textDeep: theme.colors.onSurface,
      muted: theme.colors.muted,
      mutedSoft: theme.colors.borderStrong,
      steel: theme.colors.onSurfaceTertiary,
      daySurface: theme.colors.successSurface,
      dayAccent: theme.colors.success,
      nightSurface: theme.colors.brandTertiary,
      nightAccent: theme.colors.brandSecondary,
      houseSurface: theme.colors.brandTertiary,
      houseAccent: theme.colors.info,
      danger: theme.colors.error,
      warning: theme.colors.warning,
      onAccent: theme.colors.onBrandPrimary,
      border: theme.colors.border,
    } as const;
  }, [exactReference, theme.colors]);

  return {
    ...theme,
    exactReference,
    visual,
    spacing,
    radius,
    layout: layoutTokens,
    components: componentTokens,
    typography,
  };
}
