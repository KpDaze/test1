import { useMemo, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { fonts, typeScale, type Palette } from "@/src/theme";
import { componentTokens, layoutTokens, useDesignSystem } from "@/src/designSystem";
import { Pressable } from "@/src/components/FeedbackPressable";
import { ensureNotificationPermission } from "@/src/notifications";

const BRAND_MARK = require("../assets/branding/shiftmate-mark-source.png");

export default function Onboarding() {
  const { colors, visual } = useDesignSystem();
  const styles = useMemo(() => makeStyles(colors, visual), [colors, visual]);
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
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: layoutTokens.screenPadding, paddingBottom: insets.bottom + 30 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <Image source={BRAND_MARK} resizeMode="contain" style={styles.brandMark} />
          <View style={styles.brandTextBlock}>
            <Text allowFontScaling={false} style={styles.brandName}>ShiftMate</Text>
            <Text allowFontScaling={false} style={styles.tagline}>SUPPORTING BRIGHTER DAYS</Text>
          </View>
        </View>

        <View style={styles.progressRow}>
          <View style={[styles.progressBar, styles.progressActive]} />
          <View style={[styles.progressBar, step === 1 && styles.progressActive]} />
        </View>
        <Text allowFontScaling={false} style={styles.stepText}>STEP {step + 1} OF 2</Text>
        <Text allowFontScaling={false} style={styles.title}>{step === 0 ? "Welcome to ShiftMate" : "Add your main workplace"}</Text>
        <Text allowFontScaling={false} style={styles.subtitle}>{step === 0 ? "First, tell ShiftMate the name it should look for when reading your roster." : "This becomes your default house. You can add or edit more houses later in Settings."}</Text>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View style={styles.iconCircle}><Icon name={step === 0 ? "person-outline" : "home-outline"} size={19} color={visual.accentMid} /></View>
            <View style={styles.cardHeadingText}>
              <Text allowFontScaling={false} style={styles.cardEyebrow}>{step === 0 ? "YOUR PROFILE" : "DEFAULT HOUSE"}</Text>
              <Text allowFontScaling={false} style={styles.cardTitle}>{step === 0 ? "How your name appears" : "Where you usually work"}</Text>
            </View>
          </View>

          {step === 0 ? (
            <>
              <Text allowFontScaling={false} style={styles.label}>Name as it appears on the roster</Text>
              <TextInput testID="onboarding-name-input" value={name} onChangeText={setName} placeholder="Roster name" placeholderTextColor={visual.muted} style={styles.input} autoFocus returnKeyType="next" />
              <Pressable testID="onboarding-next-btn" disabled={!name.trim()} onPress={() => setStep(1)} style={[styles.primaryButton, !name.trim() && styles.disabled]}>
                <Text allowFontScaling={false} style={styles.primaryText}>Continue</Text><Icon name="arrow-forward" size={17} color={visual.onAccent} />
              </Pressable>
            </>
          ) : (
            <>
              <Text allowFontScaling={false} style={styles.label}>House name</Text>
              <TextInput testID="onboarding-house-name-input" value={houseName} onChangeText={setHouseName} placeholder="Workplace name" placeholderTextColor={visual.muted} style={styles.input} autoFocus />
              <Text allowFontScaling={false} style={[styles.label, styles.addressLabel]}>Address <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput testID="onboarding-house-address-input" value={houseAddress} onChangeText={setHouseAddress} placeholder="Workplace address" placeholderTextColor={visual.muted} style={styles.input} />
              <Pressable testID="onboarding-finish-btn" disabled={!houseName.trim() || saving} onPress={finish} style={[styles.primaryButton, (!houseName.trim() || saving) && styles.disabled]}>
                {saving ? <ActivityIndicator color={visual.onAccent} /> : <><Text allowFontScaling={false} style={styles.primaryText}>Get started</Text><Icon name="checkmark" size={18} color={visual.onAccent} /></>}
              </Pressable>
              <Pressable testID="onboarding-back-btn" onPress={() => setStep(0)} style={styles.backButton}><Icon name="chevron-back" size={15} color={visual.accentStrong} /><Text allowFontScaling={false} style={styles.backText}>Back</Text></Pressable>
            </>
          )}
        </View>

        <View style={styles.localNote}><Icon name="phone-portrait-outline" size={17} color={visual.accentMid} /><Text allowFontScaling={false} style={styles.localText}>Your ShiftMate profile, houses and shifts are stored locally on this phone.</Text></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Palette, visual: ReturnType<typeof useDesignSystem>["visual"]) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: visual.page },
    brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 30 },
    brandMark: { width: 48, height: 48, borderRadius: componentTokens.compactCardRadius, backgroundColor: visual.accent, marginRight: 8, transform: [{ rotate: "-8deg" }] },
    brandTextBlock: { justifyContent: "center" },
    brandName: { fontFamily: fonts.displayBold, ...typeScale.wordmark, color: visual.textStrong },
    tagline: { fontFamily: fonts.textBold, ...typeScale.micro, color: visual.muted, marginTop: 1, letterSpacing: 1.4 },
    progressRow: { flexDirection: "row", gap: 7, marginBottom: 9 },
    progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: visual.cardMuted },
    progressActive: { backgroundColor: visual.accent },
    stepText: { fontFamily: fonts.textBold, ...typeScale.eyebrow, color: visual.accentStrong, marginBottom: 7 },
    title: { fontFamily: fonts.displayBold, ...typeScale.screenTitle, color: visual.text },
    subtitle: { fontFamily: fonts.text, ...typeScale.body, color: visual.muted, marginTop: 5, marginBottom: 20 },
    card: { backgroundColor: visual.card, borderWidth: 1, borderColor: visual.border, borderRadius: componentTokens.cardRadius, padding: componentTokens.cardPadding, shadowColor: visual.steel, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    cardHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
    cardHeadingText: { flex: 1 },
    iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: visual.accentSurface, alignItems: "center", justifyContent: "center" },
    cardEyebrow: { fontFamily: fonts.textBold, ...typeScale.eyebrow, color: visual.accentStrong },
    cardTitle: { fontFamily: fonts.displayBold, ...typeScale.cardTitle, color: visual.text, marginTop: 2 },
    label: { fontFamily: fonts.textBold, ...typeScale.label, color: visual.textStrong, marginBottom: 7 },
    addressLabel: { marginTop: 14 },
    optional: { color: visual.muted, fontWeight: "600" },
    input: { fontFamily: fonts.text, ...typeScale.input, backgroundColor: visual.page, color: visual.text, borderWidth: 1, borderColor: visual.border, borderRadius: componentTokens.controlRadius, paddingHorizontal: 13, paddingVertical: 12, minHeight: layoutTokens.touchTarget },
    primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: visual.accent, borderRadius: componentTokens.controlRadius, marginTop: 18, minHeight: layoutTokens.touchTarget },
    primaryText: { fontFamily: fonts.textBold, ...typeScale.button, color: visual.onAccent },
    disabled: { opacity: 0.4 },
    backButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 11, minHeight: 36 },
    backText: { fontFamily: fonts.textBold, ...typeScale.action, color: visual.accentStrong },
    localNote: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 16, backgroundColor: visual.accentSurface, borderRadius: componentTokens.controlRadius, paddingHorizontal: 12, paddingVertical: 10 },
    localText: { fontFamily: fonts.text, ...typeScale.caption, color: colors.onSurfaceSecondary, flex: 1 },
  });
}
