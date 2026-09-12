import { Shift } from "@/src/api";

// Compute duration in hours (handles overnight)
export function shiftDurationHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

// Format a delta hours as "+1h 30m" / "-45m" / "+2h"
export function formatHoursDelta(delta: number): string {
  if (delta === 0) return "0";
  const sign = delta > 0 ? "+" : "-";
  const abs = Math.abs(delta);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

// Sum of latest change's delta (or net vs original). We show the SUM of all edits.
export function totalDelta(shift: Shift): number {
  if (!shift.edits || shift.edits.length === 0) return 0;
  return Math.round(shift.edits.reduce((a, e) => a + (e.hours_delta || 0), 0) * 100) / 100;
}

export function latestEditPhase(shift: Shift): "before" | "during" | "after" | null {
  if (!shift.edits || shift.edits.length === 0) return null;
  return shift.edits[shift.edits.length - 1].phase;
}

export type HouseRate = { id: string; hourly_rate?: number; name: string; is_default?: boolean };

export function resolveShiftHouseName(shift: Shift, houses: HouseRate[] = []): string {
  const stored = (shift.house_name || "").trim();
  if (stored) return stored;
  if (shift.house_id) {
    const linked = houses.find((house) => house.id === shift.house_id);
    if (linked?.name?.trim()) return linked.name.trim();
  }
  const original = (shift.original_house_name || "").trim();
  if (original) return original;
  return "No location";
}

function rateForShift(shift: Shift, houses: HouseRate[]): number {
  if (shift.house_id) {
    const linked = houses.find((house) => house.id === shift.house_id);
    if (linked && (linked.hourly_rate ?? 0) > 0) return linked.hourly_rate ?? 0;
  }
  const storedName = (shift.house_name || shift.original_house_name || "").trim().toLowerCase();
  if (storedName) {
    const byName = houses.find((house) => house.name.trim().toLowerCase() === storedName);
    if (byName && (byName.hourly_rate ?? 0) > 0) return byName.hourly_rate ?? 0;
  }
  return 0;
}

// -- Weekly totals --

// Return the start-of-week ISO for a given date, given a start day-of-week (0=Sun...6=Sat).
// Default: Monday (1).
export function weekStartFor(iso: string, startDow = 1): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const diff = -((dow - startDow + 7) % 7);
  dt.setDate(dt.getDate() + diff);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// Alias kept for backward compatibility.
export function weekStartMonday(iso: string): string {
  return weekStartFor(iso, 1);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// Given a fortnight anchor date and today, return the fortnight START on/before today.
function fortnightStartFor(anchorIso: string, todayIso: string): string {
  const [ay, am, ad] = anchorIso.split("-").map(Number);
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const anchor = new Date(ay, am - 1, ad);
  const today = new Date(ty, tm - 1, td);
  const diffDays = Math.floor((today.getTime() - anchor.getTime()) / (24 * 3600 * 1000));
  const mod = ((diffDays % 14) + 14) % 14;
  return addDaysIso(todayIso, -mod);
}

// Range presets for the totals card.
export type RangeKey = "week" | "fortnight" | "month";
export type PayConfig = {
  weekStartDow?: number;
  fortnightAnchor?: string | null;
};

export function rangeFor(
  kind: RangeKey,
  todayIso: string,
  cfg: PayConfig = {},
): { start: string; endInclusive: string } {
  const startDow = cfg.weekStartDow ?? 1;
  if (kind === "week") {
    const start = weekStartFor(todayIso, startDow);
    return { start, endInclusive: addDaysIso(start, 6) };
  }
  if (kind === "fortnight") {
    const start = cfg.fortnightAnchor
      ? fortnightStartFor(cfg.fortnightAnchor, todayIso)
      : weekStartFor(todayIso, startDow);
    return { start, endInclusive: addDaysIso(start, 13) };
  }
  // month
  const [y, m] = todayIso.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endInclusive = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, endInclusive };
}

export function totalsInRange(
  shifts: Shift[],
  startIso: string,
  endInclusiveIso: string,
  houses: HouseRate[] = [],
): {
  totalHours: number;
  byHouse: { house: string; hours: number }[];
  count: number;
} {
  const inRange = shifts.filter((s) => s.date >= startIso && s.date <= endInclusiveIso);
  const byHouseMap = new Map<string, number>();
  let total = 0;
  for (const s of inRange) {
    const h = shiftDurationHours(s.start_time, s.end_time);
    total += h;
    const key = resolveShiftHouseName(s, houses);
    byHouseMap.set(key, (byHouseMap.get(key) || 0) + h);
  }
  return {
    totalHours: Math.round(total * 100) / 100,
    byHouse: Array.from(byHouseMap.entries())
      .map(([house, hours]) => ({ house, hours: Math.round(hours * 100) / 100 }))
      .sort((a, b) => b.hours - a.hours),
    count: inRange.length,
  };
}

// Kept for backward-compat with existing callers.
export function weeklyTotals(shifts: Shift[], weekStartIso: string) {
  const endInclusive = addDaysIso(weekStartIso, 6);
  return totalsInRange(shifts, weekStartIso, endInclusive);
}

export function formatHours(h: number): string {
  if (h === 0) return "0h";
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins === 0) return `${whole}h`;
  if (whole === 0) return `${mins}m`;
  return `${whole}h ${mins}m`;
}

// -- Earnings --

export function earningsFor(
  shifts: Shift[],
  houses: HouseRate[],
): { total: number; byHouse: { house: string; hours: number; earnings: number }[] } {
  const totals = new Map<string, { hours: number; earnings: number }>();
  let grand = 0;
  for (const s of shifts) {
    const hrs = shiftDurationHours(s.start_time, s.end_time);
    const rate = rateForShift(s, houses);
    const earn = hrs * rate;
    const name = resolveShiftHouseName(s, houses);
    const prev = totals.get(name) || { hours: 0, earnings: 0 };
    totals.set(name, { hours: prev.hours + hrs, earnings: prev.earnings + earn });
    grand += earn;
  }
  return {
    total: Math.round(grand * 100) / 100,
    byHouse: Array.from(totals.entries())
      .map(([house, v]) => ({
        house,
        hours: Math.round(v.hours * 100) / 100,
        earnings: Math.round(v.earnings * 100) / 100,
      }))
      .filter((r) => r.earnings > 0)
      .sort((a, b) => b.earnings - a.earnings),
  };
}

export function formatMoney(v: number): string {
  const s = v.toFixed(2);
  return `$${s.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
