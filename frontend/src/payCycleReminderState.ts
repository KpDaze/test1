import { api } from "./api";
import { scheduleEndOfCycleReminders } from "./notifications";
import { rangeFor, type RangeKey } from "./shiftUtils";
import { todayIso } from "./timeUtils";
import { storage } from "./utils/storage";

export const END_OF_CYCLE_REMINDERS_KEY = "shiftmate.paycycle.alerts.v1";
export const PAY_CYCLE_ALERTS_KEY = END_OF_CYCLE_REMINDERS_KEY;

function shiftIso(iso: string, kind: RangeKey, offset: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (kind === "month") {
    date.setDate(15);
    date.setMonth(date.getMonth() + offset);
  } else {
    date.setDate(date.getDate() + offset * (kind === "fortnight" ? 14 : 7));
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function upcomingPayCycleEndDates(count = 12): Promise<string[]> {
  const profile = await api.getProfile();
  const kind = (profile.pay_period_type ?? "week") as RangeKey;
  const today = todayIso();
  const ends: string[] = [];
  for (let i = 0; i < count; i++) {
    const focus = shiftIso(today, kind, i);
    const range = rangeFor(kind, focus, {
      weekStartDow: profile.pay_week_start_dow,
      fortnightAnchor: profile.pay_fortnight_anchor ?? null,
    });
    if (!ends.includes(range.endInclusive)) ends.push(range.endInclusive);
  }
  return ends;
}

export async function refreshEnabledPayCycleReminders(): Promise<void> {
  const enabled = await storage.getItem(END_OF_CYCLE_REMINDERS_KEY, false);
  if (!Boolean(enabled)) return;
  await scheduleEndOfCycleReminders(await upcomingPayCycleEndDates(12));
}
