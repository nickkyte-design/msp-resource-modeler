# MSP Resource Modeler - TODO

## Foundation
- [x] Database schema: engineers, pods, locations, schedules, settings, shifts, pto/holiday
- [x] Design system: elegant theme, typography, color palette
- [x] App-wide navigation (no auth required)
- [x] Seed default data on first load (15 engineers, default locations, 1 pod)

## Roster Page
- [x] Engineer table with: name (1, 2, 3...), timezone, pod assignment, active/deactivated
- [x] Edit individual engineer soft preferences (weekday-only, 8h shift preference)
- [x] Edit individual engineer hard preferences (absolute constraints e.g. never Sundays)
- [x] "Edit All" button to bulk-edit preferences for all engineers
- [x] Active/deactivate toggle per engineer
- [x] Add/remove engineer (default team size 15, editable)
- [x] Pod assignment per engineer

## Settings Page
- [x] Team size editor (via Roster page)
- [x] Pod count selector (1, 2, or 3)
- [x] Suggested engineer count display (per pod count)
- [x] PTO toggle (random 10 days/yr per engineer, never on off-days)
- [x] Holidays toggle (random 11 days/yr per engineer, never on off-days)
- [x] Timezone selector (EDT, PDT, SGT, BST)
- [x] Add/remove location (Loc) site names (default: NLH, LCO, QNO, VNA, LAL, VLL)

## Pod-to-Location Page
- [x] Assign pods to locations (metadata only, no scheduling effect)

## Scheduling Engine
- [x] 7-day cycle: 48h off + 120h on (5 shifts)
- [x] Same start time within a 5-day work block
- [x] Shift length: prefer 8h
- [x] Hard cap: 45h per rolling 168h
- [x] Soft goal: ~40h/week (tracked in Balance page)
- [x] Pod constraints: 1 person per pod on-call at a time
- [x] Engineers stay in same pod for entire 5-day block
- [x] Honor hard preferences absolutely
- [x] Honor soft preferences when possible
- [x] Skip PTO/holiday days
- [x] Skip deactivated engineers
- [x] Auto-generate optimized full-year schedule
- [x] Compute suggested headcount for 1/2/3 pod configurations

## Calendar Views
- [x] Weekly view with shift blocks
- [x] Monthly view
- [x] Yearly view
- [x] All-engineers view + individual engineer selector
- [x] Show pod assignment per shift
- [x] Timezone-aware display

## Heat Map Page
- [x] Coverage density visualization (hours/day with on-call coverage)
- [x] Gap and overload identification

## Balance Page
- [x] Per-engineer weekly hour totals
- [x] Per-engineer monthly hour totals
- [x] Deviation from 40h/week target

## Polish & Delivery
- [x] Elegant, refined styling throughout
- [x] Loading and empty states
- [x] Vitest tests for scheduling engine (16 tests + 1 auth test, all pass)
- [x] Singleton seed guard prevents duplicates
- [x] Verified: 2 pods × 15 engineers → 99.9% coverage, 16 gap hours/year
- [x] Final checkpoint

## v1.2 — Filtering & Visualization Polish
- [x] Mirror Pod filter on Heat Map page (rescales coverage % when filtered to single pod)
- [x] Mirror Pod filter on Balance page (totals/breakdown isolate to selected pod)
- [x] Add "Default engineer" pin in Settings (persisted via new defaultEngineerId column)
- [x] Add "Show only mine" toggle on Calendar
- [x] Color shift cards by Pod when "All engineers" is selected, by Engineer otherwise

## v1.3 — Editable engineer names
- [x] Inline rename with click-to-edit chip on Roster
- [x] Names flow through Calendar shift cards, Balance, Pods, Settings selectors

## v1.4 — Gap Report
- [x] Dedicated Gap Report page with intervals grouped by month
- [x] Per-pod summary cards
- [x] CSV export
- [x] Pure findGaps helper + 8 vitest cases

## v1.5 — Time filter, calendar visual, capacity planning
- [x] Gap Report: month-or-full-year time filter
- [x] Gap Report: calendar visual (12 monthly heatmap grids, day-shaded by gap-hours)
- [x] Gap Report: "Fix this gap" row action that deep-links to Calendar with day + pod pre-selected
- [x] Calendar: honors `?date=YYYY-MM-DD&pod=N` URL params on load (sets cursor + view + pod filter)
- [x] Settings: dynamic auto-suggested headcount per pod (factoring 48h/120h cycle + PTO + holidays) with reasoning popover
- [x] Settings: Re-balance Pods action redistributes engineers and re-runs scheduler
- [x] Vitest: covers headcount-suggestion math and re-balance assignment (10 new tests, 35 total passing)

