import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Alert,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";
import { api, House, Profile } from "@/src/api";
import { useTheme, COLOR_THEMES, radius, type Palette, type ThemeMode, type ClockFormat, fonts, typeScale } from "@/src/theme";
import { Pressable } from "@/src/components/FeedbackPressable";
import { fmtDMY, todayIso as tIso } from "@/src/timeUtils";
import InlineDatePicker from "@/src/components/InlineDatePicker";
import {
  scheduleEndOfCycleReminders,
  cancelEndOfCycleReminders,
  ensureNotificationPermission,
  rescheduleAllShiftAlarms,
} from "@/src/notifications";
import { exportLocalBackup, pickAndRestoreLocalBackup } from "@/src/localBackup";
import { storage } from "@/src/utils/storage";
import { END_OF_CYCLE_REMINDERS_KEY, upcomingPayCycleEndDates } from "@/src/payCycleReminderState";

function SectionTitle({ icon, title, subtitle, colors, styles }: {
  icon: React.ComponentProps<typeof Icon>["name"];
  title: string;
  subtitle?: string;
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionIcon}><Icon name={icon} size={18} color={colors.brand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { colors, mode, setMode, colorTheme, setColorTheme, clockFormat, setClockFormat } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [leadHours, setLeadHours] = useState("2.5");
  const [payType, setPayType] = useState<"week" | "fortnight" | "month">("week");
  const [payStartDow, setPayStartDow] = useState(1);
  const [fortnightAnchor, setFortnightAnchor] = useState<string | null>(null);
  const [showAnchorPicker, setShowAnchorPicker] = useState(false);
  const [endCycleReminders, setEndCycleReminders] = useState(false);
  const [defaultRate, setDefaultRate] = useState("");
  const [newHouseName, setNewHouseName] = useState("");
  const [newHouseAddr, setNewHouseAddr] = useState("");
  const [newHouseDifferentRate, setNewHouseDifferentRate] = useState(false);
  const [newHouseRate, setNewHouseRate] = useState("");
  const [addingHouse, setAddingHouse] = useState(false);
  const [editingHouseId, setEditingHouseId] = useState<string | null>(null);
  const [editHouseName, setEditHouseName] = useState("");
  const [editHouseAddr, setEditHouseAddr] = useState("");
  const [editHouseRate, setEditHouseRate] = useState("");
  const [savingHouse, setSavingHouse] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  const refreshEndCycleSchedule = useCallback(async () => {
    await scheduleEndOfCycleReminders(await upcomingPayCycleEndDates(12));
  }, []);

  const load = useCallback(async () => {
    const [p, h, remindersEnabled] = await Promise.all([
      api.getProfile(),
      api.listHouses(),
      storage.getItem(END_OF_CYCLE_REMINDERS_KEY, false),
    ]);
    let loadedProfile = p;
    let rate = p.default_hourly_rate ?? 0;
    if (rate <= 0) {
      const inheritedRate = h.find((house) => house.is_default)?.hourly_rate ?? h[0]?.hourly_rate ?? 0;
      if (inheritedRate > 0) {
        loadedProfile = await api.updateProfile({ default_hourly_rate: inheritedRate });
        rate = inheritedRate;
      }
    }
    setProfile(loadedProfile);
    setHouses(h);
    setName(loadedProfile.name);
    setLeadHours(String(loadedProfile.alarm_lead_minutes / 60));
    setPayType(loadedProfile.pay_period_type ?? "week");
    setPayStartDow(loadedProfile.pay_week_start_dow ?? 1);
    setFortnightAnchor(loadedProfile.pay_fortnight_anchor ?? null);
    setDefaultRate(rate > 0 ? String(rate) : "");
    setEndCycleReminders(Boolean(remindersEnabled));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveName = async () => {
    setSavingName(true);
    try { setProfile(await api.updateProfile({ name: name.trim() })); }
    finally { setSavingName(false); }
  };

  const saveLead = async (value: string) => {
    setLeadHours(value);
    const hours = Number(value);
    if (Number.isFinite(hours) && hours > 0 && hours <= 24) {
      setProfile(await api.updateProfile({ alarm_lead_minutes: Math.round(hours * 60) }));
    }
  };

  const saveDefaultRate = async () => {
    const rate = defaultRate.trim() ? Number(defaultRate) : 0;
    if (!Number.isFinite(rate) || rate < 0) {
      Alert.alert("Invalid pay rate", "Enter a valid hourly rate.");
      return;
    }
    setProfile(await api.updateProfile({ default_hourly_rate: rate }));
    setDefaultRate(rate > 0 ? String(rate) : "");
  };

  const afterPaySettingChange = async () => {
    if (endCycleReminders) await refreshEndCycleSchedule();
  };

  const setPayTypeAndSave = async (value: "week" | "fortnight" | "month") => {
    setPayType(value);
    setProfile(await api.updateProfile({ pay_period_type: value }));
    setTimeout(() => { void afterPaySettingChange(); }, 0);
  };

  const setPayStartDowAndSave = async (dow: number) => {
    setPayStartDow(dow);
    setProfile(await api.updateProfile({ pay_week_start_dow: dow }));
    setTimeout(() => { void afterPaySettingChange(); }, 0);
  };

  const applyAnchor = async (iso: string) => {
    setFortnightAnchor(iso);
    setProfile(await api.updateProfile({ pay_fortnight_anchor: iso }));
    setTimeout(() => { void afterPaySettingChange(); }, 0);
  };

  const toggleEndCycleReminders = async (enabled: boolean) => {
    setEndCycleReminders(enabled);
    if (enabled) {
      const allowed = await ensureNotificationPermission();
      if (!allowed) {
        setEndCycleReminders(false);
        await storage.setItem(END_OF_CYCLE_REMINDERS_KEY, false);
        return;
      }
      await storage.setItem(END_OF_CYCLE_REMINDERS_KEY, true);
      await refreshEndCycleSchedule();
    } else {
      await storage.setItem(END_OF_CYCLE_REMINDERS_KEY, false);
      await cancelEndOfCycleReminders();
    }
  };

  const addHouse = async () => {
    if (!newHouseName.trim()) return;
    setAddingHouse(true);
    try {
      const baseRate = defaultRate.trim() ? Number(defaultRate) : 0;
      const customRate = newHouseRate.trim() ? Number(newHouseRate) : 0;
      if (newHouseDifferentRate && (!Number.isFinite(customRate) || customRate < 0)) {
        Alert.alert("Invalid pay rate", "Enter a valid hourly rate for this house.");
        return;
      }
      const rate = newHouseDifferentRate ? customRate : Number.isFinite(baseRate) ? baseRate : 0;
      await api.addHouse({ name: newHouseName.trim(), address: newHouseAddr.trim(), is_default: houses.length === 0, hourly_rate: rate });
      if (!houses.length && (profile?.default_hourly_rate ?? 0) === 0 && rate > 0) await api.updateProfile({ default_hourly_rate: rate });
      setNewHouseName("");
      setNewHouseAddr("");
      setNewHouseRate("");
      setNewHouseDifferentRate(false);
      await load();
    } finally { setAddingHouse(false); }
  };

  const beginEditHouse = (house: House) => {
    setEditingHouseId(house.id);
    setEditHouseName(house.name);
    setEditHouseAddr(house.address || "");
    setEditHouseRate((house.hourly_rate ?? 0) > 0 ? String(house.hourly_rate) : "");
  };
  const cancelEditHouse = () => {
    setEditingHouseId(null);
    setEditHouseName("");
    setEditHouseAddr("");
    setEditHouseRate("");
  };
  const saveHouseEdit = async (house: House) => {
    if (!editHouseName.trim()) return Alert.alert("House name required", "Enter a house name before saving.");
    const rate = editHouseRate.trim() ? Number(editHouseRate) : 0;
    if (!Number.isFinite(rate) || rate < 0) return Alert.alert("Invalid pay rate", "Enter a valid hourly rate for this house.");
    setSavingHouse(true);
    try {
      await api.updateHouse(house.id, { name: editHouseName.trim(), address: editHouseAddr.trim(), hourly_rate: rate });
      cancelEditHouse();
      await load();
    } finally { setSavingHouse(false); }
  };
  const makeDefault = async (house: House) => { await api.updateHouse(house.id, { is_default: true }); await load(); };
  const removeHouse = async (id: string) => { await api.deleteHouse(id); if (editingHouseId === id) cancelEditHouse(); await load(); };

  const exportBackup = async () => {
    setBackupBusy(true); setBackupStatus(null);
    try { await exportLocalBackup(); setBackupStatus("Backup created. Save it somewhere outside this phone."); }
    catch (error: any) { setBackupStatus(error?.message || "Backup could not be created."); }
    finally { setBackupBusy(false); }
  };

  const restoreBackup = () => Alert.alert(
    "Restore ShiftMate backup?",
    "This replaces the local profile, houses, shifts, deleted-shift records and full change history on this phone.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Choose backup",
        style: "destructive",
        onPress: async () => {
          setBackupBusy(true); setBackupStatus(null);
          try {
            const restored = await pickAndRestoreLocalBackup();
            await load();
            const alarms = await rescheduleAllShiftAlarms();
            setBackupStatus(`Restored ${restored.shifts} shifts and ${restored.changes} change records. ${alarms.needsExactAlarmPermission ? "Allow alarms and reminders to restore shift alarms." : `Scheduled ${alarms.scheduled} upcoming alarms.`}`);
          } catch (error: any) {
            if (error?.message !== "Backup selection cancelled.") setBackupStatus(error?.message || "Backup could not be restored.");
          } finally { setBackupBusy(false); }
        },
      },
    ],
  );

  const defaultRateValue = defaultRate.trim() ? Number(defaultRate) : 0;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.logoMark}><Icon name="heart" size={22} color={colors.onBrandPrimary} /></View>
          <View style={{ flex: 1 }}><Text style={styles.brandSmall}>ShiftMate</Text><Text style={styles.title}>Settings</Text></View>
        </View>

        <SectionTitle icon="person-outline" title="Profile" subtitle="Used to find your row when scanning rosters" colors={colors} styles={styles} />
        <View style={styles.card}>
          <Text style={styles.label}>Your name</Text>
          <View style={styles.inlineRow}>
            <TextInput testID="settings-name-input" value={name} onChangeText={setName} style={styles.input} placeholder="Your name" placeholderTextColor={colors.muted} />
            <Pressable testID="settings-name-save" onPress={saveName} style={styles.primarySmall} disabled={savingName || name === profile?.name}>
              {savingName ? <ActivityIndicator color={colors.onBrandPrimary} size="small" /> : <Text style={styles.primarySmallText}>Save</Text>}
            </Pressable>
          </View>
        </View>

        <SectionTitle icon="alarm-outline" title="Shift alarm" subtitle="Your normal alarm before each shift" colors={colors} styles={styles} />
        <View style={styles.card}>
          <Text style={styles.label}>Hours before shift</Text>
          <TextInput testID="settings-lead-input" value={leadHours} onChangeText={saveLead} keyboardType="decimal-pad" style={styles.input} placeholder="2.5" placeholderTextColor={colors.muted} />
          <Text style={styles.help}>Default is 2.5 hours. Snooze remains available when the alarm rings.</Text>
        </View>

        <SectionTitle icon="calendar-outline" title="Pay period" subtitle="Controls your pay-period totals and timesheet reminder dates" colors={colors} styles={styles} />
        <View style={styles.card}>
          <Text style={styles.label}>Payroll cycle</Text>
          <View style={styles.segmented} testID="pay-type-tabs">
            {(["week", "fortnight", "month"] as const).map((type) => (
              <Pressable key={type} testID={`pay-type-${type}`} onPress={() => setPayTypeAndSave(type)} style={[styles.segment, payType === type && styles.segmentActive]}>
                <Text style={[styles.segmentText, payType === type && styles.segmentTextActive]}>{type === "week" ? "Weekly" : type === "fortnight" ? "Fortnightly" : "Monthly"}</Text>
              </Pressable>
            ))}
          </View>

          {payType === "week" ? (
            <>
              <Text style={styles.subLabel}>Week starts on</Text>
              <View style={styles.dowRow}>
                {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
                  <Pressable key={index} testID={`pay-dow-${index}`} onPress={() => setPayStartDowAndSave(index)} style={[styles.dowChip, payStartDow === index && styles.dowChipActive]}>
                    <Text style={[styles.dowText, payStartDow === index && styles.dowTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {payType === "fortnight" ? (
            <>
              <Text style={styles.subLabel}>Known fortnight start</Text>
              <Pressable testID="pay-anchor-btn" onPress={() => setShowAnchorPicker(true)} style={styles.anchorButton}>
                <Icon name="calendar" size={18} color={colors.brand} />
                <Text style={styles.anchorText}>{fortnightAnchor ? fmtDMY(fortnightAnchor) : "Choose a known start date"}</Text>
              </Pressable>
              <Text style={styles.help}>Choose one date you know was the first day of a real pay fortnight. ShiftMate uses that date to calculate every fortnight automatically.</Text>
            </>
          ) : null}

          <View style={styles.reminderRow}>
            <View style={styles.reminderIcon}><Icon name="notifications-outline" size={20} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.reminderTitle}>End-of-cycle reminders</Text>
              <Text style={styles.helpCompact}>Reminds you the day before and on the final day so you can submit your timesheet. Future cycles are kept scheduled.</Text>
            </View>
            <Switch testID="pay-cycle-alerts-toggle" value={endCycleReminders} onValueChange={toggleEndCycleReminders} trackColor={{ false: colors.surfaceTertiary, true: colors.brand }} />
          </View>
        </View>

        <InlineDatePicker visible={showAnchorPicker} value={fortnightAnchor || tIso()} onChange={applyAnchor} onClose={() => setShowAnchorPicker(false)} />

        <SectionTitle icon="shield-checkmark-outline" title="Local backup" subtitle="Keep your shifts and edit history safe" colors={colors} styles={styles} />
        <View style={styles.card}>
          <Text style={styles.helpNoTop}>Backups include your profile, houses, shifts, deleted-shift history, roster scans and full edit history.</Text>
          <View style={styles.twoButtonRow}>
            <Pressable testID="backup-export-btn" style={styles.secondaryButton} onPress={exportBackup} disabled={backupBusy}><Icon name="share-outline" size={17} color={colors.brand} /><Text style={styles.secondaryButtonText}>Export backup</Text></Pressable>
            <Pressable testID="backup-restore-btn" style={styles.secondaryButton} onPress={restoreBackup} disabled={backupBusy}><Icon name="download-outline" size={17} color={colors.brand} /><Text style={styles.secondaryButtonText}>Restore</Text></Pressable>
          </View>
          {backupBusy ? <ActivityIndicator color={colors.brand} style={{ marginTop: 12 }} /> : null}
          {backupStatus ? <Text style={styles.statusText}>{backupStatus}</Text> : null}
        </View>

        <SectionTitle icon="home-outline" title="My houses & pay rates" subtitle="Used for roster labels and estimated pay" colors={colors} styles={styles} />
        <View style={styles.card} testID="default-pay-rate-card">
          <Text style={styles.label}>Default hourly rate</Text>
          <View style={styles.rateRow}><Text style={styles.currency}>$</Text><TextInput testID="default-hourly-rate" value={defaultRate} onChangeText={setDefaultRate} onBlur={saveDefaultRate} keyboardType="decimal-pad" style={styles.rateInput} placeholder="Enter rate" placeholderTextColor={colors.muted} /><Text style={styles.rateSuffix}>/hr</Text></View>
          <Text style={styles.help}>New houses use this rate unless you choose a different rate for that house.</Text>
        </View>

        {houses.map((house) => editingHouseId === house.id ? (
          <View key={house.id} style={[styles.card, styles.editCard]} testID={`house-edit-${house.id}`}>
            <View style={styles.houseTop}><Text style={styles.houseName}>Edit {house.name}</Text>{house.is_default ? <View style={styles.defaultPill}><Text style={styles.defaultText}>DEFAULT</Text></View> : null}</View>
            <TextInput value={editHouseName} onChangeText={setEditHouseName} style={styles.input} placeholder="House name" placeholderTextColor={colors.muted} />
            <TextInput value={editHouseAddr} onChangeText={setEditHouseAddr} style={[styles.input, { marginTop: 8 }]} placeholder="Address (optional)" placeholderTextColor={colors.muted} />
            <View style={[styles.rateRow, { marginTop: 8 }]}><Text style={styles.currency}>$</Text><TextInput value={editHouseRate} onChangeText={setEditHouseRate} keyboardType="decimal-pad" style={styles.rateInput} placeholder="Hourly rate" placeholderTextColor={colors.muted} /><Text style={styles.rateSuffix}>/hr</Text></View>
            <View style={styles.twoButtonRow}><Pressable onPress={cancelEditHouse} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable><Pressable onPress={() => saveHouseEdit(house)} style={styles.primaryButton} disabled={savingHouse}>{savingHouse ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.primaryButtonText}>Save changes</Text>}</Pressable></View>
          </View>
        ) : (
          <View key={house.id} style={styles.houseCard} testID={`house-row-${house.id}`}>
            <View style={styles.houseIcon}><Icon name="home" size={18} color={colors.brand} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.houseTop}><Text style={styles.houseName} numberOfLines={1}>{house.name}</Text>{house.is_default ? <View style={styles.defaultPill}><Text style={styles.defaultText}>DEFAULT</Text></View> : null}</View>
              {house.address ? <Text style={styles.houseAddress} numberOfLines={1}>{house.address}</Text> : null}
              <Text style={styles.houseRate}>{(house.hourly_rate ?? 0) > 0 ? `$${house.hourly_rate!.toFixed(2)}/hr` : "No pay rate set"}</Text>
            </View>
            <Pressable onPress={() => beginEditHouse(house)} style={styles.iconButton}><Icon name="pencil-outline" size={17} color={colors.brand} /></Pressable>
            {!house.is_default ? <Pressable onPress={() => makeDefault(house)} style={styles.iconButton}><Icon name="star-outline" size={17} color={colors.brand} /></Pressable> : null}
            <Pressable onPress={() => removeHouse(house.id)} style={styles.iconButton}><Icon name="trash-outline" size={17} color={colors.error} /></Pressable>
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.label}>Add a house</Text>
          <TextInput testID="new-house-name" value={newHouseName} onChangeText={setNewHouseName} style={styles.input} placeholder="House name" placeholderTextColor={colors.muted} />
          <TextInput testID="new-house-address" value={newHouseAddr} onChangeText={setNewHouseAddr} style={[styles.input, { marginTop: 8 }]} placeholder="Address (optional)" placeholderTextColor={colors.muted} />
          <View style={styles.toggleRow}><View style={{ flex: 1 }}><Text style={styles.toggleTitle}>Different pay rate?</Text><Text style={styles.helpCompact}>{newHouseDifferentRate ? "Enter this house's rate below." : defaultRateValue > 0 ? `Uses $${defaultRateValue.toFixed(2)}/hr.` : "Uses your default rate."}</Text></View><Switch testID="new-house-different-rate" value={newHouseDifferentRate} onValueChange={setNewHouseDifferentRate} trackColor={{ false: colors.surfaceTertiary, true: colors.brand }} /></View>
          {newHouseDifferentRate ? <View style={[styles.rateRow, { marginTop: 8 }]}><Text style={styles.currency}>$</Text><TextInput testID="new-house-rate" value={newHouseRate} onChangeText={setNewHouseRate} keyboardType="decimal-pad" style={styles.rateInput} placeholder="Different hourly rate" placeholderTextColor={colors.muted} /><Text style={styles.rateSuffix}>/hr</Text></View> : null}
          <Pressable testID="new-house-add-btn" onPress={addHouse} style={styles.primaryWide} disabled={addingHouse || !newHouseName.trim()}>{addingHouse ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.primaryButtonText}>Add house</Text>}</Pressable>
        </View>

        <SectionTitle icon="color-palette-outline" title="Appearance" subtitle="Colour, light/dark mode and clock format" colors={colors} styles={styles} />
        <View style={styles.card}>
          <Text style={styles.label}>Colour theme</Text>
          <View style={styles.themeGrid} testID="colour-theme-picker">
            {COLOR_THEMES.map((theme) => {
              const selected = colorTheme === theme.key;
              return (
                <Pressable key={theme.key} testID={`colour-theme-${theme.key}`} onPress={() => setColorTheme(theme.key)} style={[styles.themeOption, selected && styles.themeOptionSelected]}>
                  <View style={styles.swatches}>{theme.swatches.map((swatch) => <View key={swatch} style={[styles.swatch, { backgroundColor: swatch }]} />)}</View>
                  <View style={{ flex: 1 }}><Text style={styles.themeName}>{theme.label}</Text><Text style={styles.themeDescription}>{theme.description}</Text></View>
                  {selected ? <View style={styles.checkCircle}><Icon name="checkmark" size={14} color={colors.onBrandPrimary} /></View> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.subLabel}>Light / dark mode</Text>
          <View style={styles.segmented} testID="theme-mode-tabs">{(["auto", "light", "dark"] as ThemeMode[]).map((value) => <Pressable key={value} testID={`theme-mode-${value}`} onPress={() => setMode(value)} style={[styles.segment, mode === value && styles.segmentActive]}><Text style={[styles.segmentText, mode === value && styles.segmentTextActive]}>{value === "auto" ? "Auto" : value === "light" ? "Light" : "Dark"}</Text></Pressable>)}</View>
          <Text style={styles.subLabel}>Clock</Text>
          <View style={styles.segmented} testID="clock-format-tabs">{(["12h", "24h"] as ClockFormat[]).map((value) => <Pressable key={value} testID={`clock-format-${value}`} onPress={() => setClockFormat(value)} style={[styles.segment, clockFormat === value && styles.segmentActive]}><Text style={[styles.segmentText, clockFormat === value && styles.segmentTextActive]}>{value === "12h" ? "12-hour" : "24-hour"}</Text></Pressable>)}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 23 },
    logoMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] },
    brandSmall: { fontFamily: fonts.textBold, ...typeScale.eyebrow, color: colors.brand },
    title: { fontFamily: fonts.displayBold, ...typeScale.screenTitle, color: colors.onSurface },
    sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 9 },
    sectionIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    sectionTitle: { fontFamily: fonts.displayBold, ...typeScale.sectionTitleCompact, color: colors.onSurface },
    sectionSubtitle: { fontFamily: fonts.text, ...typeScale.bodySmall, color: colors.muted, marginTop: 1 },
    card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 15, marginBottom: 10 },
    editCard: { borderColor: colors.brand },
    label: { fontFamily: fonts.textBold, ...typeScale.label, color: colors.onSurfaceSecondary, marginBottom: 7 },
    subLabel: { fontFamily: fonts.textBold, ...typeScale.label, color: colors.onSurfaceSecondary, marginTop: 17, marginBottom: 7 },
    help: { fontFamily: fonts.text, ...typeScale.bodySmall, color: colors.muted, marginTop: 7 },
    helpNoTop: { fontFamily: fonts.text, ...typeScale.bodySmall, color: colors.muted },
    helpCompact: { fontFamily: fonts.text, ...typeScale.caption, color: colors.muted, marginTop: 2 },
    input: { fontFamily: fonts.text, ...typeScale.input, flex: 1, backgroundColor: colors.surface, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
    inlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    primarySmall: { backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12 },
    primarySmallText: { fontFamily: fonts.textBold, ...typeScale.action, color: colors.onBrandPrimary },
    segmented: { flexDirection: "row", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, padding: 4 },
    segment: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.pill },
    segmentActive: { backgroundColor: colors.brand },
    segmentText: { fontFamily: fonts.textMedium, ...typeScale.action, color: colors.muted },
    segmentTextActive: { color: colors.onBrandPrimary, fontWeight: "800" },
    dowRow: { flexDirection: "row", justifyContent: "space-between", gap: 5 },
    dowChip: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    dowChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    dowText: { fontFamily: fonts.textBold, ...typeScale.label, color: colors.onSurfaceSecondary },
    dowTextActive: { color: colors.onBrandPrimary },
    anchorButton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 },
    anchorText: { fontFamily: fonts.textMedium, ...typeScale.itemTitle, color: colors.onSurface },
    stepRow: { flexDirection: "row", gap: 7, marginTop: 8 },
    stepButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: colors.brandTertiary, borderRadius: 11, paddingVertical: 9 },
    stepText: { fontFamily: fonts.textBold, ...typeScale.micro, color: colors.onBrandTertiary },
    reminderRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 17, paddingTop: 15 },
    reminderIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    reminderTitle: { fontFamily: fonts.textBold, ...typeScale.itemTitle, color: colors.onSurface },
    twoButtonRow: { flexDirection: "row", gap: 8, marginTop: 12 },
    secondaryButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: colors.brandTertiary, borderRadius: 12, paddingVertical: 10 },
    secondaryButtonText: { fontFamily: fonts.textBold, ...typeScale.action, color: colors.onBrandTertiary },
    primaryButton: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 10 },
    primaryButtonText: { fontFamily: fonts.textBold, ...typeScale.action, color: colors.onBrandPrimary },
    statusText: { fontFamily: fonts.text, ...typeScale.bodySmall, color: colors.onSurfaceSecondary, marginTop: 10 },
    rateRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12 },
    currency: { fontFamily: fonts.displayBold, ...typeScale.statValue, color: colors.brand },
    rateInput: { fontFamily: fonts.text, ...typeScale.input, flex: 1, color: colors.onSurface, paddingHorizontal: 8, paddingVertical: 11 },
    rateSuffix: { fontFamily: fonts.textMedium, ...typeScale.action, color: colors.muted },
    houseCard: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, marginBottom: 8 },
    houseIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    houseTop: { flexDirection: "row", alignItems: "center", gap: 6 },
    houseName: { fontFamily: fonts.textBold, ...typeScale.itemTitle, color: colors.onSurface, flexShrink: 1 },
    houseAddress: { fontFamily: fonts.text, ...typeScale.caption, color: colors.muted, marginTop: 2 },
    houseRate: { fontFamily: fonts.textBold, ...typeScale.label, color: colors.brand, marginTop: 3 },
    defaultPill: { backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
    defaultText: { fontFamily: fonts.textBold, ...typeScale.micro, color: colors.onBrandTertiary },
    iconButton: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
    toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
    toggleTitle: { fontFamily: fonts.textBold, ...typeScale.itemTitle, color: colors.onSurface },
    primaryWide: { backgroundColor: colors.brand, borderRadius: 12, alignItems: "center", paddingVertical: 12, marginTop: 12 },
    themeGrid: { gap: 7 },
    themeOption: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 10 },
    themeOptionSelected: { borderColor: colors.brand, borderWidth: 2 },
    swatches: { flexDirection: "row", gap: 3 },
    swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.border },
    themeName: { fontFamily: fonts.textBold, ...typeScale.label, color: colors.onSurface },
    themeDescription: { fontFamily: fonts.text, ...typeScale.micro, color: colors.muted, marginTop: 1 },
    checkCircle: { width: 25, height: 25, borderRadius: 13, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  });
}
