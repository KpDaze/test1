import { useEffect, useMemo, useState } from "react";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { Redirect } from "expo-router";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useTheme, type Palette } from "@/src/theme";

export default function Index() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [route, setRoute] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const profile = await api.getProfile();
        setRoute(!profile.name || !profile.default_house_id ? "/onboarding" : "/(tabs)");
      } catch {
        setRoute("/onboarding");
      }
    })();
  }, []);

  if (!route) {
    return (
      <View style={styles.loading} testID="boot-loading">
        <View style={styles.logoMark}>
          <View style={[styles.logoHead, { left: 14 }]} />
          <View style={[styles.logoHead, { right: 14 }]} />
          <Icon name="heart" size={35} color={colors.brand} style={styles.heart} />
        </View>
        <Text style={styles.brand}>ShiftMate</Text>
        <Text style={styles.tagline}>SUPPORTING BRIGHTER DAYS</Text>
        <ActivityIndicator size="small" color={colors.brand} style={styles.spinner} />
      </View>
    );
  }
  return <Redirect href={route as any} />;
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    loading: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
    logoMark: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.brandTertiary, position: "relative", alignItems: "center", justifyContent: "center", transform: [{ rotate: "-7deg" }] },
    logoHead: { position: "absolute", top: 12, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.brand },
    heart: { marginTop: 16 },
    brand: { color: colors.onSurface, fontSize: 34, fontWeight: "900", letterSpacing: -1.2, marginTop: 16 },
    tagline: { color: colors.brand, fontSize: 8, fontWeight: "900", letterSpacing: 1.7, marginTop: 2 },
    spinner: { marginTop: 22 },
  });
}
