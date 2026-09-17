import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, ColorSchemeName, Platform } from "react-native";
import { storage } from "@/src/utils/storage";

export type Palette = {
  surface: string;
  onSurface: string;
  surfaceSecondary: string;
  onSurfaceSecondary: string;
  surfaceTertiary: string;
  onSurfaceTertiary: string;
  surfaceInverse: string;
  onSurfaceInverse: string;
  brand: string;
  brandPrimary: string;
  onBrandPrimary: string;
  brandSecondary: string;
  onBrandSecondary: string;
  brandTertiary: string;
  onBrandTertiary: string;
  success: string;
  onSuccess: string;
  successSurface: string;
  warning: string;
  onWarning: string;
  warningSurface: string;
  onWarningSurface: string;
  error: string;
  onError: string;
  errorSurface: string;
  onErrorSurface: string;
  info: string;
  onInfo: string;
  border: string;
  borderStrong: string;
  divider: string;
  muted: string;
  onBrand: string;
};

const SEMANTIC = {
  success: "#528D68",
  onSuccess: "#EEF5F1",
  warning: "#D4A24C",
  onWarning: "#1A1305",
  error: "#C45A53",
  onError: "#FDF2F1",
  info: "#508493",
  onInfo: "#EFF4F6",
};

export const DARK: Palette = {
  surface: "#0F1719",
  onSurface: "#EAF3F4",
  surfaceSecondary: "#182226",
  onSurfaceSecondary: "#D2DEE0",
  surfaceTertiary: "#233036",
  onSurfaceTertiary: "#B8C5C9",
  surfaceInverse: "#E8EEEF",
  onSurfaceInverse: "#0F1719",
  brand: "#4CB8B0",
  brandPrimary: "#4CB8B0",
  onBrandPrimary: "#062024",
  brandSecondary: "#2E8A82",
  onBrandSecondary: "#EAF3F4",
  brandTertiary: "#1E3A38",
  onBrandTertiary: "#A8E1DA",
  ...SEMANTIC,
  successSurface: "#1D3A26",
  warningSurface: "#3A3115",
  onWarningSurface: "#F4DFAC",
  errorSurface: "#3A1E1C",
  onErrorSurface: "#F7D7D4",
  border: "#2A3941",
  borderStrong: "#3F5058",
  divider: "#1E2A2E",
  muted: "#7E8E92",
  onBrand: "#062024",
};

// Exact ShiftMate reference palette for the default light presentation.
export const LIGHT: Palette = {
  surface: "#F5FAFD",
  onSurface: "#112130",
  surfaceSecondary: "#F8FDFC",
  onSurfaceSecondary: "#022E40",
  surfaceTertiary: "#E5F1F4",
  onSurfaceTertiary: "#407893",
  surfaceInverse: "#112130",
  onSurfaceInverse: "#F8FDFC",
  brand: "#41A299",
  brandPrimary: "#41A299",
  onBrandPrimary: "#F8FDFC",
  brandSecondary: "#317C82",
  onBrandSecondary: "#F8FDFC",
  brandTertiary: "#E1F3F2",
  onBrandTertiary: "#0A4B53",
  ...SEMANTIC,
  success: "#839967",
  onSuccess: "#112130",
  successSurface: "#EFFAEF",
  warning: "#F6BE47",
  onWarning: "#112130",
  warningSurface: "#FFF4D8",
  onWarningSurface: "#4A3507",
  error: "#E71B24",
  onError: "#F8FDFC",
  errorSurface: "#FBEAEC",
  onErrorSurface: "#5E1712",
  info: "#116D98",
  onInfo: "#F8FDFC",
  border: "#E5F1F4",
  borderStrong: "#808E9C",
  divider: "#E8F0F3",
  muted: "#6E7A83",
  onBrand: "#F8FDFC",
};

function variant(base: Palette, overrides: Partial<Palette>): Palette {
  return { ...base, ...overrides };
}

const LAVENDER_DARK = variant(DARK, {
  surface: "#17131B", onSurface: "#F4EFF8", surfaceSecondary: "#211B27", onSurfaceSecondary: "#E1D8E8",
  surfaceTertiary: "#30273A", onSurfaceTertiary: "#C9BCD5", surfaceInverse: "#F1EBF5", onSurfaceInverse: "#17131B",
  brand: "#B79AD2", brandPrimary: "#B79AD2", onBrandPrimary: "#25162F", brandSecondary: "#8E6DB0",
  onBrandSecondary: "#F7F0FB", brandTertiary: "#3A2948", onBrandTertiary: "#E4D3F0",
  border: "#43364E", borderStrong: "#5C4C6A", divider: "#2B2332", muted: "#9688A1", onBrand: "#25162F",
});

