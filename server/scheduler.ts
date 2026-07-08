/**
 * Core scheduling engine for MSP Resource Modeler.
 *
 * Algorithm overview:
 * 1. Generate weekly cycles of shifts (168-hour blocks).
 *    Within each cycle, every engineer either has a 5-day on/2-day off pattern
 *    or is fully off.
 * 2. For each pod, build the 24/7 coverage timeline using greedy assignment of
 *    8-hour shifts (preferred) extending to 9-hour where needed to fill gaps.
 * 3. Engineers are picked round-robin per pod with constraints:
 *    - Hard preferences (forbiddenWeekdays) never violated.
 *    - Same start time every day in a 5-day work block.
 *    - Stay in same pod for entire 5-day block.
 *    - Skip days marked as PTO/Holiday (passed in `timeOffSet`).
 *    - 45h/168h rolling cap.
 * 4. PTO/Holiday assignment is handled separately (see assignTimeOff).
 */

import {
  CYCLE_HOURS,
  HARD_CAP_HOURS_PER_168H,
  HOLIDAY_DAYS_PER_YEAR,
  MAX_SHIFT_HOURS,
  PTO_DAYS_PER_YEAR,
  PREFERRED_SHIFT_HOURS,
  SHIFTS_PER_BLOCK,
  TIMEZONE_OFFSETS,
  type HardPreferences,
  type ShiftBlock,
  type SoftPreferences,
  type Timezone,
} from "../shared/scheduling";
import {
  coverageWindowsInRange,
  defaultCoverageProfile,
  isSlotCovered,
  type PodCoverageProfile,
} from "../shared/coverage";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Minimum rest period (in hours) that must elapse between the end of one shift
 * and the start of the same engineer's next shift. 12h is the industry-standard
 * minimum rest period for on-call rotations (FLSA / EU Working Time Directive).
 */
export const MIN_REST_HOURS = 12;

export interface SchedulerEngineerInput {
  id: number;
  active: boolean;
  podNumber: number | null;
  softPreferences: SoftPreferences;
  hardPreferences: HardPreferences;
  /**
   * YYYY-MM-DD strings the engineer is unavailable.
   * Interpreted in `timezone` (v2.5.0): a date "2026-07-04" means the engineer
   * is off during the 24h covering Jul 4 in their local timezone, not UTC.
   */
  timeOffDates: Set<string>;
  /**
   * v2.5.0: engineer's home timezone, used to resolve `timeOffDates` against
   * each slot's start instant. Defaults to "UTC" for back-compat with callers
   * that don't supply it, which preserves pre-v2.5.0 (UTC-day) semantics.
   */
  timezone?: Timezone;
}

export interface SchedulerInput {
  year: number;
  /** v2.8.0: now supports 1..10 (up from 1..3). */
  podCount: number;
  engineers: SchedulerEngineerInput[];
  /**
   * Manual-override shifts already on the calendar.
   * The auto-scheduler will count these toward each engineer's 45h/168h cap
   * so it never accidentally overruns the cap when stacking auto shifts.
   * It does NOT remove overlapping auto shifts — overrides coexist with auto coverage.
   */
  existingShifts?: ShiftBlock[];
  /**
   * Per-pod coverage profiles. When omitted (or a profile missing for a pod),
   * the scheduler defaults to legacy 24×7 behavior so older callers continue
   * to work unchanged.
   */
  podProfiles?: PodCoverageProfile[];
}

export interface SchedulerOutput {
  shifts: ShiftBlock[];
  /** Hours per pod that have no on-call coverage. */
  gapHoursPerPod: Record<number, number>;
  /** Total uncovered hours across all pods. */
  totalGapHours: number;
}

/** Convert a Date to a YYYY-MM-DD string in UTC. */
function toDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * v2.5.0: Convert a UTC ms instant to a YYYY-MM-DD string in a specific
 * timezone. Used so a time-off row dated `2026-07-04` for a PDT engineer
 * matches the slot whose PDT local date is Jul 4 (UTC Jul 4 07:00 → Jul 5 07:00),
 * not the slot whose UTC date is Jul 4. This is the engineer-anchored holiday
 * semantics: a HOLIDAY/PTO row dated D for engineer E means "E is unavailable
 * during E's local D."
 */
