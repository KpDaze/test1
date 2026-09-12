import React from "react";
import { Text, View, type ColorValue } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";
import { fonts, typeScale } from "@/src/theme";
import { useDesignSystem } from "@/src/designSystem";

type IoniconName = React.ComponentProps<typeof Icon>["name"];

function TabIcon({ active, color, size, filled, outline }: { active: boolean; color: ColorValue; size: number; filled: IoniconName; outline: IoniconName }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", minWidth: 38 }}>
      <Icon name={active ? filled : outline} size={Math.max(size, 27)} color={color as string} />
    </View>
  );
}

function TabLabel({ label, focused, color }: { label: string; focused: boolean; color: ColorValue }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: color as string, fontFamily: focused ? fonts.textBold : fonts.textMedium, ...typeScale.tabLabel, fontWeight: focused ? "800" : typeScale.tabLabel.fontWeight }}>{label}</Text>
      <View style={{ width: focused ? 31 : 0, height: 3, borderRadius: 999, backgroundColor: focused ? color : "transparent", marginTop: 5 }} />
    </View>
  );
}

export default function TabsLayout() {
  const { visual, layout } = useDesignSystem();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  const label = (text: string) => ({ focused, color }: { focused: boolean; color: ColorValue }) => <TabLabel label={text} focused={focused} color={color} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: visual.card,
          borderTopColor: visual.border,
          borderTopWidth: 1,
          height: layout.bottomNavBaseHeight + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
        },
        tabBarActiveTintColor: visual.accentStrong,
        tabBarInactiveTintColor: visual.muted,
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarLabel: label("Home"), tabBarIcon: ({ color, size, focused }) => <TabIcon active={focused} color={color} size={size} filled="home" outline="home-outline" /> }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar", tabBarLabel: label("Calendar"), tabBarIcon: ({ color, size, focused }) => <TabIcon active={focused} color={color} size={size} filled="calendar" outline="calendar-outline" /> }} />
      <Tabs.Screen name="scan" options={{ title: "Scan", tabBarLabel: label("Scan"), tabBarIcon: ({ color, size, focused }) => <TabIcon active={focused} color={color} size={size} filled="scan" outline="scan-outline" /> }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarLabel: label("Settings"), tabBarIcon: ({ color, size, focused }) => <TabIcon active={focused} color={color} size={size} filled="settings" outline="settings-outline" /> }} />
    </Tabs>
  );
}