const LAVENDER_LIGHT = variant(LIGHT, {
  surface: "#F8F6FB", onSurface: "#1E1A24", surfaceSecondary: "#FFFFFF", onSurfaceSecondary: "#2E2935",
  surfaceTertiary: "#EEE9F5", onSurfaceTertiary: "#443B52", surfaceInverse: "#211B29", onSurfaceInverse: "#F7F3FA",
  brand: "#76589B", brandPrimary: "#76589B", onBrandPrimary: "#FFFFFF", brandSecondary: "#A88BC5",
  onBrandSecondary: "#21152E", brandTertiary: "#E9DEF4", onBrandTertiary: "#4A3165",
  success: "#528D68", onSuccess: "#EEF5F1", warning: "#D4A24C", onWarning: "#1A1305", error: "#C45A53", onError: "#FDF2F1",
  successSurface: "#DDEEE3", warningSurface: "#F4E6C4", errorSurface: "#F4DDDA", info: "#508493", onInfo: "#EFF4F6",
  border: "#DCD4E5", borderStrong: "#B9AEC7", divider: "#E9E3EF", muted: "#6F6778", onBrand: "#FFFFFF",
});

const WARM_DARK = variant(DARK, {
  surface: "#181512", onSurface: "#F4EEE6", surfaceSecondary: "#221E1A", onSurfaceSecondary: "#DED5CA",
  surfaceTertiary: "#302A24", onSurfaceTertiary: "#C8BAA8", surfaceInverse: "#EFE7DD", onSurfaceInverse: "#181512",
  brand: "#C7A87B", brandPrimary: "#C7A87B", onBrandPrimary: "#2A2117", brandSecondary: "#9C7C56",
  onBrandSecondary: "#FAF3E9", brandTertiary: "#413323", onBrandTertiary: "#F0DCC2",
  border: "#443B32", borderStrong: "#5E5144", divider: "#2C2722", muted: "#978B7E", onBrand: "#2A2117",
});

const WARM_LIGHT = variant(LIGHT, {
  surface: "#F8F5EF", onSurface: "#241F1A", surfaceSecondary: "#FFFDF9", onSurfaceSecondary: "#342E27",
  surfaceTertiary: "#EEE7DD", onSurfaceTertiary: "#4D4338", surfaceInverse: "#2A241E", onSurfaceInverse: "#FBF6EE",
  brand: "#8A6A45", brandPrimary: "#8A6A45", onBrandPrimary: "#FFFFFF", brandSecondary: "#B89A76",
  onBrandSecondary: "#2D241B", brandTertiary: "#EDE1D1", onBrandTertiary: "#5A4127",
  success: "#528D68", onSuccess: "#EEF5F1", warning: "#D4A24C", onWarning: "#1A1305", error: "#C45A53", onError: "#FDF2F1",
  successSurface: "#DDEEE3", warningSurface: "#F4E6C4", errorSurface: "#F4DDDA", info: "#508493", onInfo: "#EFF4F6",
  border: "#DED4C6", borderStrong: "#B7A794", divider: "#E9E1D6", muted: "#746A60", onBrand: "#FFFFFF",
});

const OCEAN_DARK = variant(DARK, {
  surface: "#101820", onSurface: "#EDF4F8", surfaceSecondary: "#18232D", onSurfaceSecondary: "#D6E2E9",
  surfaceTertiary: "#243440", onSurfaceTertiary: "#B9CBD5", surfaceInverse: "#EAF1F5", onSurfaceInverse: "#101820",
  brand: "#78B8DA", brandPrimary: "#78B8DA", onBrandPrimary: "#092331", brandSecondary: "#4C91B8",
  onBrandSecondary: "#F1F8FC", brandTertiary: "#203E50", onBrandTertiary: "#C9E8F7",
  border: "#304653", borderStrong: "#47606E", divider: "#1E2D36", muted: "#8298A5", onBrand: "#092331",
});

