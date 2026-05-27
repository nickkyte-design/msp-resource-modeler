/**
 * Canonical holiday presets for common regions.
 *
 * Pure data — no I/O, no env. Consumed by both the server (when applying a
 * preset) and tests (vitest covers shape + uniqueness).
 *
 * Dates are calendar-day strings (YYYY-MM-DD); no timezone implied.
 */

export type HolidayRegion = "US" | "IN" | "CUSTOM";

export type HolidayPresetEntry = {
  /** Calendar date YYYY-MM-DD. */
  date: string;
  /** Friendly name. */
  label: string;
};

export const US_FEDERAL_HOLIDAYS_2026: HolidayPresetEntry[] = [
  { date: "2026-01-01", label: "New Year's Day" },
  { date: "2026-01-19", label: "Martin Luther King Jr. Day" },
  { date: "2026-02-16", label: "Presidents' Day" },
  { date: "2026-05-25", label: "Memorial Day" },
  { date: "2026-06-19", label: "Juneteenth" },
  { date: "2026-07-03", label: "Independence Day (observed)" },
  { date: "2026-09-07", label: "Labor Day" },
  { date: "2026-10-12", label: "Columbus Day" },
  { date: "2026-11-11", label: "Veterans Day" },
  { date: "2026-11-26", label: "Thanksgiving" },
  { date: "2026-12-25", label: "Christmas Day" },
];

export const INDIA_GAZETTED_HOLIDAYS_2026: HolidayPresetEntry[] = [
  { date: "2026-01-01", label: "New Year's Day" },
  { date: "2026-01-26", label: "Republic Day" },
  { date: "2026-03-04", label: "Holi" },
  { date: "2026-04-14", label: "Ambedkar Jayanti" },
  { date: "2026-05-01", label: "Labour Day" },
  { date: "2026-08-15", label: "Independence Day" },
  { date: "2026-10-02", label: "Gandhi Jayanti" },
  { date: "2026-10-20", label: "Diwali" },
  { date: "2026-11-04", label: "Guru Nanak Jayanti" },
  { date: "2026-12-25", label: "Christmas Day" },
];

export function getHolidayPreset(
  region: HolidayRegion,
  year: number,
): HolidayPresetEntry[] {
  // Year is currently fixed at 2026 (the schedule year). When we add multi-year
  // support, we'll generate presets dynamically per year. Until then we only
  // serve the 2026 sets and silently fall through for other years.
  if (year !== 2026) return [];
  if (region === "US") return US_FEDERAL_HOLIDAYS_2026;
  if (region === "IN") return INDIA_GAZETTED_HOLIDAYS_2026;
  return [];
}
