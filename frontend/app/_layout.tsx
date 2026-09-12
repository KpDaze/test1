import { useEffect } from "react";
import { Stack } from "expo-router";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "@/src/theme";
import { refreshEnabledPayCycleReminders } from "@/src/payCycleReminderState";

LogBox.ignoreAllLogs(true);

function AppShell() {
  const { colors, effective } = useTheme();

  useEffect(() => {
    void refreshEnabledPayCycleReminders().catch((error) => {
      console.warn("[pay-cycle reminders] refresh failed", error);
    });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style={effective === "light" ? "dark" : "light"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surface },
          animation: "fade",
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppShell />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