const OCEAN_LIGHT = variant(LIGHT, {
  surface: "#F4F8FB", onSurface: "#14212A", surfaceSecondary: "#FFFFFF", onSurfaceSecondary: "#263742",
  surfaceTertiary: "#E4EFF5", onSurfaceTertiary: "#36505F", surfaceInverse: "#14232C", onSurfaceInverse: "#F2F8FB",
  brand: "#356F94", brandPrimary: "#356F94", onBrandPrimary: "#FFFFFF", brandSecondary: "#72A9C8",
  onBrandSecondary: "#102A39", brandTertiary: "#DCECF5", onBrandTertiary: "#244E67",
  success: "#528D68", onSuccess: "#EEF5F1", warning: "#D4A24C", onWarning: "#1A1305", error: "#C45A53", onError: "#FDF2F1",
  successSurface: "#DDEEE3", warningSurface: "#F4E6C4", errorSurface: "#F4DDDA", info: "#508493", onInfo: "#EFF4F6",
  border: "#CEDCE4", borderStrong: "#9FB5C1", divider: "#DFE9EE", muted: "#607887", onBrand: "#FFFFFF",
});

export type ColorThemeKey = "teal" | "lavender" | "warm" | "ocean";

export const COLOR_THEMES: {
  key: ColorThemeKey;
  label: string;
  description: string;
  swatches: [string, string, string];
}[] = [
  { key: "teal", label: "Original Teal", description: "Chosen ShiftMate mock-up colours", swatches: ["#41A299", "#E1F3F2", "#112130"] },
  { key: "lavender", label: "Soft Lavender", description: "Cool purple with softer contrast", swatches: ["#76589B", "#E9DEF4", "#17131B"] },
  { key: "warm", label: "Warm Neutral", description: "Sand, stone and warm brown", swatches: ["#8A6A45", "#EDE1D1", "#181512"] },
  { key: "ocean", label: "Ocean Blue", description: "Clear blue with cool slate tones", swatches: ["#356F94", "#DCECF5", "#101820"] },
];

const PALETTES: Record<ColorThemeKey, { light: Palette; dark: Palette }> = {
  teal: { light: LIGHT, dark: DARK },
  lavender: { light: LAVENDER_LIGHT, dark: LAVENDER_DARK },
  warm: { light: WARM_LIGHT, dark: WARM_DARK },
  ocean: { light: OCEAN_LIGHT, dark: OCEAN_DARK },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  screen: 18,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  quote: 14,
  compactCard: 15,
  card: 18,
  lg: 20,
  pill: 999,
} as const;

export const fonts = {
  display: Platform.select({ android: "sans-serif", default: undefined }),
  displayBold: Platform.select({ android: "sans-serif", default: undefined }),
  text: Platform.select({ android: "sans-serif", default: undefined }),
  textMedium: Platform.select({ android: "sans-serif-medium", default: undefined }),
  textBold: Platform.select({ android: "sans-serif", default: undefined }),
} as const;

export const typeScale = {
  wordmark: { fontSize: 28, lineHeight: 30, fontWeight: "900" as const, letterSpacing: -1.1 },
  screenTitle: { fontSize: 29, lineHeight: 31, fontWeight: "900" as const, letterSpacing: -0.8 },
  greetingLead: { fontSize: 14, lineHeight: 18, fontWeight: "400" as const },
  greetingName: { fontSize: 26, lineHeight: 31, fontWeight: "900" as const, letterSpacing: -0.35 },
  body: { fontSize: 13.5, lineHeight: 18, fontWeight: "400" as const },
  bodySmall: { fontSize: 11.5, lineHeight: 15, fontWeight: "400" as const },
  eyebrow: { fontSize: 10, lineHeight: 13, fontWeight: "900" as const, letterSpacing: 1.1 },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "800" as const },
  itemTitle: { fontSize: 14, lineHeight: 18, fontWeight: "800" as const },
  sectionTitleCompact: { fontSize: 18, lineHeight: 22, fontWeight: "900" as const, letterSpacing: -0.2 },
  button: { fontSize: 13, lineHeight: 17, fontWeight: "800" as const },
  caption: { fontSize: 10, lineHeight: 14, fontWeight: "400" as const },
  micro: { fontSize: 9, lineHeight: 12, fontWeight: "700" as const },
  inputStrong: { fontSize: 13, lineHeight: 17, fontWeight: "800" as const },
  cardTitle: { fontSize: 16, lineHeight: 20, fontWeight: "900" as const },
  statValue: { fontSize: 20, lineHeight: 24, fontWeight: "900" as const },
  statLabel: { fontSize: 11, lineHeight: 14, fontWeight: "500" as const },
  sectionTitle: { fontSize: 22, lineHeight: 27, fontWeight: "900" as const, letterSpacing: -0.3 },
  action: { fontSize: 12, lineHeight: 16, fontWeight: "700" as const },
  input: { fontSize: 14, lineHeight: 18, fontWeight: "400" as const },
  dateDay: { fontSize: 20, lineHeight: 22, fontWeight: "900" as const },
  dateMeta: { fontSize: 10, lineHeight: 12, fontWeight: "700" as const },
  dateWeekday: { fontSize: 9.5, lineHeight: 12, fontWeight: "800" as const, letterSpacing: 0.45 },
  shiftTime: { fontSize: 17, lineHeight: 21, fontWeight: "900" as const, letterSpacing: -0.15 },
  badge: { fontSize: 11, lineHeight: 14, fontWeight: "700" as const },
  house: { fontSize: 11, lineHeight: 14, fontWeight: "700" as const },
  metadata: { fontSize: 10.5, lineHeight: 14, fontWeight: "400" as const },
  duration: { fontSize: 11.5, lineHeight: 15, fontWeight: "500" as const },
  changed: { fontSize: 9.5, lineHeight: 12, fontWeight: "700" as const },
  tabLabel: { fontSize: 11.5, lineHeight: 14, fontWeight: "600" as const },
} as const;

