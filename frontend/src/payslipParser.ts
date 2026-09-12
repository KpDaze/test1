export type PayslipEntry = { date: string; paid_hours: number };

export type QueenslandGovPayslip = {
  detected: boolean;
  payPeriodStart: string | null;
  payPeriodEnd: string | null;
  currentPaidHours: number | null;
  adjustmentEntries: PayslipEntry[];
  summaryWorkHours: number | null;
  warnings: string[];
};

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const NAMED_DATE_SOURCE = String.raw`\b(\d{1,2})\s*[-/]\s*([A-Z]{3,9})\s*[-/]\s*(\d{4})\b`;

function isoDate(day: number, monthName: string, year: number): string | null {
  const month = MONTHS[monthName.slice(0, 3).toUpperCase()];
  if (!month) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseNamedDate(value: string): string | null {
  const match = value.match(new RegExp(NAMED_DATE_SOURCE, "i"));
  return match ? isoDate(Number(match[1]), match[2], Number(match[3])) : null;
}

function parseHours(value: string): number | null {
  const trimmed = value.trim();
  const hm = trimmed.match(/^(\d{1,3}):(\d{2})$/);
  if (hm) {
    const minutes = Number(hm[2]);
    if (minutes > 59) return null;
    return Math.round((Number(hm[1]) + minutes / 60) * 100) / 100;
  }
  const number = Number(trimmed);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function firstHoursToken(value: string, max: number): number | null {
  const tokens = value.match(/\d{1,3}:\d{2}|\d+(?:\.\d+)?/g) ?? [];
  for (const token of tokens) {
    const hours = parseHours(token);
    if (hours !== null && hours >= 0 && hours <= max) return hours;
  }
  return null;
}

function ordinaryHoursAt(lines: string[], index: number, max: number): number | null {
  const line = lines[index];
  const label = line.match(/\bOrdinary\s+Hrs\b/i);
  if (!label) return null;
  const sameLineTail = line.slice((label.index ?? 0) + label[0].length);
  const sameLineHours = firstHoursToken(sameLineTail, max);
  if (sameLineHours !== null) return sameLineHours;

  for (let offset = 1; offset <= 3 && index + offset < lines.length; offset++) {
    const candidate = lines[index + offset];
    if (parseNamedDate(candidate) || /^(This\s+Pay|Adjustments\s+to\s+Past\s+Pays|Leave\s+Balances|Year\s+to\s+Date|Messages)\b/i.test(candidate)) {
      break;
    }
    if (/[A-Za-z]/.test(candidate) && !/^\s*(?:hrs?|hours?)\b/i.test(candidate)) break;
    const hours = firstHoursToken(candidate, max);
    if (hours !== null) return hours;
  }
  return null;
}

function sectionBetween(collapsed: string, startPattern: RegExp, endPattern: RegExp): string {
  const start = collapsed.search(startPattern);
  if (start < 0) return "";
  const afterStart = collapsed.slice(start);
  const end = afterStart.search(endPattern);
  return end > 0 ? afterStart.slice(0, end) : afterStart;
}

function parseAdjustmentFallback(adjustmentText: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!adjustmentText) return map;

  const dateRe = new RegExp(NAMED_DATE_SOURCE, "gi");
  const matches = [...adjustmentText.matchAll(dateRe)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const date = isoDate(Number(match[1]), match[2], Number(match[3]));
    if (!date || match.index === undefined) continue;
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length && matches[i + 1].index !== undefined
      ? matches[i + 1].index!
      : adjustmentText.length;
    const segment = adjustmentText.slice(start, end);
    const ordinary = segment.match(/\bOrdinary\s+Hrs\b([\s\S]*?)(?=\b(?:Ordinary\s+Hrs|Penalty|Allowance|Leave|Super|Tax)\b|$)/i);
    if (!ordinary) continue;
    const hours = firstHoursToken(ordinary[1], 24);
    if (hours === null) continue;
    map.set(date, Math.round(((map.get(date) ?? 0) + hours) * 100) / 100);
  }
  return map;
}

function parseCurrentHoursFallback(thisPayText: string): number | null {
  if (!thisPayText) return null;
  const ordinaryMatches = [...thisPayText.matchAll(/\bOrdinary\s+Hrs\b([\s\S]*?)(?=\b(?:Ordinary\s+Hrs|Allowance|Penalty|Leave|Adjustments\s+to\s+Past\s+Pays)\b|$)/gi)];
  if (!ordinaryMatches.length) return null;
  let total = 0;
  let found = false;
  for (const match of ordinaryMatches) {
    const hours = firstHoursToken(match[1] ?? "", 200);
    if (hours !== null) {
      total += hours;
      found = true;
    }
  }
  return found ? Math.round(total * 100) / 100 : null;
}

export function parseQueenslandGovPayslip(text: string): QueenslandGovPayslip {
  const normalized = text
    .replace(/\u2013|\u2014/g, "-")
    .replace(/[|]/g, " ")
    .replace(/[ \t]+/g, " ");
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const collapsed = lines.join(" ").replace(/\s+/g, " ");
  const detected = /Queensland\s+Government/i.test(collapsed)
    && /(Pay\s+Advice|Pay\s+Period|Adjustments\s+to\s+Past\s+Pays)/i.test(collapsed);

  let payPeriodStart: string | null = null;
  let payPeriodEnd: string | null = null;
  let currentPaidHours = 0;
  let foundCurrentHours = false;
  let summaryWorkHours: number | null = null;
  let section: "none" | "this-pay" | "adjustments" = "none";
  let adjustmentDate: string | null = null;
  const adjustmentMap = new Map<string, number>();
  const warnings: string[] = [];

  const period = collapsed.match(new RegExp(
    `Pay\\s*Period\\s*:?\\s*(${NAMED_DATE_SOURCE.replace(/\\b/g, "")})\\s+to\\s+(${NAMED_DATE_SOURCE.replace(/\\b/g, "")})`,
    "i",
  ));
  if (period) {
    payPeriodStart = parseNamedDate(period[1]);
    payPeriodEnd = parseNamedDate(period[5]);
  } else {
    const simpler = collapsed.match(/Pay\s*Period\s*:?\s*(\d{1,2}\s*[-/]\s*[A-Z]{3,9}\s*[-/]\s*\d{4})\s+to\s+(\d{1,2}\s*[-/]\s*[A-Z]{3,9}\s*[-/]\s*\d{4})/i);
    if (simpler) {
      payPeriodStart = parseNamedDate(simpler[1]);
      payPeriodEnd = parseNamedDate(simpler[2]);
    }
  }

  const work = collapsed.match(/\bWork\s+(\d{1,3}:\d{2})\b/i);
  if (work) summaryWorkHours = parseHours(work[1]);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^This\s+Pay\b/i.test(line)) {
      section = "this-pay";
      adjustmentDate = null;
      continue;
    }
    if (/^Adjustments\s+to\s+Past\s+Pays\b/i.test(line)) {
      section = "adjustments";
      adjustmentDate = null;
      continue;
    }
    if (/^(Leave\s+Balances|Year\s+to\s+Date|Messages)\b/i.test(line)) {
      section = "none";
      adjustmentDate = null;
      continue;
    }

    if (section === "adjustments") {
      const date = parseNamedDate(line);
      if (date) adjustmentDate = date;
      if (/\bOrdinary\s+Hrs\b/i.test(line) && adjustmentDate) {
        const hours = ordinaryHoursAt(lines, index, 24);
        if (hours !== null) {
          adjustmentMap.set(
            adjustmentDate,
            Math.round(((adjustmentMap.get(adjustmentDate) ?? 0) + hours) * 100) / 100,
          );
        }
      }
      continue;
    }

    if (section === "this-pay" && /\bOrdinary\s+Hrs\b/i.test(line)) {
      const hours = ordinaryHoursAt(lines, index, 200);
      if (hours !== null) {
        currentPaidHours += hours;
        foundCurrentHours = true;
      }
    }
  }

  const adjustmentsText = sectionBetween(
    collapsed,
    /Adjustments\s+to\s+Past\s+Pays/i,
    /Leave\s+Balances|Year\s+to\s+Date|Messages/i,
  );
  const fallbackAdjustments = parseAdjustmentFallback(adjustmentsText);
  for (const [date, hours] of fallbackAdjustments) {
    if (!adjustmentMap.has(date)) adjustmentMap.set(date, hours);
  }

  if (!foundCurrentHours) {
    const thisPayText = sectionBetween(
      collapsed,
      /This\s+Pay/i,
      /Adjustments\s+to\s+Past\s+Pays|Leave\s+Balances|Year\s+to\s+Date|Messages/i,
    );
    const fallbackCurrent = parseCurrentHoursFallback(thisPayText);
    if (fallbackCurrent !== null) {
      currentPaidHours = fallbackCurrent;
      foundCurrentHours = true;
    }
  }

  const adjustmentEntries = [...adjustmentMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, paid_hours]) => ({ date, paid_hours }));
  const adjustmentTotal = Math.round(adjustmentEntries.reduce((sum, row) => sum + row.paid_hours, 0) * 100) / 100;

  let current: number | null = foundCurrentHours ? Math.round(currentPaidHours * 100) / 100 : null;
  if (current === null && summaryWorkHours !== null && adjustmentEntries.length > 0 && Math.abs(adjustmentTotal - summaryWorkHours) <= 0.05) {
    current = 0;
  }

  if (detected && (!payPeriodStart || !payPeriodEnd)) warnings.push("Could not confidently read the pay-period dates.");
  if (detected && current === null) warnings.push("Could not confidently read current Ordinary Hrs.");

  if (summaryWorkHours !== null && current !== null) {
    const detailTotal = Math.round((current + adjustmentTotal) * 100) / 100;
    if (Math.abs(detailTotal - summaryWorkHours) > 0.05) {
      warnings.push(`Work-hours cross-check did not balance (${detailTotal}h detail vs ${summaryWorkHours}h summary). Review the scan.`);
    }
  }

  return {
    detected,
    payPeriodStart,
    payPeriodEnd,
    currentPaidHours: current,
    adjustmentEntries,
    summaryWorkHours,
    warnings,
  };
}
