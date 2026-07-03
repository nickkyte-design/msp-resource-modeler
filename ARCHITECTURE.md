# Architecture Overview — Team Rota v3.0 (Supabase)

## **System Design**

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Client)                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ React App (Vite)                                     │  │
│  │ ├─ Login Page (Supabase Auth)                        │  │
│  │ ├─ Calendar (shifts, holidays)                       │  │
│  │ ├─ Roster (engineers, preferences)                   │  │
│  │ ├─ Settings (pods, coverage, timezones)              │  │
│  │ └─ Gap Report (coverage analysis)                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                        ↓ tRPC + JWT                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Vercel Edge Network                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Node.js Server (Express)                             │  │
│  │ ├─ tRPC Router (type-safe procedures)                │  │
│  │ │  ├─ engineers.list/create/update/delete            │  │
│  │ │  ├─ shifts.generate/create/delete                  │  │
│  │ │  ├─ settings.get/update                            │  │
│  │ │  ├─ holidays.list/apply/clear                      │  │
│  │ │  └─ (50+ procedures)                               │  │
│  │ ├─ Auth Middleware (JWT verification)                │  │
│  │ └─ Error Handling                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                        ↓ Drizzle ORM                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Supabase (Backend)                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ PostgreSQL Database                                 │   │
│  │ ├─ users (Supabase Auth users)                      │   │
│  │ ├─ engineers (team members)                         │   │
│  │ ├─ shifts (on-call rotations)                       │   │
│  │ ├─ settings (app config)                            │   │
│  │ ├─ timeOff (PTO + holidays)                         │   │
│  │ ├─ podCoverage (coverage profiles)                  │   │
│  │ ├─ holidays (holiday registry)                      │   │
│  │ └─ locations (site codes)                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Supabase Auth (JWT-based)                           │   │
│  │ ├─ Email/password sign-up & sign-in                 │   │
│  │ ├─ Magic link authentication                        │   │
│  │ └─ Session management                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Vercel Blob (file storage)                          │   │
│  │ └─ CSV/ICS exports (future)                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## **Database Schema (PostgreSQL)**

### **users** — Supabase Auth users
- `id` — Primary key
- `userId` — Supabase Auth user ID (UUID, unique)
- `accountId` — Tenant ID for multi-tenancy
- `email` — User email
- `name` — Display name
- `role` — 'user' | 'admin'
- Timestamps: `createdAt`, `updatedAt`, `lastSignedIn`

### **engineers** — Team members
- `id` — Primary key
- `accountId` — Tenant scoping
- `name` — Display name/number
- `timezone` — EDT, PDT, SGT, BST, IST
- `podNumber` — 1–10 (optional)
- `active` — Boolean
- `region` — US, IN, SG, UK, GLOBAL
- `softPreferences` — JSON (overridable)
- `hardPreferences` — JSON (enforced)
- `avatarColor` — Hex color for UI
- `sortOrder` — Display order
- Timestamps

### **shifts** — On-call rotations
- `id` — Primary key
- `accountId` — Tenant scoping
- `engineerId` — Foreign key to engineers
- `podNumber` — 1–10
- `startMs` — UTC timestamp (milliseconds)
- `durationHours` — 4–24
- `scheduleYear` — For fast filtering
- `manualOverride` — Preserved across regenerations
- Timestamps

### **settings** — App configuration
- `id` — Primary key (always 1 per accountId)
- `accountId` — Tenant scoping (unique)
- `podCount` — 1–10
- `ptoEnabled`, `holidaysEnabled` — Boolean flags
- `displayTimezone` — For UI display
- `scheduleYear` — Active year
- `holidaysPerYear` — Target count
- `defaultEngineerId` — Default on-call
- Timestamps

### **Other tables**
- **timeOff** — PTO + holiday records (date-based)
- **podCoverage** — Per-pod coverage profiles (hours/days)
- **holidays** — Holiday registry with region presets
- **locations** — Site codes and pod assignments

## **Multi-Tenancy Model**

Every record includes `accountId` for isolation:

```typescript
// When user signs up, they get an accountId
const user = await createUser({
  userId: supabaseUser.id,      // From JWT
  accountId: generateId(),       // Tenant ID
  email: supabaseUser.email,
});

// All queries scope to accountId
const engineers = await db
  .select()
  .from(engineers)
  .where(eq(engineers.accountId, context.accountId));
```

Enables:
- ✅ Multiple teams in one deployment
- ✅ Data isolation
- ✅ Future reselling potential

## **Deployment Pipeline**

```
GitHub (feature/phase-1-supabase-migration)
    ↓
Vercel detects push
    ↓
pnpm install
    ↓
pnpm build
    ├─ TypeScript compilation
    ├─ Vite frontend build
    └─ esbuild backend bundle
    ↓
Tests (vitest)
    ↓
Deploy to Vercel Edge
    ├─ Node.js server on `team-rota.dev`
    └─ Static files on CDN
    ↓
Server connects to Supabase
    ├─ DATABASE_URL validated
    └─ Migrations auto-applied
    ↓
Live at https://team-rota.dev
```

## **Environment Variables**

**Development** (`.env.local`):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
DATABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

**Production** (Vercel secrets):
- All of the above
- Plus: `BLOB_READ_WRITE_TOKEN` for file storage

## **Security**

1. **Authentication** — Supabase Auth (JWT-based)
2. **Authorization** — accountId scoping on all queries
3. **Data Isolation** — No cross-tenant access possible
4. **Secrets** — Service role key stored only on server

## **Next Steps**

1. Run local setup: `pnpm install && pnpm db:push && pnpm dev`
2. Test login flow at `http://localhost:3000`
3. Push to GitHub and deploy on Vercel
4. Configure custom domain
5. Invite team members
