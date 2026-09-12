import type { OcrElement, OcrLine, OcrRect, OcrResult } from "../modules/shiftmate-ocr/src";

export type RosterCellKind = "shift" | "off" | "leave" | "unknown";
export type ParsedRosterCell = {
  kind: RosterCellKind;
  date: string;
  start_time?: string;
  end_time?: string;
  house_name: string;
  raw_text: string;
  confidence: number;
  warnings: string[];
};
export type ParsedRoster = {
  employeeMatch: string;
  cells: ParsedRosterCell[];
  overallConfidence: number;
  requiresConfirmation: boolean;
  warnings: string[];
};

type Positioned<T> = T & { box: OcrRect; centerX: number; centerY: number };
type DateColumn = { date: string; centerX: number; headerY: number; confidence: number };
type HeaderAnchor = { index: number; centerX: number; centerY: number; confidence: number };

const FULL_DATE = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/;
const TIME_RANGE = /\b(\d{1,2}(?::?\d{2})?\s*(?:am|pm)?)\s*[-–—]\s*(\d{1,2}(?::?\d{2})?\s*(?:am|pm)?)\b/i;
const TIME_TOKEN = /\b(?:[01]?\d|2[0-3])(?::?\d{2})\s*(?:am|pm)?\b/gi;
const OFF = /\b(?:r[\s/.\\|]*(?:[oi0]|[i1l|][o0])|ado|sdo|off)\b/i;
const LEAVE = /\b(?:rec(?:reation)?\s*leave|annual\s*leave|sick\s*leave|leave|atw|training)\b/i;
const STAFF_ROW_NOISE = /\b(?:vacant|alternate|duties|signature|hours|count|backfill|line|leave|adst|grw|sdp|rco|roster|team|leader|service|centre)\b/i;

const centre = (box: OcrRect) => ({ centerX: (box.left + box.right) / 2, centerY: (box.top + box.bottom) / 2 });
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const roundConfidence = (value: number) => Math.round(clamp01(value) * 100) / 100;

