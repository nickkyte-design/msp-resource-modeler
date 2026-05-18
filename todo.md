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