function toLocalDateKey(ms: number, tz: Timezone): string {
  const offsetMs = TIMEZONE_OFFSETS[tz] * 60 * 60 * 1000;
  return toDateKey(new Date(ms + offsetMs));
}

/**
 * Resolve the engineer's local date key for a slot start instant. If the
 * engineer has no timezone set, fall back to UTC (pre-v2.5.0 behavior).
 */
function localDayKey(eng: SchedulerEngineerInput, slotStartMs: number): string {
  return eng.timezone
    ? toLocalDateKey(slotStartMs, eng.timezone)
    : toDateKey(new Date(slotStartMs));
}

/** Year boundaries in UTC ms. */
function yearBounds(year: number): { startMs: number; endMs: number } {
  return {
    startMs: Date.UTC(year, 0, 1, 0, 0, 0),
    endMs: Date.UTC(year + 1, 0, 1, 0, 0, 0),
  };
}

/** Build the candidate list for a pod, distributing engineers across pods. */
function partitionEngineers(
  engineers: SchedulerEngineerInput[],
  podCount: number,
): Map<number, SchedulerEngineerInput[]> {
  const pools = new Map<number, SchedulerEngineerInput[]>();
  for (let p = 1; p <= podCount; p++) pools.set(p, []);

  // Engineers explicitly assigned to a pod go there (if pod number is in range).
  // Unassigned engineers (or those out of range) get distributed round-robin.
  const unassigned: SchedulerEngineerInput[] = [];
  for (const eng of engineers) {
    if (!eng.active) continue;
    if (eng.podNumber && eng.podNumber >= 1 && eng.podNumber <= podCount) {
      pools.get(eng.podNumber)!.push(eng);
    } else {
      unassigned.push(eng);
    }
  }
  // Distribute unassigned round-robin to balance pool sizes.
  unassigned.sort((a, b) => a.id - b.id);
  let podIdx = 1;
  for (const eng of unassigned) {
    // Pick the smallest pool to balance.
    let smallest = 1;
    let smallestSize = pools.get(1)!.length;
    for (let p = 2; p <= podCount; p++) {
      const sz = pools.get(p)!.length;
      if (sz < smallestSize) {
        smallest = p;
        smallestSize = sz;
      }
    }
    pools.get(smallest)!.push(eng);
    podIdx = (podIdx % podCount) + 1;
  }
  return pools;
}

/**
 * Intersect a UTC-aligned slot `[rawStartMs, rawEndMs)` with the union of
 * coverage windows produced by `profile` in that range, then return the
 * single contiguous covered segment that begins at the earliest covered ms
 * inside the slot.
 *
 * Why a union, not just the first window: when a pod is anchored in a non-UTC
 * timezone (e.g. EDT, UTC-4) and its daily window crosses anchor-TZ midnight
 * into the next UTC day, a single UTC slot can intersect *two* consecutive
 * daily windows (yesterday-EDT's tail + today-EDT's head). For a 24×7 pod
 * those two intersections together cover the entire slot — we must merge
 * them before clipping so the legacy 8h shift output is preserved.
 *
 * Note: this returns the first contiguous covered run only. If a slot is
 * bisected by an off-period (e.g. an 8h pod with hours=2 SGT 09–11), we emit
 * a single shift for the *covered* portion and skip the rest, which is the
 * correct conservative behavior for the on-call use case.
 */
function clipSlotToCoverage(
  profile: PodCoverageProfile,
  rawStartMs: number,
  rawEndMs: number,
): { startMs: number; hours: number } | null {
  const windows = coverageWindowsInRange(profile, rawStartMs, rawEndMs);
  // Compute each window's intersection with the slot, drop empties, sort by
  // start, then merge contiguous/abutting intervals.
  const segments = windows
    .map((w) => ({
      s: Math.max(rawStartMs, w.startMs),
      e: Math.min(rawEndMs, w.endMs),
    }))
    .filter((seg) => seg.e > seg.s)
    .sort((a, b) => a.s - b.s);
  if (segments.length === 0) return null;

  // Merge: extend the current run while the next segment starts at or before
  // the run's current end (i.e. touching or overlapping).
  let runStart = segments[0].s;
  let runEnd = segments[0].e;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].s <= runEnd) {
      runEnd = Math.max(runEnd, segments[i].e);
    } else {
      break; // first contiguous run only
    }
  }
  return { startMs: runStart, hours: (runEnd - runStart) / HOUR_MS };
}

