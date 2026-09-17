import type { ClockFormat } from "@/src/theme";

export function alarmClockTime(date: string, startTime: string, leadMinutes: number): { time: string; sameDay: boolean; dateStr: string } {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = startTime.split(":").map(Number);
  const shift = new Date(y, m - 1, d, h, mi, 0, 0);
  const alarm = new Date(shift.getTime() - leadMinutes * 60_000);
  const time = `${String(alarm.getHours()).padStart(2, "0")}:${String(alarm.getMinutes()).padStart(2, "0")}`;
  const sameDay = alarm.getFullYear() === shift.getFullYear() && alarm.getMonth() === shift.getMonth() && alarm.getDate() === shift.getDate();
  const dateStr = fmtDMY(`${alarm.getFullYear()}-${String(alarm.getMonth() + 1).padStart(2, "0")}-${String(alarm.getDate()).padStart(2, "0")}`);
  return { time, sameDay, dateStr };
}

export function formatClockTime(hhmm: string, format: ClockFormat = "24h"): string {
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return hhmm;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return hhmm;
  if (format === "24h") return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatLeadHours(leadMinutes: number): string {
  const h = leadMinutes / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

export function fmtDMY(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtDM(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function fmtWeekday(iso: string, short = false): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: short ? "short" : "long" });
}

export function parseDMY(input: string): string | null {
  const t = (input || "").trim();
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
