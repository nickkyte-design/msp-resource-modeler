# MSP Resource Modeler

A scheduling and resource-planning tool for Managed Service Providers (MSPs). Model your on-call rotation, visualise coverage gaps, and simulate headcount changes — all in one place.

---

## Features

### Roster & Pods
- Manage a team of engineers with names, timezones, and pod assignments
- Toggle engineers active/deactivated
- Set hard constraints (e.g. never on Sundays) and soft preferences (e.g. prefer weekday shifts, prefer 8 h shifts)
- Bulk-edit preferences for all engineers at once
- Inline engineer renaming and per-engineer avatar colour
- Bulk rename via CSV upload

### Schedule Engine
- Generates an optimised full-year schedule automatically
- 48 h off / 120 h on (5-shift work block) cycle
- Uniform shift start time within each 5-day block
- Hard cap: 45 h per rolling 168 h window
- 12 h minimum rest enforced between shifts
- Soft target: ~40 h / week (tracked on Balance page)
- Supports 1, 2, or 3 pods; one engineer per pod on-call at any time
- Skips PTO, holidays, and deactivated engineers
- Manual override shifts are preserved across re-generation

### Calendar Views
- Weekly, monthly, and yearly views
- All-engineers or individual engineer selection
- Timezone-aware display (EDT, PDT, SGT, BST, IST)
- PTO/Holiday indicator dots on day headers
- Deep-link to a specific date + pod via URL parameters

### Heat Map
- Year view: daily coverage-density grid, coloured by gap severity
- Month view: 7-column weekly grid with day-of-month labels and gap hours
- Hatched cells mark off-coverage-window slots
- Clickable days open a DayScheduleDrawer with a 24 h timeline

### Gap Report
- Gaps grouped by month with per-pod summary cards
- Severity filter (all / ≥4 h / ≥8 h / ≥16 h)
- Day-of-week heat strip showing per-day-of-week gap totals
- PTO/Holiday dots on each calendar day cell
- Per-row "Suggest fix" → auto-picks the best engineer respecting tz, caps, rest, and PTO
- "Auto-fix gaps ≤8 h" bulk action
- CSV export
- Click a day cell to open DayScheduleDrawer

### Balance Page
- Per-engineer weekly and monthly hour totals
- Deviation from the 40 h/week target

### Settings
- Pod count (1–3) with dynamic headcount suggestions
- Per-pod coverage profile: days of week, hours per day, start hour, anchor timezone
- PTO toggle (random ~10 days/year per engineer)
- Holiday management: add/edit/delete holidays, load US Federal or India Gazetted presets, apply to roster
- Re-balance Pods action
- Default engineer pin

### Hire What-If
- Per-pod stepper (+0…+10 new hires) with timezone picker
- Runs a live simulation and shows baseline vs. hypothetical gap hours and hours saved per new engineer

### Ask AI
- Sidebar drawer with an AI assistant that has context about your schedule, gap hours, and pod summary
- Supports markdown responses and prompt suggestions

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind CSS 4, TypeScript |
| Routing | Wouter |
| UI | shadcn/ui + Radix UI + Lucide |
| Data fetching | tRPC 11 + TanStack Query 5 |
| Backend | Express 4 |
| ORM / DB | Drizzle ORM + MySQL (TiDB Cloud) |
| Testing | Vitest (191+ tests) |
| Build | Vite 7, esbuild |

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 10+
- A MySQL-compatible database (e.g. TiDB Cloud)

### Install

```bash
pnpm install
```

### Environment

Create a `.env` file at the project root:

```env
DATABASE_URL=******host:4000/dbname?ssl={"rejectUnauthorized":true}
JWT_SECRET=your-jwt-secret
OAUTH_SERVER_URL=https://your-oauth-server
VITE_APP_TITLE=MSP Resource Modeler
```

### Database

```bash
pnpm db:push
```

### Development

```bash
pnpm dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

### Build

```bash
pnpm build
pnpm start
```

### Tests

```bash
pnpm test
```

---

## Project Structure

```
client/
  src/
    pages/        ← Page-level components (Roster, Calendar, HeatMap, …)
    components/   ← Reusable UI components
    contexts/     ← React contexts (Theme, …)
    hooks/        ← Custom hooks
    lib/trpc.ts   ← tRPC client
    App.tsx       ← Route definitions
drizzle/          ← Schema & SQL migrations
server/
  db.ts           ← Query helpers
  routers.ts      ← tRPC procedures
  scheduler.ts    ← Scheduling engine
shared/           ← Shared constants & types
```

---

## License

MIT
