import { TIMEZONE_OFFSETS, type Timezone } from "../../../shared/scheduling";

/**
 * Convert a UTC ms timestamp to display components for a given timezone code.
 * Returns hour (0-23), minute, dayOfWeek (0=Sun..6=Sat), date string YYYY-MM-DD.
 */
export function toTzParts(utcMs: number, tz: Timezone) {
  const offsetHours = TIMEZONE_OFFSETS[tz];
  const localMs = utcMs + offsetHours * 60 * 60 * 1000;
  const d = new Date(localMs);
  return {
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dayOfWeek: d.getUTCDay(),
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    iso: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
  };
}

export function formatHour(h: number) {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function formatTime24(h: number, m = 0) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Format a UTC ms in a given timezone as "Mon, Jan 5 · 08:00". */
export function formatShiftStart(utcMs: number, tz: Timezone) {
  const p = toTzParts(utcMs, tz);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${days[p.dayOfWeek]}, ${months[p.month]} ${p.day} · ${formatTime24(p.hour)}`;
}

/** Get the start (Monday 00:00 UTC) of the ISO week containing date. */
export function startOfWeekUtcMs(utcMs: number) {
  const d = new Date(utcMs);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow; // back to Monday
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset),
  );
  return monday.getTime();
}

export function startOfDayUtcMs(utcMs: number) {
  const d = new Date(utcMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function addDaysUtc(utcMs: number, days: number) {
  return utcMs + days * 24 * 60 * 60 * 1000;
}

export function isoDateKey(utcMs: number) {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function monthNameShort(m: number) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m];
}

export function monthName(m: number) {
  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][m];
}