/**
 * Generate a full year's schedule.
 *
 * Strategy: Iterate week-by-week (168h blocks) per pod.
 * In each week, assign 21 eight-hour shifts (or fewer larger shifts if needed)
 * to engineers from the pod's pool, respecting all constraints.
 * The pool rotates so engineers naturally spread across weeks
 * (each engineer ideally works 1 week ON / next week-ish OFF given 5-day cycles).
 *
 * For simpler determinism: for each engineer in the pool, assign them a "phase"
 * (offset within the 7-day cycle) so their 5-day on / 2-day off pattern is staggered.
 */
export function generateSchedule(input: SchedulerInput): SchedulerOutput {
  const { year, podCount, engineers } = input;
  const { startMs, endMs } = yearBounds(year);
  const totalDays = Math.round((endMs - startMs) / DAY_MS);

  const shifts: ShiftBlock[] = [];
  const gapHoursPerPod: Record<number, number> = {};
  for (let p = 1; p <= podCount; p++) gapHoursPerPod[p] = 0;

  const pools = partitionEngineers(engineers, podCount);

  // Normalize coverage profiles so every pod has one. Pods without an explicit
  // profile default to 24×7 (legacy behavior).
  const profileByPod: Record<number, PodCoverageProfile> = {};
  for (let p = 1; p <= podCount; p++) profileByPod[p] = defaultCoverageProfile(p);
  if (input.podProfiles) {
    for (const pr of input.podProfiles) profileByPod[pr.podNumber] = pr;
  }

  // For each pod independently, generate coverage.
  for (let pod = 1; pod <= podCount; pod++) {
    const profile = profileByPod[pod];
    const pool = pools.get(pod)!;
    if (pool.length === 0) {
      // No engineers => only the *covered* hours of the year are gaps.
      let podGap = 0;
      for (let d = 0; d < totalDays; d++) {
        const dStart = startMs + d * DAY_MS;
        for (let h = 0; h < 24; h++) {
          if (isSlotCovered(profile, dStart + h * HOUR_MS, 1)) podGap += 1;
        }
      }
      gapHoursPerPod[pod] = podGap;
      continue;
    }

    // Each engineer gets a phase: which weekday they START their 5-day work block on.
    // Phases stagger so coverage is continuous.
    // Engineers' phases assigned modulo 7 by their position in pool.
    // Within a 5-day block, each day starts at the same time.
    // Across cycles (next 7-day cycle), the start time may rotate to share night shifts.

    // Track each engineer's running 168h-window hours for cap enforcement.
    // We use a sliding sum approach by storing all assigned shift start times per engineer.
    const engineerShiftHistory: Record<number, ShiftBlock[]> = {};
    for (const e of pool) engineerShiftHistory[e.id] = [];
    // Pre-seed history with manual overrides so the 45h/168h cap accounts for them.
    if (input.existingShifts) {
      for (const s of input.existingShifts) {
        if (engineerShiftHistory[s.engineerId]) {
          engineerShiftHistory[s.engineerId].push(s);
        }
      }
    }

    // For each day of the year, decide which engineer covers each 8-hour slot (3 slots/day).
    // Slots: 00-08, 08-16, 16-24 (UTC). Soft preference: 8h shifts.
    const SLOTS_PER_DAY = 3;

    // Pre-compute, for each engineer, which days are their 5-day work block within each 7-day cycle.
    // Engineer i (0-indexed in pool) starts their work block on day (i * blockOffset) mod 7.
    // We want overlapping coverage, so we use floor distribution.
    const onDayCache: Record<number, (dayIdx: number) => boolean> = {};
    pool.forEach((eng, i) => {
      const phase = pool.length > 0 ? i % 7 : 0; // weekday phase
      onDayCache[eng.id] = (dayIdx: number) => {
        // dayIdx 0 = Jan 1 of `year`. Weekday of Jan 1:
        const dow = (new Date(startMs + dayIdx * DAY_MS).getUTCDay() + 0) % 7;
        // Engineer is "on" if (dow - phase + 7) % 7 < 5 (5 work days then 2 off).
        const cyclePos = (dow - phase + 7) % 7;
        return cyclePos < SHIFTS_PER_BLOCK;
      };
    });

    // For each day, walk the 3 slots and pick an engineer.
    // We rotate slot ownership: an engineer assigned to "slot X this week" sticks to slot X for all 5 days.
    // Slot assignment changes weekly (after their off period).
    // Implementation: track each engineer's "current block": startDay (inclusive), endDay (exclusive), slotIdx.

    interface ActiveBlock {
      startDay: number;
      endDay: number;
      slotIdx: number; // 0, 1, or 2
    }
    const activeBlock: Record<number, ActiveBlock | null> = {};
    for (const e of pool) activeBlock[e.id] = null;

    // Per-slot rotating queue to assign new blocks to engineers.
    // We'll cycle through pool members for fairness.
    let rotationCursor = 0;

    // v2.3.3: Build the list of "slots" the scheduler will try to fill for each day.
    // For 24×7 pods this remains the legacy 3-slot UTC grid (each 8h wide). For
    // partial-day pods (coverageHoursPerDay < 24), we collapse the day to ONE
    // contiguous shift per coverage window — anchored at the actual window
    // start, with `coverageHoursPerDay` duration. That avoids the 7h+1h
    // fragmentation that v2.3.1's clip produced (a 09–17 SGT window straddles
    // the UTC 00/08/16 grid, so v2.3.1 emitted two shifts/day; v2.3.3 emits one).
    // We still call this collection "slots" so the assignment logic below is
    // unchanged — only the per-day enumeration is different.
    const isPartialDayPod = profile.coverageHoursPerDay < 24;

    for (let day = 0; day < totalDays; day++) {
      const dayStartMs = startMs + day * DAY_MS;
      const dayDate = new Date(dayStartMs);
      const dayOfWeek = dayDate.getUTCDay();
      const dayKey = toDateKey(dayDate);

      // ---- Build the slot list for this day. ----
      // Each entry: { startMs, durationHours, slotIdx }.
      // `slotIdx` is preserved so the active-block continuity logic still works
      // (engineers stay in the same slot for their 5-day block).
      const daySlots: Array<{
        startMs: number;
        durationHours: number;
        slotIdx: number;
      }> = [];

      if (isPartialDayPod) {
        // Find every coverage window whose ANCHOR-TZ calendar day matches this
        // UTC day's range. We use a 48h lookup centered on dayStartMs to catch
        // windows that may have started the prior UTC day (e.g. 22:00 SGT Mon =
        // 14:00 UTC Mon — same UTC day; but 22:00 PDT Mon = 05:00 UTC Tue —
        // different UTC day).
        const windows = coverageWindowsInRange(
          profile,
          dayStartMs,
          dayStartMs + DAY_MS,
        );
        // De-dupe by start, keep only windows whose start falls inside this UTC day.
        // (A 48h sweep can return both yesterday's-anchor and today's-anchor windows.)
        const seen = new Set<number>();
        for (const w of windows) {
          if (w.startMs < dayStartMs || w.startMs >= dayStartMs + DAY_MS) continue;
          if (seen.has(w.startMs)) continue;
          seen.add(w.startMs);
          daySlots.push({
            startMs: w.startMs,
            durationHours: (w.endMs - w.startMs) / HOUR_MS,
            slotIdx: 0, // single slot/day for partial-day pods
          });
        }
      } else {
        // Legacy 24×7 path: 3 UTC-aligned 8h slots/day, clipped to the union of
        // any coverage windows they touch (handles non-UTC anchored 24×7 pods).
        for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
          const rawSlotStartMs = dayStartMs + slot * PREFERRED_SHIFT_HOURS * HOUR_MS;
          const rawSlotEndMs = rawSlotStartMs + PREFERRED_SHIFT_HOURS * HOUR_MS;
          if (!isSlotCovered(profile, rawSlotStartMs, PREFERRED_SHIFT_HOURS)) continue;
          const trim = clipSlotToCoverage(profile, rawSlotStartMs, rawSlotEndMs);
          if (!trim || trim.hours <= 0) continue;
          daySlots.push({
            startMs: trim.startMs,
            durationHours: trim.hours,
            slotIdx: slot,
          });
        }
      }

      for (const ds of daySlots) {
        const slot = ds.slotIdx;
        const slotStartMs = ds.startMs;
        const slotDuration = ds.durationHours;

        // v2.10.0: assign N engineers per slot (concurrent on-call depth).
        const requiredDepth = profile.engineersPerShift ?? 1;
        const alreadyAssignedThisSlot = new Set<number>();

        for (let depthIdx = 0; depthIdx < requiredDepth; depthIdx++) {
          // Find an engineer with an active block covering this slot today.
          let assigned: SchedulerEngineerInput | null = null;
          for (const eng of pool) {
            if (alreadyAssignedThisSlot.has(eng.id)) continue;
            const block = activeBlock[eng.id];
            if (
              block &&
              day >= block.startDay &&
              day < block.endDay &&
              block.slotIdx === slot
            ) {
              // Check this specific day isn't a time-off day, anchored in the
              // engineer's own timezone (v2.5.0).
              if (eng.timeOffDates.has(localDayKey(eng, slotStartMs))) continue;
              // Check hard preference for this weekday.
              if (eng.hardPreferences.forbiddenWeekdays.includes(dayOfWeek)) continue;
              // Check rolling 168h cap.
              if (
                hoursInLast168h(engineerShiftHistory[eng.id], slotStartMs) +
                  slotDuration >
                HARD_CAP_HOURS_PER_168H
              ) {
                continue;
              }
              // Check minimum rest period between consecutive shifts.
              if (
                violatesMinRest(engineerShiftHistory[eng.id], slotStartMs, slotDuration)
              ) {
                continue;
              }
              assigned = eng;
              break;
            }
          }

          // If no engineer with an active block, try to start a new block for someone.
          if (!assigned) {
            for (let attempt = 0; attempt < pool.length; attempt++) {
              const candidate = pool[(rotationCursor + attempt) % pool.length];
              if (alreadyAssignedThisSlot.has(candidate.id)) continue;
              // Skip if engineer is mid-block for another slot (shouldn't be on-call multiple slots same day in same pod).
              const candBlock = activeBlock[candidate.id];
              if (candBlock && day >= candBlock.startDay && day < candBlock.endDay) {
                continue;
              }
              // Engineer must be in their "on" cycle window for the next 5 days.
              // Check candidate is on for `day` and the following 4 days.
              const onFunc = onDayCache[candidate.id];
              let canStartBlock = true;
              for (let d = 0; d < SHIFTS_PER_BLOCK; d++) {
                if (!onFunc(day + d)) {
                  canStartBlock = false;
                  break;
                }
              }
              // We allow starting even if they aren't in cycle by overriding phase: this provides flex
              // when pool is small. But prefer in-phase candidates first.
              if (!canStartBlock && pool.length >= 5) continue;

              // Check hard preference forbids this day.
              if (candidate.hardPreferences.forbiddenWeekdays.includes(dayOfWeek)) continue;
              // Check soft preference: weekdayOnly => skip Sat/Sun if alternatives exist.
              // (we'll still allow if needed, since this is soft)
              if (candidate.timeOffDates.has(localDayKey(candidate, slotStartMs))) continue;
              // Check rolling cap.
              if (
                hoursInLast168h(engineerShiftHistory[candidate.id], slotStartMs) +
                  slotDuration >
                HARD_CAP_HOURS_PER_168H
              ) {
                continue;
              }
              // Check minimum rest period between consecutive shifts.
              if (
                violatesMinRest(
                  engineerShiftHistory[candidate.id],
                  slotStartMs,
                  slotDuration,
                )
              ) {
                continue;
              }
              // Check soft preference - prefer weekday-only candidates first
              if (
                candidate.softPreferences.weekdayOnly &&
                (dayOfWeek === 0 || dayOfWeek === 6)
              ) {
                // Try later attempts before falling back here.
                continue;
              }
              // Found a candidate.
              assigned = candidate;
              activeBlock[candidate.id] = {
                startDay: day,
                endDay: day + SHIFTS_PER_BLOCK,
                slotIdx: slot,
              };
              rotationCursor = (rotationCursor + attempt + 1) % pool.length;
              break;
            }
          }

          // Fallback: relax soft preferences (allow weekend even if soft pref says no).
          if (!assigned) {
            for (let attempt = 0; attempt < pool.length; attempt++) {
              const candidate = pool[(rotationCursor + attempt) % pool.length];
              if (alreadyAssignedThisSlot.has(candidate.id)) continue;
              const candBlock = activeBlock[candidate.id];
              if (candBlock && day >= candBlock.startDay && day < candBlock.endDay) {
                continue;
              }
              if (candidate.hardPreferences.forbiddenWeekdays.includes(dayOfWeek)) continue;
              if (candidate.timeOffDates.has(localDayKey(candidate, slotStartMs))) continue;
              if (
                hoursInLast168h(engineerShiftHistory[candidate.id], slotStartMs) +
                  slotDuration >
                HARD_CAP_HOURS_PER_168H
              ) {
                continue;
              }
              // Min rest enforcement holds even in the soft-pref-relaxed fallback.
              if (
                violatesMinRest(
                  engineerShiftHistory[candidate.id],
                  slotStartMs,
                  slotDuration,
                )
              ) {
                continue;
              }
              assigned = candidate;
              activeBlock[candidate.id] = {
                startDay: day,
                endDay: day + SHIFTS_PER_BLOCK,
                slotIdx: slot,
              };
              rotationCursor = (rotationCursor + attempt + 1) % pool.length;
              break;
            }
          }

          if (assigned) {
            const shift: ShiftBlock = {
              engineerId: assigned.id,
              podNumber: pod,
              startMs: slotStartMs,
              durationHours: slotDuration,
            };
            shifts.push(shift);
            engineerShiftHistory[assigned.id].push(shift);
            alreadyAssignedThisSlot.add(assigned.id);
          } else {
            // Count gap hours only once per unfilled depth slot.
            gapHoursPerPod[pod] += slotDuration;
          }
        } // end depthIdx loop
      }

      // Clean up expired blocks (after the day ends).
      for (const eng of pool) {
        const blk = activeBlock[eng.id];
        if (blk && day + 1 >= blk.endDay) {
          activeBlock[eng.id] = null;
        }
      }
    }
  }

  const totalGapHours = Object.values(gapHoursPerPod).reduce((a, b) => a + b, 0);
  return { shifts, gapHoursPerPod, totalGapHours };
}