## v1.6 — Zero-gap headcount recommendation
- [x] Headcount adds 10% clustering margin + 1 floating reliever per pod
- [x] Reasoning popover updated; tests adjusted (43 total passing)

## v1.7 — Click-to-fix gap workflow
- [x] Added `manualOverride` boolean column to shifts table (migration 0004)
- [x] Added tRPC procedures: `shifts.listForDay`, `shifts.createOverride`, `shifts.deleteOverride`
- [x] Built `DayScheduleDrawer` component with per-pod 24h timeline, gap highlights, add-shift form, and override delete buttons
- [x] Gap Report calendar day cells clickable → opens drawer with the day + selected pod
- [x] Gap Report month tile (All-Year mode) clickable → narrows time-range to that month
- [x] Scheduler preserves `manualOverride = 1` shifts on re-generation; cap-aware via `existingShifts` input
- [x] Vitest: override persistence + gap-after-override math + cap accounting (3 new tests, 46 total passing)

## v1.8 — IST timezone, avatar colors, bulk CSV rename, version surface

- [x] Add IST (India Standard Time, UTC+5:30) to TIMEZONE_OFFSETS and TimezoneCode union
- [x] Update Calendar / Heat Map / Gap Report / DayScheduleDrawer / Settings timezone selectors to include IST
- [x] Add `avatarColor` column to engineers table (migration 0005)
- [x] Avatar color picker per engineer on Roster page
- [x] Engineer color propagates to Calendar shift cards, Balance avatars, DayScheduleDrawer timeline
- [x] Bulk rename engineers via CSV upload (file picker, preview dialog, apply mutation)
- [x] App version constant (v1.8) surfaced in sidebar (`APP_VERSION` shared constant + footer pill)
- [x] Vitest: timezone catalog + APP_VERSION (5 new tests, 52 total passing)

## v1.9 — Ask AI agent + Heat Map month view

- [x] Backend `ai.ask` tRPC procedure: builds compact schedule context (engineer count, pod count, totals, gap hours, top gaps, per-pod summary) and forwards to `invokeLLM`
- [x] Frontend Ask AI drawer (Sheet) with message history, markdown rendering, send-on-Enter, prompt suggestions
- [x] Sidebar "Ask AI" entry that opens the drawer (always available)
- [x] Heat Map: Month view tab with 7-col weeks-of-month grid; each cell shows day-of-month + gap-hours; colored by gap severity
- [x] Heat Map: month picker (prev/next + month name)
- [x] Click a Month-view day to open the existing DayScheduleDrawer (reuse v1.7 component)
- [x] Vitest: ai context builder (db-mocked) + monthGrid helper 6-week alignment (13 new tests, 70 total passing)

## v1.10 — PTO/Holiday dots

- [x] Backend: `timeOff.summaryByDay` tRPC procedure returning per-day `{ pto: string[], holiday: string[] }`
- [x] Shared helper `groupTimeOffByDay` (pure, testable) in `shared/timeOff.ts`
- [x] Calendar (Weekly + Monthly) day-headers: `DayOffIndicator` with amber/violet dots + tooltip listing engineer names
- [x] Heat Map Year view: PTO/Holiday off-strip above the day grid (amber/violet, gradient when both)
- [x] Heat Map Month view: small PTO/Holiday dots in each day cell top-right corner
- [x] Legend chip on Calendar header + Heat Map header + Heat Map Month view (PTO amber / Holiday violet)
- [x] Vitest: `groupTimeOffByDay` correctness + dedupe + sort (7 new tests, 77 total passing)

## v1.10.1 — PTO/Holiday dots on Gap Report

- [x] Compute `timeOffByDay` on Gap Report from `schedule.list` output (same shape used by Heat Map)
- [x] Render PTO/Holiday dots on each day cell of the Gap Report 12-month calendar grid (top-right corner)
- [x] Roll up to a month-header indicator (small dot row beside the month name) when any day in the month has PTO/Holiday
- [x] Tooltip listing affected engineer names on hover (`{date} — PTO: A, B • Holiday: C`)
- [x] Add the same PTO/Holiday legend chip already used on Calendar/Heat Map

## v1.11 — Gap Report productivity upgrades

