/**
 * Severity filter helper for the Gap Report and any other consumer that
 * needs to bucket gaps into severity bands. Pure / framework-free so it
 * can be unit-tested without React.
 */
export type Severity = "all" | "4" | "8" | "16";

export const SEVERITY_LABELS: Record<Severity, string> = {
  all: "All gaps",
  "4": "≥ 4h",
  "8": "≥ 8h",
  "16": "≥ 16h",
};

export const SEVERITY_THRESHOLDS: Record<Severity, number> = {
  all: 0,
  "4": 4,
  "8": 8,
  "16": 16,
};

/** Return only gaps whose `durationHours` meets the configured severity floor. */
export function filterGapsBySeverity<T extends { durationHours: number }>(
  gaps: T[],
  severity: Severity,
): T[] {
  const threshold = SEVERITY_THRESHOLDS[severity];
  if (threshold === 0) return gaps;
  return gaps.filter((g) => g.durationHours >= threshold);
}

/** Highest severity any gap in the list reaches; "all" when the list is empty. */
export function highestSeverity(gaps: { durationHours: number }[]): Severity {
  let maxHours = 0;
  for (const g of gaps) {
    if (g.durationHours > maxHours) maxHours = g.durationHours;
  }
  if (maxHours >= 16) return "16";
  if (maxHours >= 8) return "8";
  if (maxHours >= 4) return "4";
  return "all";
}