/** Sum hours assigned to an engineer in the 168h preceding `nowMs`. */
function hoursInLast168h(history: ShiftBlock[], nowMs: number): number {
  const windowStart = nowMs - CYCLE_HOURS * HOUR_MS;
  let total = 0;
  for (const s of history) {
    if (s.startMs >= windowStart && s.startMs < nowMs) {
      total += s.durationHours;
    }
  }
  return total;
}

/**
 * Returns true if placing a shift at `slotStartMs` (lasting `slotDurationHours`)
 * would violate the MIN_REST_HOURS rule against any shift already in `history`.
 *
 * Specifically the new shift's start must be >= MIN_REST_HOURS after the most
 * recent prior shift's end, AND the new shift's end must be <= MIN_REST_HOURS
 * before the next future shift's start.
 */
function violatesMinRest(
  history: ShiftBlock[],
  slotStartMs: number,
  slotDurationHours: number,
): boolean {
  const restMs = MIN_REST_HOURS * HOUR_MS;
  const slotEndMs = slotStartMs + slotDurationHours * HOUR_MS;
  for (const s of history) {
    const sEnd = s.startMs + s.durationHours * HOUR_MS;
    // Same shift (or overlapping) is always a conflict; treat as no-rest.
    if (s.startMs < slotEndMs && sEnd > slotStartMs) return true;
    // Prior shift ends too close to the proposed start.
    if (sEnd <= slotStartMs && slotStartMs - sEnd < restMs) return true;
    // Future shift starts too close to the proposed end.
    if (s.startMs >= slotEndMs && s.startMs - slotEndMs < restMs) return true;
  }
  return false;
}