- [x] PTO/Holiday chip in each gap-table row (reuse `timeOffByDay`)
- [x] Severity filter on Gap Report (`all` / `>=4h` / `>=8h` / `>=16h`)
- [x] Day-of-week heat strip above the calendar (7 cells showing per-DoW gap-hour totals)
- [x] Shared gap-suggester helper: pick best engineer respecting tz, 45h/168h caps, weekday preference, PTO, and back-to-back (10h min rest)
- [x] `gaps.suggestFix` tRPC query that returns the candidate engineer + ready-to-apply `override` payload
- [x] `gaps.autoFixSmall` tRPC mutation that suggests + applies fixes for every gap <= 8h in one transaction
- [x] UI: per-row "Suggest" button → AlertDialog confirm → `shifts.createOverride`
- [x] UI: "Auto-fix gaps <=8h" bulk button in Gap Report toolbar with result toast/dialog
- [x] Vitest: suggester cap-awareness, tz match, PTO avoidance, weekday block, back-to-back avoidance + severity filter helper (22 new tests, 117 total passing)

## v2.0 — Per-site coverage profiles (days/week + hours/day)

- [x] New `pod_coverage` table: `podNumber` PK, `daysOfWeek` bitmask (Sun=1, Sat=64), `coverageStartHour` (0-23 in pod-anchor TZ), `coverageHoursPerDay` (8/10/12/16/20/24), `anchorTimezone`
- [x] Migration 0006 + seed rows defaulting to 24/7 for pods 1-3 (existing schedules behave identically)
- [x] Shared helper `coverageWindowForDay` + `coverageWindowsInRange` returning UTC ms intervals
- [x] Shared helper `requiredHoursInRange(podCoverage, startMs, endMs)` for the Gap Report denominator
- [x] New `findGapsWithCoverage` variant takes `podCoverage[]` and skips non-coverage slots (existing `findGaps` retained)
- [x] `generateSchedule` accepts `podProfiles` and skips slot starts outside coverage windows
- [x] tRPC `pods.list` / `pods.upsert` procedures + zod schema
- [x] Settings UI: per-pod card with day-of-week chips, hours-per-day presets (8/10/12/16/20/24), start-hour + anchor-TZ pickers
- [x] Gap Report uses coverage-aware math; off-hours no longer counted as gaps (Calendar/Heat Map dim-overlay deferred to v2.1)
- [x] (v2.1) Heat Map Year view + Month view: hatched gray non-coverage cells labelled "off" with "outside coverage window" tooltip and an Off-window legend chip
- [x] Headcount recommender uses sum(per-pod weekly-required-hours) baseline (`computeHeadcountSuggestionForCoverage`)
- [x] Bump `APP_VERSION` to `2.0.0`
- [x] Vitest: coverage helper edge cases (incl. IST wrap-past-midnight), gap detector windowing, headcount math (18 new tests, 95 total passing)

## v2.1.2 — 12h minimum rest enforced in scheduler

- [x] `MIN_REST_HOURS = 12` exported from `server/scheduler.ts`
- [x] `violatesMinRest(history, slotStart, slotDur)` helper used in all three candidate paths (active block, new block, soft-relaxed fallback)
- [x] Regenerated 2026 schedule: zero sub-12h pairs in May/June (SQL-verified)
- [x] Vitest: 4 new cases including a year-long pairwise verification (121 total passing)

## v2.2 — Hire/Headcount What-If

- [x] Backend `hiring.simulate` tRPC procedure: accepts `additions[]` (per-pod count + timezone), clones live engineers + appends synthetic ones, runs `generateSchedule`, returns baseline + hypothetical gap-hours per pod
- [x] Reuse real `podProfiles`, real PTO/Holiday rate (synthetic engineers get no PTO/holiday — clean upper bound), real cap + min-rest rules
- [x] Frontend Settings widget: per-pod +N stepper (0..10), timezone picker for new hires, "Run simulation" button
- [x] Result card: baseline total / hypothetical total / delta + per-pod table + "hours saved per new engineer" ratio
- [x] Loading state (engine takes ~1–3s) + error handling
- [x] Vitest: router-level hiring.simulate tests (payload shape, additions=0 identity, additions>0 monotonic non-regression, timezone field accepted) + engine-level tests — 4 router + 3 engine tests, 125 total passing
- [x] Audit fixes: `HireWhatIfSection` uses useEffect (no setState-during-render); timezone field carried through API + UI caption clarifying it's informational; router-level tests use createCaller + vi.mock
- [x] Bump `APP_VERSION` to 2.2.0
