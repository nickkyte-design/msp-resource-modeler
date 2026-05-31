/**
 * Canonical holiday presets for common regions.
 *
 * Pure data — no I/O, no env. Consumed by both the server (when applying a
 * preset) and tests (vitest covers shape + uniqueness).
 *
 * Dates are calendar-day strings (YYYY-MM-DD); no timezone implied.
 */

export type HolidayRegion = "US" | "IN" | "SG" | "UK" | "CUSTOM";

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

/**
 * Singapore gazetted public holidays for 2026 per MOM
 * (https://www.mom.gov.sg/newsroom/press-releases/2025/0616-public-holidays-for-2026).
 *
 * Three of the gazetted dates fall on Sunday in 2026; for those we use the
 * Monday observed-on date instead, since that is the day employees actually
 * get off and the day on-call rosters skip. The Saturday Hari Raya Puasa
 * (21 Mar) has no substitution day under Singapore law, so it's listed as-is
 * — it's still a paid public holiday but a Mon–Fri pod is unaffected.
 */
export const SINGAPORE_PUBLIC_HOLIDAYS_2026: HolidayPresetEntry[] = [
  { date: "2026-01-01", label: "New Year's Day" },
  { date: "2026-02-17", label: "Chinese New Year" },
  { date: "2026-02-18", label: "Chinese New Year (Day 2)" },
  { date: "2026-03-21", label: "Hari Raya Puasa" },
  { date: "2026-04-03", label: "Good Friday" },
  { date: "2026-05-01", label: "Labour Day" },
  { date: "2026-05-27", label: "Hari Raya Haji" },
  { date: "2026-06-01", label: "Vesak Day (observed)" },
  { date: "2026-08-10", label: "National Day (observed)" },
  { date: "2026-11-09", label: "Deepavali (observed)" },
  { date: "2026-12-25", label: "Christmas Day" },
];

/**
 * UK bank holidays for England & Wales 2026 (gov.uk/bank-holidays).
 *
 * 8 official bank holidays for England & Wales. Boxing Day (26 Dec 2026) falls
 * on a Saturday so the substitute weekday — Monday 28 Dec — is gazetted under
 * the Banking and Financial Dealings Act and is the day employees are actually
 * off / on-call rosters skip. New Year's Day 2026 (Thu) needs no substitution.
 * Good Friday and Christmas Day are common-law holidays; we keep them in the
 * list since they trigger the same calendar-day off in practice.
 *
 * Scotland and Northern Ireland have slightly different bank-holiday lists
 * (e.g. 2 Jan, St Patrick's Day, 12 Jul). For now this preset targets the
 * majority case; extend with separate constants if needed later.
 */
export const UK_BANK_HOLIDAYS_2026: HolidayPresetEntry[] = [
  { date: "2026-01-01", label: "New Year's Day" },
  { date: "2026-04-03", label: "Good Friday" },
  { date: "2026-04-06", label: "Easter Monday" },
  { date: "2026-05-04", label: "Early May bank holiday" },
  { date: "2026-05-25", label: "Spring bank holiday" },
  { date: "2026-08-31", label: "Summer bank holiday" },
  { date: "2026-12-25", label: "Christmas Day" },
  { date: "2026-12-28", label: "Boxing Day (substitute)" },
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
  if (region === "SG") return SINGAPORE_PUBLIC_HOLIDAYS_2026;
  if (region === "UK") return UK_BANK_HOLIDAYS_2026;
  return [];
}
