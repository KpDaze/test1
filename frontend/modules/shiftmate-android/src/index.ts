import { requireOptionalNativeModule } from "expo-modules-core";

type AndroidNative = {
  isOnDeviceSpeechAvailable(): boolean;
  recognizeSpeechAsync(): Promise<{ transcript: string; alternatives: string[] }>;
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): void;
  scheduleShiftAlarmAsync(shiftId: string, triggerAtMillis: number, title: string, body: string): Promise<string>;
  cancelShiftAlarmAsync(shiftId: string): Promise<void>;
  snoozeShiftAlarmAsync(shiftId: string, minutes: number, title: string, body: string): Promise<void>;
};

const nativeModule = requireOptionalNativeModule<AndroidNative>("ShiftMateAndroid");

export function isOnDeviceSpeechAvailable(): boolean {
  return nativeModule?.isOnDeviceSpeechAvailable() ?? false;
}

export async function recognizeShiftSpeech(): Promise<{ transcript: string; alternatives: string[] }> {
  if (!nativeModule) {
    throw new Error("On-device speech requires the installed Android build. No audio was uploaded.");
  }
  if (!nativeModule.isOnDeviceSpeechAvailable()) {
    throw new Error("This phone does not have an on-device speech recognizer installed. ShiftMate will not use a cloud recognizer.");
  }
  return nativeModule.recognizeSpeechAsync();
}

function requireAndroidNative(): AndroidNative {
  if (!nativeModule) throw new Error("ShiftMate native Android services are unavailable in this build.");
  return nativeModule;
}

export const exactAlarmsAvailable = () => nativeModule?.canScheduleExactAlarms() ?? false;
export const openExactAlarmSettings = () => requireAndroidNative().openExactAlarmSettings();

export async function scheduleNativeShiftAlarm(
  shiftId: string, triggerAtMillis: number, title: string, body: string,
): Promise<string> {
  return requireAndroidNative().scheduleShiftAlarmAsync(shiftId, triggerAtMillis, title, body);
}

export async function cancelNativeShiftAlarm(shiftId: string): Promise<void> {
  await requireAndroidNative().cancelShiftAlarmAsync(shiftId);
}

export async function snoozeNativeShiftAlarm(
  shiftId: string, minutes: number, title: string, body: string,
): Promise<void> {
  await requireAndroidNative().snoozeShiftAlarmAsync(shiftId, minutes, title, body);
}
