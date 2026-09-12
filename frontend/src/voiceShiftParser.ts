import type { House } from "./api";

export type ParsedVoiceShift = {
  transcript: string; date: string | null; start_time: string | null;
  end_time: string | null; house_id: string | null; confidence: number; warnings: string[];
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function dateIso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function validDate(year: number, monthIndex: number, day: number): string | null {
  const date = new Date(year, monthIndex, day);
  if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day) return null;
  return dateIso(date);
}
function normalizeSpeech(text: string): string {
  return text.replace(/\b([ap])\s*\.?\s*m\s*\.?/gi, "$1m").replace(/\b(\d{1,2})\s+(\d{2})\s*(am|pm)\b/gi, "$1:$2 $3").replace(/(\d)\s*:\s*(\d{2})/g, "$1:$2").replace(/\s+/g, " ").trim();
}
function parseDate(text: string, reference: Date): string | null {
  if (/\btoday\b/i.test(text)) return dateIso(reference);
  if (/\btomorrow\b/i.test(text)) { const date = new Date(reference); date.setDate(date.getDate() + 1); return dateIso(date); }
  const explicit = text.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (explicit) { const year = explicit[3] ? Number(explicit[3]) + (explicit[3].length === 2 ? 2000 : 0) : reference.getFullYear(); return validDate(year, Number(explicit[2]) - 1, Number(explicit[1])); }
  const monthNames = MONTHS.join("|");
  const dayFirst = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${monthNames})(?:\\s+(\\d{4}))?\\b`, "i"));
  if (dayFirst) { const month = MONTHS.indexOf(dayFirst[2].toLowerCase()); return validDate(Number(dayFirst[3] ?? reference.getFullYear()), month, Number(dayFirst[1])); }
  const monthFirst = text.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "i"));
  if (monthFirst) { const month = MONTHS.indexOf(monthFirst[1].toLowerCase()); return validDate(Number(monthFirst[3] ?? reference.getFullYear()), month, Number(monthFirst[2])); }
  const weekday = WEEKDAYS.findIndex((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
  if (weekday >= 0) { const date = new Date(reference); let delta = (weekday - reference.getDay() + 7) % 7; if (delta === 0 && !/\bthis\b/i.test(text)) delta = 7; date.setDate(date.getDate() + delta); return dateIso(date); }
  return null;
}
function parseSpokenTime(value: string): string | null {
  const match = value.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2] ?? 0);
  if (match[3] === "pm" && hour < 12) hour += 12;
  if (match[3] === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function houseMatch(text: string, houses: House[]): string | null {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  let best: { id: string; score: number } | null = null;
  for (const house of houses) { const words = house.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/); const score = words.filter((word) => normalized.includes(word)).length / words.length; if (!best || score > best.score) best = { id: house.id, score }; }
  return best && best.score >= 0.5 ? best.id : null;
}
export function parseVoiceShift(transcript: string, houses: House[], reference = new Date()): ParsedVoiceShift {
  const normalized = normalizeSpeech(transcript);
  const range = normalized.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|until|till|through|-)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(?!\s*(?:am|pm)\b)/i);
  const date = parseDate(normalized, reference); const start = range ? parseSpokenTime(range[1]) : null; const end = range ? parseSpokenTime(range[2]) : null; const house = houseMatch(normalized, houses); const warnings: string[] = [];
  if (!date) warnings.push("Check the shift date."); if (!start || !end) warnings.push("Check the start and end times."); if (!house && houses.length) warnings.push("Check the house or location.");
  const confidence = Math.round(((date ? 0.35 : 0) + (start && end ? 0.45 : 0) + (house || !houses.length ? 0.2 : 0)) * 100) / 100;
  return { transcript, date, start_time: start, end_time: end, house_id: house, confidence, warnings };
}
