# Team Rota — Scheduling Tool

🚀 **Production-ready scheduling application** for managing on-call rotations, engineer preferences, pod management, and 24/7/365 coverage.

## **Features**

- ✅ **Multi-pod scheduling** — Support 1–10 pods with independent coverage profiles
- ✅ **Engineer preferences** — Soft (overridable) and hard (never-violated) constraints
- ✅ **Calendar views** — Weekly, monthly, yearly visualizations
- ✅ **Heat map** — Gap detection and severity visualization
- ✅ **Balance tracking** — Ensure fair shift distribution
- ✅ **PTO/Holiday management** — Preset regions (US, India, Singapore, UK) + custom dates
- ✅ **Location assignments** — 3-letter site codes with pod association
- ✅ **Timezone support** — EDT, PDT, SGT, BST, IST + custom offsets
- ✅ **Supabase Auth** — Email/password + magic link sign-in
- ✅ **AI Assistant** — Ask AI for scheduling insights

## **Tech Stack**

- **Frontend:** React 19, TypeScript, Tailwind CSS, Radix UI
- **Backend:** Node.js, Express, tRPC, Drizzle ORM
- **Database:** PostgreSQL (Supabase)
- **Storage:** Vercel Blob
- **Auth:** Supabase Auth (JWT)
- **Deployment:** Vercel

## **Getting Started**

### **Prerequisites**

- Node.js 18+
- pnpm (or npm/yarn)
- Supabase account
- Vercel account (for deployment)

### **Local Development**

1. **Clone the repository**
   ```bash
   git clone https://github.com/nickkyte-design/msp-resource-modeler.git
   cd msp-resource-modeler
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.local.example .env.local
   ```
   
   Fill in your Supabase credentials:
   - `VITE_SUPABASE_URL` — Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key (public)
   - `DATABASE_URL` — PostgreSQL connection string from Supabase
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (secret)

4. **Run migrations**
   ```bash
   pnpm db:push
   ```

5. **Start development server**
   ```bash
   pnpm dev
   ```

   The app will be available at `http://localhost:3000`

### **Build for Production**

```bash
pnpm build
pnpm start
```

## **Deployment to Vercel**

1. **Push to GitHub**
   ```bash
   git push origin feature/phase-1-supabase-migration
   ```

2. **Create Vercel project**
   - Go to https://vercel.com
   - Import your GitHub repository
   - Select the `feature/phase-1-supabase-migration` branch

3. **Add environment variables in Vercel**
   - `DATABASE_URL` — PostgreSQL connection string
   - `SUPABASE_URL` — Supabase project URL
   - `SUPABASE_ANON_KEY` — Supabase anon key
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key
   - `BLOB_READ_WRITE_TOKEN` — Vercel Blob token (optional for MVP)

4. **Deploy**
   - Vercel will automatically build and deploy on push

## **Architecture**

### **Database Schema**

- **users** — Supabase Auth users + account association
- **engineers** — Team members with preferences and timezone
- **settings** — Global app config (pod count, year, timezones)
- **shifts** — Generated on-call shifts
- **timeOff** — PTO and holiday records
- **podCoverage** — Per-pod coverage profiles (days/hours)
- **holidays** — Holiday registry with presets
- **locations** — Site codes and pod assignments

### **API Routes**

All routes use tRPC for end-to-end type safety.

- `/api/trpc/*` — tRPC procedures
- `/api/auth/logout` — Sign out endpoint

### **Multi-Tenancy**

Each record includes `accountId` for tenant isolation. The context extracts user from Supabase JWT and scopes all queries automatically.

## **Testing**

```bash
pnpm test
```

Run the full vitest suite (191 tests across scheduler, preferences, holidays, etc.).

## **Version**

Current: **3.0.0** (Supabase migration from Manus)

Previous: 2.9.0 (Manus-based)

## **License**

MIT
