import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import {
  cancelNativeShiftAlarm,
  exactAlarmsAvailable,
  openExactAlarmSettings,
  scheduleNativeShiftAlarm,
  snoozeNativeShiftAlarm,
} from "@/modules/shiftmate-android/src";
import { api } from "./api";
import { storage } from "./utils/storage";
import { formatClockTime } from "./timeUtils";
import type { ClockFormat } from "./theme";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const CLOCK_STORAGE_KEY = "shiftmate.clock.format.v1";
const END_OF_CYCLE_PREFIX = "end-of-cycle-";

type NotifModule = typeof import("expo-notifications");
let Notifications: NotifModule | null = null;
let attempted = false;

function getNotifications(): NotifModule | null {
  if (Notifications) return Notifications;
  if (attempted) return null;
  attempted = true;
  if (isExpoGo && Platform.OS === "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-notifications") as NotifModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    Notifications = mod;
    return mod;
  } catch (e) {
    console.warn("[notifications] expo-notifications unavailable:", e);
    return null;
  }
}

getNotifications();

export function notificationsAvailable(): boolean {
  return getNotifications() !== null;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  try {
    const { status: existing } = await N.getPermissionsAsync();
    let final = existing;
    if (existing !== "granted") {
      const { status } = await N.requestPermissionsAsync();
      final = status;
    }
    if (Platform.OS === "android") {
      await N.setNotificationChannelAsync("shift-alarm", {
        name: "ShiftMate reminders",
        importance: N.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 500, 250, 500, 250, 500],
        enableVibrate: true,
        lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });
    }
    return final === "granted";
  } catch (e) {
    console.warn("[notifications] permission error:", e);
    return false;
  }
}

async function preferredClockFormat(): Promise<ClockFormat> {
  try {
    const stored = await storage.getItem(CLOCK_STORAGE_KEY, "24h" as ClockFormat);
    return stored === "12h" ? "12h" : "24h";
  } catch {
    return "24h";
  }
}

export async function scheduleShiftAlarm(
  shiftId: string,
  date: string,
  startTime: string,
  leadMinutes: number,
  houseName: string,
): Promise<string | null> {
  const [h, m] = startTime.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  const shiftStart = new Date(y, mo - 1, d, h, m, 0, 0);
  const trigger = new Date(shiftStart.getTime() - leadMinutes * 60_000);
  if (trigger.getTime() <= Date.now() + 5_000) return null;
  const clockFormat = await preferredClockFormat();
  const displayStart = formatClockTime(startTime, clockFormat);
  if (Platform.OS === "android") {
    if (!exactAlarmsAvailable()) {
      openExactAlarmSettings();
      throw new Error("Allow ShiftMate to set alarms and reminders, then save this shift again.");
    }
    return scheduleNativeShiftAlarm(
      shiftId,
      trigger.getTime(),
      "Shift starting soon",
      `${houseName || "Work"} at ${displayStart}`,
    );
  }
  const N = getNotifications();
  if (!N) return null;
  try {
    await cancelShiftAlarm(shiftId);
    return await N.scheduleNotificationAsync({
      identifier: `shift-${shiftId}`,
      content: {
        title: "Shift starting soon",
        body: `${houseName || "Work"} at ${displayStart}. ${leadMinutes} min lead.`,
        sound: "default",
        priority: N.AndroidNotificationPriority.MAX,
        vibrate: [0, 500, 250, 500],
        data: { shiftId, snoozable: true },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: trigger,
        channelId: "shift-alarm",
      },
    });
  } catch (e) {
    console.warn("[notifications] schedule failed:", e);
    return null;
  }
}

export async function cancelShiftAlarm(shiftId: string) {
  if (Platform.OS === "android") {
    await cancelNativeShiftAlarm(shiftId);
    return;
  }
  const N = getNotifications();
  if (!N) return;
  try { await N.cancelScheduledNotificationAsync(`shift-${shiftId}`); } catch {}
}

export async function snoozeShiftAlarm(shiftId: string, minutes: number, title: string, body: string) {
  if (Platform.OS === "android") {
    await snoozeNativeShiftAlarm(shiftId, minutes, title, body);
    return;
  }
  const N = getNotifications();
  if (!N) return;
  try {
    const trigger = new Date(Date.now() + minutes * 60_000);
    await N.scheduleNotificationAsync({
      identifier: `shift-${shiftId}-snooze-${Date.now()}`,
      content: {
        title,
        body,
        sound: "default",
        priority: N.AndroidNotificationPriority.MAX,
        vibrate: [0, 500, 250, 500],
        data: { shiftId, snoozable: true },
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: trigger, channelId: "shift-alarm" },
    });
  } catch (e) {
    console.warn("[notifications] snooze failed:", e);
  }
}

