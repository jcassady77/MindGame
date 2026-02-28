// ============================================================
// Calendar Utilities
// ============================================================
// In-world date math: parsing, formatting, arithmetic.
// ============================================================

import { InWorldDate, MONTHS_PER_YEAR, DAYS_PER_MONTH, MONTH_NAMES, SEASON_NAMES } from "./types.js";

/** Parse "YYYY-MM-DD" into structured date. */
export function parseDate(dateStr: string): InWorldDate {
  const parts = dateStr.split("-");
  if (parts.length !== 3) {
    throw new Error(`Invalid date format "${dateStr}" — expected YYYY-MM-DD`);
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Invalid date values in "${dateStr}"`);
  }
  if (month < 1 || month > MONTHS_PER_YEAR) {
    throw new Error(`Month ${month} out of range 1–${MONTHS_PER_YEAR}`);
  }
  if (day < 1 || day > DAYS_PER_MONTH) {
    throw new Error(`Day ${day} out of range 1–${DAYS_PER_MONTH}`);
  }
  return { year, month, day };
}

/** Format structured date to "YYYY-MM-DD". */
export function formatDate(date: InWorldDate): string {
  const y = String(date.year).padStart(4, "0");
  const m = String(date.month).padStart(2, "0");
  const d = String(date.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Human-readable date: "Year 3, Goldfall 4". */
export function formatDateHuman(date: InWorldDate): string {
  const monthName = MONTH_NAMES[date.month - 1];
  return `Year ${date.year}, ${monthName} ${date.day}`;
}

/** Long-form date: "the 4th of Goldfall, Year 3". */
export function formatDateLong(date: InWorldDate): string {
  const monthName = MONTH_NAMES[date.month - 1];
  const suffix = ordinalSuffix(date.day);
  return `the ${date.day}${suffix} of ${monthName}, Year ${date.year}`;
}

/** Get season name for a given month (1-indexed). */
export function getSeason(month: number): string {
  const seasonIndex = Math.floor((month - 1) / 3);
  return SEASON_NAMES[seasonIndex];
}

/** Add N months to a date. Day is preserved. */
export function addMonths(date: InWorldDate, months: number): InWorldDate {
  const totalMonths = (date.year - 1) * MONTHS_PER_YEAR + (date.month - 1) + months;
  const newYear = Math.floor(totalMonths / MONTHS_PER_YEAR) + 1;
  const newMonth = (totalMonths % MONTHS_PER_YEAR) + 1;
  return { year: newYear, month: newMonth, day: date.day };
}

/** Compute months elapsed between two dates (ignoring day). */
export function monthsBetween(a: InWorldDate, b: InWorldDate): number {
  return (b.year - a.year) * MONTHS_PER_YEAR + (b.month - a.month);
}

/** Compare two dates. Returns negative if a < b, 0 if equal, positive if a > b. */
export function compareDates(a: InWorldDate, b: InWorldDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/** Check if date is between start and end (inclusive). */
export function isDateInRange(date: InWorldDate, start: InWorldDate, end: InWorldDate): boolean {
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0;
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