export type ThemeMode = "auto" | "light" | "dark";
export type EffectiveMode = "light" | "dark";
export type ClockFormat = "12h" | "24h";

const THEME_STORAGE_KEY = "shiftmate.theme.mode.v1";
const COLOR_THEME_STORAGE_KEY = "shiftmate.theme.palette.v1";
const CLOCK_STORAGE_KEY = "shiftmate.clock.format.v1";

type ThemeCtx = {
  mode: ThemeMode;
  effective: EffectiveMode;
  colors: Palette;
  setMode: (m: ThemeMode) => void;
  colorTheme: ColorThemeKey;
  setColorTheme: (theme: ColorThemeKey) => void;
  clockFormat: ClockFormat;
  setClockFormat: (format: ClockFormat) => void;
};

const ThemeContext = createContext<ThemeCtx>({
  mode: "light",
  effective: "light",
  colors: LIGHT,
  setMode: () => {},
  colorTheme: "teal",
  setColorTheme: () => {},
  clockFormat: "24h",
  setClockFormat: () => {},
});

function isColorTheme(value: unknown): value is ColorThemeKey {
  return value === "teal" || value === "lavender" || value === "warm" || value === "ocean";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [colorTheme, setColorThemeState] = useState<ColorThemeKey>("teal");
  const [clockFormat, setClockFormatState] = useState<ClockFormat>("24h");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme() ?? "light");

  useEffect(() => {
    (async () => {
      try {
        const [storedTheme, storedColorTheme, storedClock] = await Promise.all([
          storage.getItem(THEME_STORAGE_KEY, "light" as ThemeMode),
          storage.getItem(COLOR_THEME_STORAGE_KEY, "teal" as ColorThemeKey),
          storage.getItem(CLOCK_STORAGE_KEY, "24h" as ClockFormat),
        ]);
        if (storedTheme === "auto" || storedTheme === "light" || storedTheme === "dark") setModeState(storedTheme);
        if (isColorTheme(storedColorTheme)) setColorThemeState(storedColorTheme);
        if (storedClock === "12h" || storedClock === "24h") setClockFormatState(storedClock);
      } catch {}
    })();

    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme ?? "light"));
    return () => sub.remove();
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    storage.setItem(THEME_STORAGE_KEY, m).catch(() => {});
  };

  const setColorTheme = (theme: ColorThemeKey) => {
    setColorThemeState(theme);
    storage.setItem(COLOR_THEME_STORAGE_KEY, theme).catch(() => {});
  };

  const setClockFormat = (format: ClockFormat) => {
    setClockFormatState(format);
    storage.setItem(CLOCK_STORAGE_KEY, format).catch(() => {});
  };

  const effective: EffectiveMode = mode === "auto" ? (systemScheme === "dark" ? "dark" : "light") : mode;
  const colors = PALETTES[colorTheme][effective];

  const value = useMemo<ThemeCtx>(
    () => ({ mode, effective, colors, setMode, colorTheme, setColorTheme, clockFormat, setClockFormat }),
    [mode, effective, colors, colorTheme, clockFormat],
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeCtx {
  return useContext(ThemeContext);
}