export async function cancelEndOfCycleReminders() {
  const N = getNotifications();
  if (!N) return;
  try {
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((item) => item.identifier.startsWith(END_OF_CYCLE_PREFIX) || item.identifier === "paycycle-day-before" || item.identifier === "paycycle-day-of")
        .map((item) => N.cancelScheduledNotificationAsync(item.identifier)),
    );
  } catch (e) {
    console.warn("[notifications] end-of-cycle cancellation failed:", e);
  }
}

// Schedule the timesheet reminders for several future pay-cycle end dates.
// This means the switch stays useful even if the app is not opened again before the next cycle.
export async function scheduleEndOfCycleReminders(endDatesIso: string[]) {
  const N = getNotifications();
  if (!N) return;
  try {
    await cancelEndOfCycleReminders();
    const now = Date.now();
    const uniqueDates = [...new Set(endDatesIso)].filter(Boolean).slice(0, 12);
    for (const endDateIso of uniqueDates) {
      const [y, m, d] = endDateIso.split("-").map(Number);
      const dayOf = new Date(y, m - 1, d, 9, 0, 0, 0);
      const dayBefore = new Date(dayOf.getTime() - 24 * 60 * 60 * 1000);

      if (dayBefore.getTime() > now + 5_000) {
        await N.scheduleNotificationAsync({
          identifier: `${END_OF_CYCLE_PREFIX}${endDateIso}-before`,
          content: {
            title: "Timesheet reminder",
            body: `Your pay cycle ends tomorrow (${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}). Check your shifts and get your timesheet ready.`,
            sound: "default",
            priority: N.AndroidNotificationPriority.HIGH,
            data: { kind: "end-of-cycle", when: "day-before", endDateIso },
          },
          trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: dayBefore, channelId: "shift-alarm" },
        });
      }

      if (dayOf.getTime() > now + 5_000) {
        await N.scheduleNotificationAsync({
          identifier: `${END_OF_CYCLE_PREFIX}${endDateIso}-day`,
          content: {
            title: "Timesheet due",
            body: "It is the last day of your pay cycle. Check and submit your timesheet.",
            sound: "default",
            priority: N.AndroidNotificationPriority.HIGH,
            data: { kind: "end-of-cycle", when: "day-of", endDateIso },
          },
          trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: dayOf, channelId: "shift-alarm" },
        });
      }
    }
  } catch (e) {
    console.warn("[notifications] end-of-cycle schedule failed:", e);
  }
}

// Backward-compatible names while older call sites are migrated.
export async function schedulePayCycleReminders(endDateIso: string) {
  await scheduleEndOfCycleReminders([endDateIso]);
}
export async function cancelPayCycleReminders() {
  await cancelEndOfCycleReminders();
}

export async function ensureShiftAlarmPermissions(): Promise<void> {
  const notificationsGranted = await ensureNotificationPermission();
  if (!notificationsGranted) throw new Error("Allow ShiftMate notifications before enabling a shift alarm.");
  if (Platform.OS === "android" && !exactAlarmsAvailable()) {
    openExactAlarmSettings();
    throw new Error("Allow ShiftMate to set alarms and reminders, then save the shift again.");
  }
}

export async function rescheduleAllShiftAlarms(): Promise<{ scheduled: number; needsExactAlarmPermission: boolean }> {
  if (Platform.OS === "android" && !exactAlarmsAvailable()) {
    openExactAlarmSettings();
    return { scheduled: 0, needsExactAlarmPermission: true };
  }
  const [profile, shifts] = await Promise.all([api.getProfile(), api.listShifts()]);
  const alarmShifts = shifts.filter((shift) => shift.alarm_enabled);
  const scheduled = (await Promise.all(alarmShifts.map((shift) =>
    scheduleShiftAlarm(shift.id, shift.date, shift.start_time, profile.alarm_lead_minutes, shift.house_name)
  ))).filter(Boolean).length;
  return { scheduled, needsExactAlarmPermission: false };
}