function positioned<T extends { boundingBox: OcrRect | null }>(item: T): Positioned<T> | null {
  if (!item.boundingBox) return null;
  return { ...item, box: item.boundingBox, ...centre(item.boundingBox) };
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\(stt\)|\bstt\b|\bvacant\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

function nameScore(candidate: string, configuredName: string): number {
  const wanted = new Set(normalizeWords(configuredName));
  const found = new Set(normalizeWords(candidate));
  if (!wanted.size || !found.size) return 0;
  let matches = 0;
  for (const word of wanted) if (found.has(word)) matches += 1;
  const coverage = matches / wanted.size;
  const noisePenalty = Math.max(0, found.size - wanted.size) * 0.04;
  return clamp01(coverage - noisePenalty);
}

function isoDate(day: number, month: number, year: number): string | null {
  const fullYear = year < 100 ? 2000 + year : year;
  const date = new Date(fullYear, month - 1, day);
  if (date.getFullYear() !== fullYear || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractDate(text: string): string | null {
  const match = text.match(FULL_DATE);
  return match ? isoDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

function addDays(iso: string, amount: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86_400_000);
}

function rosterPeriodDates(text: string): string[] {
  const matches = [...text.matchAll(new RegExp(FULL_DATE.source, "g"))]
    .map((match) => ({
      date: isoDate(Number(match[1]), Number(match[2]), Number(match[3])),
      index: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    }))
    .filter((entry): entry is { date: string; index: number; end: number } => Boolean(entry.date));
  let best: { start: string; end: string; score: number } | null = null;
  for (let left = 0; left < matches.length; left += 1) {
    for (let right = left + 1; right < matches.length; right += 1) {
      const span = daysBetween(matches[left].date, matches[right].date);
      if (span < 1 || span > 21) continue;
      const between = text.slice(matches[left].end, matches[right].index);
      const joinedAsRange = between.length <= 40 && /(?:\bto\b|\buntil\b|\bthrough\b|\bthru\b|[-–—])/i.test(between);
      const commonRosterLength = span === 6 || span === 13;
      const score = (joinedAsRange ? 100 : 0) + (commonRosterLength ? 60 : 0) - between.length * 0.05;
      if (!best || score > best.score) best = { start: matches[left].date, end: matches[right].date, score };
    }
  }
  if (!best || best.score < 50) return [];
  const count = daysBetween(best.start, best.end) + 1;
  return Array.from({ length: count }, (_, index) => addDays(best!.start, index));
}

function dayNumber(text: string): number | null {
  const compact = text.trim().replace(/[|]/g, "");
  const direct = compact.match(/^(\d{1,2})(?:st|nd|rd|th)?$/i);
  if (direct) {
    const value = Number(direct[1]);
    return value >= 1 && value <= 31 ? value : null;
  }
  const besideWeekday = compact.match(/^(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)[\s.,:/-]+(\d{1,2})$/i);
  if (!besideWeekday) return null;
  const value = Number(besideWeekday[1]);
  return value >= 1 && value <= 31 ? value : null;
}

function weekdayNumber(text: string): number | null {
  const compact = text.toLowerCase().replace(/[^a-z]/g, "");
  if (/^sun(?:day)?$/.test(compact)) return 0;
  if (/^mon(?:day)?$/.test(compact)) return 1;
  if (/^tue(?:s(?:day)?)?$/.test(compact)) return 2;
  if (/^wed(?:nesday)?$/.test(compact)) return 3;
  if (/^thu(?:rs(?:day)?)?$/.test(compact)) return 4;
  if (/^fri(?:day)?$/.test(compact)) return 5;
  if (/^sat(?:urday)?$/.test(compact)) return 6;
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function alignHeaderSequence<T extends { centerX: number }>(
  candidates: T[],
  labels: (number | null)[],
  expected: number[],
): { candidate: T; index: number }[] {
  const sorted = candidates.map((candidate, index) => ({ candidate, label: labels[index] }))
    .sort((a, b) => a.candidate.centerX - b.candidate.centerX);
  const rows = sorted.length;
  const columns = expected.length;
  const dp = Array.from({ length: rows + 1 }, () => Array<number>(columns + 1).fill(0));
  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columns; column += 1) {
      dp[row][column] = sorted[row - 1].label === expected[column - 1]
        ? dp[row - 1][column - 1] + 1
        : Math.max(dp[row - 1][column], dp[row][column - 1]);
    }
  }
  const aligned: { candidate: T; index: number }[] = [];
  let row = rows;
  let column = columns;
  while (row > 0 && column > 0) {
    if (sorted[row - 1].label === expected[column - 1] && dp[row][column] === dp[row - 1][column - 1] + 1) {
      aligned.push({ candidate: sorted[row - 1].candidate, index: column - 1 });
      row -= 1;
      column -= 1;
    } else if (dp[row - 1][column] >= dp[row][column - 1]) {
      row -= 1;
    } else {
      column -= 1;
    }
  }
  return aligned.reverse();
}

function columnsFromAnchors(anchors: HeaderAnchor[], dates: string[], imageWidth: number): DateColumn[] {
  if (anchors.length < 3 || dates.length < 4) return [];
  const slopes: number[] = [];
  for (let left = 0; left < anchors.length; left += 1) {
    for (let right = left + 1; right < anchors.length; right += 1) {
      const indexGap = anchors[right].index - anchors[left].index;
      const xGap = anchors[right].centerX - anchors[left].centerX;
      if (indexGap > 0 && xGap > 0) slopes.push(xGap / indexGap);
    }
  }
  if (!slopes.length) return [];
  const slope = median(slopes);
  if (slope < Math.max(8, imageWidth * 0.01) || slope > imageWidth * 0.22) return [];
  const intercept = median(anchors.map((anchor) => anchor.centerX - slope * anchor.index));
  const tolerance = Math.max(14, slope * 0.55);
  const inliers = anchors.filter((anchor) => Math.abs(anchor.centerX - (intercept + slope * anchor.index)) <= tolerance);
  if (inliers.length < 3) return [];
  const refinedIntercept = median(inliers.map((anchor) => anchor.centerX - slope * anchor.index));
  const firstX = refinedIntercept;
  const lastX = refinedIntercept + slope * (dates.length - 1);
  if (firstX < -imageWidth * 0.03 || lastX > imageWidth * 1.03) return [];
  const ySlopes: number[] = [];
  for (let left = 0; left < inliers.length; left += 1) {
    for (let right = left + 1; right < inliers.length; right += 1) {
      const indexGap = inliers[right].index - inliers[left].index;
      if (indexGap > 0) ySlopes.push((inliers[right].centerY - inliers[left].centerY) / indexGap);
    }
  }
  const ySlope = ySlopes.length ? median(ySlopes) : 0;
  const yIntercept = median(inliers.map((anchor) => anchor.centerY - ySlope * anchor.index));
  return dates.map((date, index) => {
    const observed = inliers.find((anchor) => anchor.index === index);
    return {
      date,
      centerX: observed?.centerX ?? refinedIntercept + slope * index,
      headerY: yIntercept + ySlope * index,
      confidence: observed ? Math.max(0.72, observed.confidence) : 0.62,
    };
  });
}

function groupByNearbyY<T extends { centerY: number; box: OcrRect }>(items: T[]): T[][] {
  const sorted = [...items].sort((a, b) => a.centerY - b.centerY);
  const groups: T[][] = [];
  for (const item of sorted) {
    const last = groups.at(-1);
    const tolerance = Math.max(item.box.height * 1.5, 12);
    if (!last || Math.abs(last.reduce((sum, entry) => sum + entry.centerY, 0) / last.length - item.centerY) > tolerance) {
      groups.push([item]);
    } else {
      last.push(item);
    }
  }
  return groups;
}

function closestHeaderGroup<T extends { centerY: number; centerX: number; box: OcrRect }>(items: T[], employeeY: number): T[] {
  return groupByNearbyY(items)
    .filter((group) => group.length >= 4 && group.every((entry) => entry.centerY < employeeY))
    .sort((a, b) => {
      const ay = Math.max(...a.map((entry) => entry.centerY));
      const by = Math.max(...b.map((entry) => entry.centerY));
      return by - ay;
    })[0] ?? [];
}

function findDateColumns(
  elements: Positioned<OcrElement>[],
  allText: string,
  employee: Positioned<OcrLine>,
  imageWidth: number,
  imageHeight: number,
): DateColumn[] {
  const dated = elements.flatMap((element) => {
    const date = extractDate(element.text);
    return date ? [{ ...element, date }] : [];
  });
  const explicit = closestHeaderGroup(dated, employee.centerY);
  if (explicit.length >= 4) {
    return explicit
      .sort((a, b) => a.centerX - b.centerX)
      .map((entry) => ({ date: entry.date, centerX: entry.centerX, headerY: entry.centerY, confidence: entry.confidence ?? 0.8 }));
  }

  const periodDates = rosterPeriodDates(allText);
  if (!periodDates.length) return [];
  const expectedDays = periodDates.map((date) => Number(date.slice(-2)));
  const minHeaderX = employee.box.right + Math.max(6, imageWidth * 0.008);
  const aboveEmployee = elements.filter((element) => element.centerY < employee.centerY && element.centerX > minHeaderX);

  const numbered = aboveEmployee.filter((element) => dayNumber(element.text) !== null);
  const numberedGroups = groupByNearbyY(numbered);
  let bestNumberAnchors: HeaderAnchor[] = [];
  for (const group of numberedGroups) {
    const aligned = alignHeaderSequence(group, group.map((entry) => dayNumber(entry.text)), expectedDays);
    const anchors = aligned.map(({ candidate, index }) => ({
      index,
      centerX: candidate.centerX,
      centerY: candidate.centerY,
      confidence: candidate.confidence ?? 0.76,
    }));
    if (anchors.length > bestNumberAnchors.length ||
        (anchors.length === bestNumberAnchors.length && anchors.length && median(anchors.map((entry) => entry.centerY)) > median(bestNumberAnchors.map((entry) => entry.centerY)))) {
      bestNumberAnchors = anchors;
    }
  }
  const numberedColumns = columnsFromAnchors(bestNumberAnchors, periodDates, imageWidth);
  if (numberedColumns.length) return numberedColumns;

  const weekdays = aboveEmployee.filter((element) => weekdayNumber(element.text) !== null);
  const broadTolerance = Math.max(18, imageHeight * 0.045);
  const weekdayGroups: typeof weekdays[] = [];
  for (const weekday of [...weekdays].sort((a, b) => a.centerY - b.centerY)) {
    const group = weekdayGroups.at(-1);
    const averageY = group?.reduce((sum, entry) => sum + entry.centerY, 0)! / (group?.length || 1);
    if (!group || Math.abs(weekday.centerY - averageY) > broadTolerance) weekdayGroups.push([weekday]);
    else group.push(weekday);
  }
  const expectedWeekdays = periodDates.map((date) => new Date(`${date}T12:00:00`).getDay());
  let bestWeekdayAnchors: HeaderAnchor[] = [];
  for (const group of weekdayGroups) {
    const aligned = alignHeaderSequence(group, group.map((entry) => weekdayNumber(entry.text)), expectedWeekdays);
    const anchors = aligned.map(({ candidate, index }) => ({
      index,
      centerX: candidate.centerX,
      centerY: candidate.centerY,
      confidence: candidate.confidence ?? 0.7,
    }));
    if (anchors.length > bestWeekdayAnchors.length) bestWeekdayAnchors = anchors;
  }
  return columnsFromAnchors(bestWeekdayAnchors, periodDates, imageWidth);
}

function parseTime(value: string): string | null {
  const cleaned = value.toLowerCase().replace(/\s+/g, "");
  const period = cleaned.endsWith("am") ? "am" : cleaned.endsWith("pm") ? "pm" : null;
  const digits = cleaned.replace(/[^0-9:]/g, "");
  let hour: number;
  let minute: number;
  if (digits.includes(":")) {
    const parts = digits.split(":");
    hour = Number(parts[0]);
    minute = Number(parts[1]);
  } else if (digits.length >= 3) {
    hour = Number(digits.slice(0, -2));
    minute = Number(digits.slice(-2));
  } else {
    hour = Number(digits);
    minute = 0;
  }
  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function rowBounds(employee: Positioned<OcrLine>, lines: Positioned<OcrLine>[], firstColumnX: number, imageHeight: number) {
  const candidates = lines
    .filter((line) => {
      if (line === employee) return true;
      const words = normalizeWords(line.text);
      const leftTolerance = Math.max(employee.box.height * 4, firstColumnX * 0.25);
      return line.centerX < firstColumnX && words.length >= 2 && !STAFF_ROW_NOISE.test(line.text) &&
        Math.abs(line.box.left - employee.box.left) <= leftTolerance;
    })
    .sort((a, b) => a.centerY - b.centerY);
  const index = candidates.findIndex((line) => line === employee || (line.text === employee.text && line.centerY === employee.centerY));
  const above = index > 0 ? candidates[index - 1].centerY : null;
  const below = index >= 0 && index < candidates.length - 1 ? candidates[index + 1].centerY : null;
  const fallbackHalf = Math.max(employee.box.height * 2.8, imageHeight * 0.022);
  return {
    top: above === null ? employee.centerY - fallbackHalf : (above + employee.centerY) / 2,
    bottom: below === null ? employee.centerY + fallbackHalf : (below + employee.centerY) / 2,
  };
}

function rowSlope(columns: DateColumn[]): number {
  const slopes: number[] = [];
  for (let left = 0; left < columns.length; left += 1) {
    for (let right = left + 1; right < columns.length; right += 1) {
      const xGap = columns[right].centerX - columns[left].centerX;
      if (xGap > 0) slopes.push((columns[right].headerY - columns[left].headerY) / xGap);
    }
  }
  const slope = slopes.length ? median(slopes) : 0;
  return Math.abs(slope) <= 0.2 ? slope : 0;
}

function columnBounds(columns: DateColumn[], index: number, imageWidth: number) {
  const current = columns[index].centerX;
  const previous = columns[index - 1]?.centerX;
  const next = columns[index + 1]?.centerX;
  const defaultWidth = columns.length > 1 ? Math.abs(columns[1].centerX - columns[0].centerX) : imageWidth * 0.08;
  return {
    left: previous === undefined ? current - defaultWidth / 2 : (previous + current) / 2,
    right: next === undefined ? current + defaultWidth / 2 : (current + next) / 2,
  };
}

function matchHouse(raw: string, houses: string[]): string {
  const normalized = normalizeWords(raw);
  let best = "";
  let score = 0;
  for (const house of houses) {
    const wanted = normalizeWords(house);
    if (!wanted.length) continue;
    const overlap = wanted.filter((word) => normalized.includes(word)).length / wanted.length;
    if (overlap > score) { best = house; score = overlap; }
  }
  return score >= 0.5 ? best : "";
}

function parseCell(date: DateColumn, rawText: string, elementConfidence: number, houses: string[]): ParsedRosterCell {
  const compact = rawText.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  const warnings: string[] = [];
  const range = compact.match(TIME_RANGE);
  if (range) {
    const start = parseTime(range[1]);
    const end = parseTime(range[2]);
    if (start && end) {
      const confidence = roundConfidence(date.confidence * 0.25 + elementConfidence * 0.4 + 0.35);
      if (confidence < 0.75) warnings.push("Low OCR confidence; check the shift times.");
      return { kind: "shift", date: date.date, start_time: start, end_time: end,
        house_name: matchHouse(compact.replace(range[0], ""), houses), raw_text: rawText, confidence, warnings };
    }
  }
  const timeTokens = [...compact.matchAll(new RegExp(TIME_TOKEN.source, TIME_TOKEN.flags))];
  if (timeTokens.length >= 2) {
    const start = parseTime(timeTokens[0][0]);
    const end = parseTime(timeTokens[1][0]);
    if (start && end) {
      warnings.push("The printed separator was unclear; check both shift times.");
      const confidence = roundConfidence(date.confidence * 0.2 + elementConfidence * 0.35 + 0.25);
      return { kind: "shift", date: date.date, start_time: start, end_time: end,
        house_name: matchHouse(compact, houses), raw_text: rawText, confidence, warnings };
    }
  }
  if (timeTokens.length === 1) {
    const visible = parseTime(timeTokens[0][0]);
    if (visible === "07:00" || visible === "19:00") {
      const visibleLooksLikeEnd = /(?:am|pm)\s*$/i.test(timeTokens[0][0]);
      const other = visible === "07:00" ? "19:00" : "07:00";
      const start = visibleLooksLikeEnd ? other : visible;
      const end = visibleLooksLikeEnd ? visible : other;
      warnings.push("Only one time was legible. The other was inferred from the 07:00/19:00 roster pattern; review and tick this shift before saving.");
      const confidence = Math.min(0.58, roundConfidence(date.confidence * 0.15 + elementConfidence * 0.25 + 0.1));
      return { kind: "shift", date: date.date, start_time: start, end_time: end,
        house_name: matchHouse(compact, houses), raw_text: rawText, confidence, warnings };
    }
  }
  if (LEAVE.test(compact)) return { kind: "leave", date: date.date, house_name: "", raw_text: rawText,
    confidence: roundConfidence(elementConfidence * 0.7 + 0.25), warnings };
  if (OFF.test(compact)) return { kind: "off", date: date.date, house_name: "", raw_text: rawText,
    confidence: roundConfidence(elementConfidence * 0.7 + 0.25), warnings };
  return { kind: "unknown", date: date.date, house_name: "", raw_text: rawText,
    confidence: roundConfidence(elementConfidence * 0.5), warnings: ["The roster cell could not be classified."] };
}

export function parseRosterOcr(ocr: OcrResult, configuredName: string, houses: string[]): ParsedRoster {
  const elements = ocr.blocks.flatMap((block) => block.lines.flatMap((line) => line.elements))
    .map(positioned).filter((entry): entry is Positioned<OcrElement> => Boolean(entry));
  const lines = ocr.blocks.flatMap((block) => block.lines)
    .map(positioned).filter((entry): entry is Positioned<OcrLine> => Boolean(entry));
  const nameMatches = lines
    .map((line) => ({ line, score: nameScore(line.text, configuredName) }))
    .filter((match) => match.score >= 0.66)
    .sort((a, b) => b.score - a.score);
  if (!nameMatches.length) {
    return { employeeMatch: "", cells: [], overallConfidence: 0, requiresConfirmation: true,
      warnings: [`Could not confidently locate “${configuredName}” on this roster.`] };
  }

  const cells: ParsedRosterCell[] = [];
  const warnings: string[] = [];
  for (const { line: employee, score: employeeScore } of nameMatches) {
    const columns = findDateColumns(elements, ocr.text, employee, ocr.width, ocr.height);
    if (!columns.length) {
      warnings.push(`Found ${employee.text}, but could not map the date columns around that row.`);
      continue;
    }
    const bounds = rowBounds(employee, lines, columns[0].centerX, ocr.height);
    const slope = rowSlope(columns);
    const verticalPadding = Math.max(2, (bounds.bottom - bounds.top) * 0.06);
    columns.forEach((date, index) => {
      const x = columnBounds(columns, index, ocr.width);
      const yOffset = slope * (date.centerX - employee.centerX);
      const inCell = elements
        .filter((element) => element.centerX >= x.left && element.centerX < x.right &&
          element.centerY >= bounds.top + yOffset - verticalPadding && element.centerY < bounds.bottom + yOffset + verticalPadding)
        .sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
      if (!inCell.length) return;
      const rawText = inCell.map((element) => element.text).join("\n");
      const average = inCell.reduce((sum, element) => sum + (element.confidence ?? 0.65), 0) / inCell.length;
      const parsed = parseCell(date, rawText, roundConfidence(average * 0.8 + employeeScore * 0.2), houses);
      if (parsed.kind !== "unknown" || parsed.raw_text.trim()) cells.push(parsed);
    });
  }

  const unique = [...new Map(cells.map((cell) => [`${cell.date}:${cell.kind}:${cell.start_time ?? ""}:${cell.end_time ?? ""}`, cell])).values()]
    .sort((a, b) => a.date.localeCompare(b.date));
  const confidence = unique.length ? unique.reduce((sum, cell) => sum + cell.confidence, 0) / unique.length : 0;
  const requiresConfirmation = unique.some((cell) => cell.kind === "unknown" || cell.confidence < 0.82 || cell.warnings.length > 0) || warnings.length > 0;
  return {
    employeeMatch: nameMatches[0].line.text,
    cells: unique,
    overallConfidence: roundConfidence(confidence),
    requiresConfirmation,
    warnings,
  };
}