/**
 * Assign random PTO and Holiday days to each engineer for the given year.
 * Constraint: PTO/Holiday days must NOT fall on the engineer's 48-hour off block
 * (i.e., the 2 off-days within their cycle).
 *
 * Since the off-days depend on cycle phase (which we don't lock until generation),
 * we instead enforce: PTO/Holiday must fall on a day where the engineer would
 * otherwise be on-call. We approximate "on-call days" as their 5-day work block
 * based on their pool position phase.
 *
 * Simpler approach: assign random days, then verify each is a "work day" using
 * the same phase logic as scheduling. If we don't know the phase yet, use
 * a default (engineer ID % 7).
 */
export function assignTimeOff(
  engineerIds: number[],
  year: number,
  enablePto: boolean,
  enableHolidays: boolean,
): { engineerId: number; kind: "PTO" | "HOLIDAY"; date: string }[] {
  if (!enablePto && !enableHolidays) return [];

  const { startMs, endMs } = yearBounds(year);
  const totalDays = Math.round((endMs - startMs) / DAY_MS);
  const result: { engineerId: number; kind: "PTO" | "HOLIDAY"; date: string }[] = [];

  for (const engineerId of engineerIds) {
    // Determine work days for this engineer using same phase as scheduler.
    // Phase = (engineerId - 1) % 7 — keeps it deterministic.
    const phase = ((engineerId - 1) % 7 + 7) % 7;
    const workDays: number[] = [];
    for (let d = 0; d < totalDays; d++) {
      const dow = new Date(startMs + d * DAY_MS).getUTCDay();
      const cyclePos = (dow - phase + 7) % 7;
      if (cyclePos < SHIFTS_PER_BLOCK) workDays.push(d);
    }

    // Seeded shuffle for determinism by engineerId+year.
    const rng = mulberry32(year * 1000 + engineerId);
    const shuffled = [...workDays];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    let cursor = 0;
    if (enablePto) {
      for (let i = 0; i < PTO_DAYS_PER_YEAR && cursor < shuffled.length; i++, cursor++) {
        const d = shuffled[cursor];
        const date = toDateKey(new Date(startMs + d * DAY_MS));
        result.push({ engineerId, kind: "PTO", date });
      }
    }
    if (enableHolidays) {
      for (let i = 0; i < HOLIDAY_DAYS_PER_YEAR && cursor < shuffled.length; i++, cursor++) {
        const d = shuffled[cursor];
        const date = toDateKey(new Date(startMs + d * DAY_MS));
        result.push({ engineerId, kind: "HOLIDAY", date });
      }
    }
  }
  return result;
}

/** Deterministic seeded RNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Compute hours per engineer per ISO week from a list of shifts. */
export function computeWeeklyHours(
  shifts: ShiftBlock[],
): Record<number, Record<string, number>> {
  const result: Record<number, Record<string, number>> = {};
  for (const s of shifts) {
    const d = new Date(s.startMs);
    const week = isoWeekKey(d);
    if (!result[s.engineerId]) result[s.engineerId] = {};
    result[s.engineerId][week] = (result[s.engineerId][week] ?? 0) + s.durationHours;
  }
  return result;
}

/** Compute hours per engineer per month from a list of shifts. */
export function computeMonthlyHours(
  shifts: ShiftBlock[],
): Record<number, Record<string, number>> {
  const result: Record<number, Record<string, number>> = {};
  for (const s of shifts) {
    const d = new Date(s.startMs);
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!result[s.engineerId]) result[s.engineerId] = {};
    result[s.engineerId][month] = (result[s.engineerId][month] ?? 0) + s.durationHours;
  }
  return result;
}

function isoWeekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((tmp.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export { hoursInLast168h, toDateKey, yearBounds, violatesMinRest };
