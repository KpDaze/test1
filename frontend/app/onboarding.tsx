import { useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useTheme, radius, type Palette } from "@/src/theme";
import { Pressable } from "@/src/components/FeedbackPressable";
import { ensureNotificationPermission } from "@/src/notifications";

export default function Onboarding() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [houseName, setHouseName] = useState("");
  const [houseAddress, setHouseAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      const house = await api.addHouse({ name: houseName.trim(), address: houseAddress.trim(), is_default: true });
      await api.updateProfile({ name: name.trim(), default_house_id: house.id });
      await ensureNotificationPermission();
      router.replace("/(tabs)");
    } catch (e) { console.warn(e); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 24, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.logoMark}>
            <View style={[styles.logoHead, { left: 10 }]} />
            <View style={[styles.logoHead, { right: 10 }]} />
            <Icon name="heart" size={28} color={colors.brand} style={styles.logoHeart} />
          </View>
          <View><Text style={styles.brandName}>ShiftMate</Text><Text style={styles.tagline}>SUPPORTING BRIGHTER DAYS</Text></View>
        </View>

        <View style={styles.progressRow}>
          <View style={[styles.progressBar, styles.progressActive]} />
          <View style={[styles.progressBar, step === 1 && styles.progressActive]} />
        </View>
        <Text style={styles.stepText}>STEP {step + 1} OF 2</Text>
        <Text style={styles.title}>{step === 0 ? "Welcome to ShiftMate" : "Add your main workplace"}</Text>
        <Text style={styles.subtitle}>{step === 0 ? "First, tell ShiftMate the name it should look for when reading your roster." : "This becomes your default house. You can add or edit more houses later in Settings."}</Text>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View style={styles.iconCircle}><Icon name={step === 0 ? "person-outline" : "home-outline"} size={20} color={colors.brand} /></View>
            <View style={{ flex: 1 }}><Text style={styles.cardEyebrow}>{step === 0 ? "YOUR PROFILE" : "DEFAULT HOUSE"}</Text><Text style={styles.cardTitle}>{step === 0 ? "How your name appears" : "Where you usually work"}</Text></View>
          </View>

          {step === 0 ? (
            <>
              <Text style={styles.label}>Name as it appears on the roster</Text>
              <TextInput testID="onboarding-name-input" value={name} onChangeText={setName} placeholder="e.g. Jamie Smith" placeholderTextColor={colors.muted} style={styles.input} autoFocus returnKeyType="next" />
              <Pressable testID="onboarding-next-btn" disabled={!name.trim()} onPress={() => setStep(1)} style={[styles.primaryButton, !name.trim() && styles.disabled]}><Text style={styles.primaryText}>Continue</Text><Icon name="arrow-forward" size={17} color={colors.onBrandPrimary} /></Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>House name</Text>
              <TextInput testID="onboarding-house-name-input" value={houseName} onChangeText={setHouseName} placeholder="e.g. Riverdale House" placeholderTextColor={colors.muted} style={styles.input} autoFocus />
              <Text style={[styles.label, { marginTop: 14 }]}>Address <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput testID="onboarding-house-address-input" value={houseAddress} onChangeText={setHouseAddress} placeholder="12 Example St" placeholderTextColor={colors.muted} style={styles.input} />
              <Pressable testID="onboarding-finish-btn" disabled={!houseName.trim() || saving} onPress={finish} style={[styles.primaryButton, (!houseName.trim() || saving) && styles.disabled]}>{saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Text style={styles.primaryText}>Get started</Text><Icon name="checkmark" size={18} color={colors.onBrandPrimary} /></>}</Pressable>
              <Pressable testID="onboarding-back-btn" onPress={() => setStep(0)} style={styles.backButton}><Icon name="chevron-back" size={15} color={colors.brand} /><Text style={styles.backText}>Back</Text></Pressable>
            </>
          )}
        </View>

        <View style={styles.localNote}><Icon name="phone-portrait-outline" size={17} color={colors.brand} /><Text style={styles.localText}>Your ShiftMate profile, houses and shifts are stored locally on this phone.</Text></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 38 },
    logoMark: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.brandTertiary, position: "relative", alignItems: "center", justifyContent: "center", transform: [{ rotate: "-7deg" }] },
    logoHead: { position: "absolute", top: 9, width: 11, height: 11, borderRadius: 6, backgroundColor: colors.brand },
    logoHeart: { marginTop: 12 },
    brandName: { color: colors.onSurface, fontSize: 30, fontWeight: "900", letterSpacing: -1.1 },
    tagline: { color: colors.brand, fontSize: 8, fontWeight: "900", letterSpacing: 1.45, marginTop: 1 },
    progressRow: { flexDirection: "row", gap: 7, marginBottom: 9 },
    progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary },
    progressActive: { backgroundColor: colors.brand },
    stepText: { color: colors.brand, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginBottom: 7 },
    title: { color: colors.onSurface, fontSize: 30, lineHeight: 33, fontWeight: "900", letterSpacing: -0.8 },
    subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 22 },
    card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 17 },
    cardHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 17 },
    iconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    cardEyebrow: { color: colors.brand, fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
    cardTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "900", marginTop: 2 },
    label: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", marginBottom: 7 },
    optional: { color: colors.muted, fontWeight: "600" },
    input: { backgroundColor: colors.surface, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 13, fontSize: 15 },
    primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.brand, borderRadius: 13, paddingVertical: 14, marginTop: 18 },
    primaryText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "900" },
    disabled: { opacity: 0.4 },
    backButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 13, paddingVertical: 7 },
    backText: { color: colors.brand, fontSize: 12, fontWeight: "800" },
    localNote: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 18, paddingHorizontal: 5 },
    localText: { color: colors.muted, fontSize: 10, lineHeight: 14, flex: 1 },
  });
}
