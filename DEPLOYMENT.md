# Deployment Guide — Team Rota + Supabase + Vercel

## **Prerequisites**

✅ You have:
- Supabase project (`vkxryacaewoqgiilvtst`)
- Supabase connection string (DATABASE_URL)
- Supabase anon key (VITE_SUPABASE_ANON_KEY)
- Supabase service role key (SUPABASE_SERVICE_ROLE_KEY)
- Vercel account linked to GitHub
- GitHub repo `nickkyte-design/msp-resource-modeler`

## **Step 1: Prepare Local Environment**

1. **Check out the migration branch**
   ```bash
   git fetch origin
   git checkout feature/phase-1-supabase-migration
   ```

2. **Copy environment template**
   ```bash
   cp .env.local.example .env.local
   ```

3. **Fill in your Supabase credentials in `.env.local`**
   ```
   VITE_SUPABASE_URL=https://vkxryacaewoqgiilvtst.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   DATABASE_URL=postgresql://postgres:glCxwHP33yRaQKYy@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

4. **Install dependencies**
   ```bash
   pnpm install
   ```

## **Step 2: Test Locally**

1. **Generate Drizzle migrations**
   ```bash
   pnpm db:push
   ```
   This creates tables in your Supabase PostgreSQL database.

2. **Run the dev server**
   ```bash
   pnpm dev
   ```

3. **Test login flow**
   - Open `http://localhost:3000`
   - You should see a login page
   - Try creating an account with email/password
   - Magic link option should also appear

4. **Run build test** (in another terminal)
   ```bash
   pnpm build
   ```
   Should complete without errors.

## **Step 3: Deploy to Vercel**

1. **Push branch to GitHub**
   ```bash
   git push origin feature/phase-1-supabase-migration
   ```

2. **Go to Vercel dashboard**
   - https://vercel.com/dashboard
   - Click "Add New..." → "Project"
   - Import `nickkyte-design/msp-resource-modeler` from GitHub
   - Select branch: `feature/phase-1-supabase-migration`
   - Click "Import"

3. **Configure environment variables in Vercel**
   - In the project settings, go to "Environment Variables"
   - Add these secrets:
     ```
     DATABASE_URL = postgresql://postgres:glCxwHP33yRaQKYy@aws-0-us-east-1.pooler.supabase.com:6543/postgres
     SUPABASE_URL = https://vkxryacaewoqgiilvtst.supabase.co
     SUPABASE_ANON_KEY = your-anon-key
     SUPABASE_SERVICE_ROLE_KEY = your-service-role-key
     BLOB_READ_WRITE_TOKEN = (optional, for file storage)
     ```

4. **Deploy**
   - Vercel will automatically build and deploy
   - Build should complete in ~2-3 minutes
   - Once complete, you'll get a Vercel URL

5. **Set up custom domain**
   - In Vercel project settings, go to "Domains"
   - Add domain: `team-rota.dev`
   - Update your DNS records to point to Vercel
   - Typically a CNAME or A record

## **Step 4: Test Production**

1. **Visit your deployed URL**
   - https://team-rota.dev (or your Vercel URL)
   - Should load the login page

2. **Create an account**
   - Sign up with email/password
   - Should create user in Supabase Auth

3. **Access the app**
   - After login, you should see the Calendar page
   - Settings should load with default values
   - Seed data (12 engineers) should populate on first load

## **Troubleshooting**

### **Build fails with "DATABASE_URL is required"**
- Make sure `DATABASE_URL` is set in Vercel environment variables
- Rebuild: go to Vercel project → "Deployments" → redeploy

### **Login page doesn't appear**
- Check browser console for errors
- Verify `SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct
- Check that Supabase project is active

### **Database tables don't exist**
- Run migrations locally first: `pnpm db:push`
- Or connect to Supabase directly and run migration SQL manually

### **"Unauthorized" or JWT errors**
- Verify `SUPABASE_SERVICE_ROLE_KEY` matches your Supabase service role
- Check that Supabase Auth is enabled in your project

## **Next Steps**

Once deployed:

1. **Invite team members** — Share the URL and have them sign up
2. **Add engineers** — Go to Settings → Roster to add your team
3. **Configure pods** — Set up coverage profiles and pod assignments
4. **Generate schedule** — Click "Generate Schedule" to create shifts
5. **Monitor gaps** — Use Gap Report to identify coverage issues

## **Reverting to Main**

If you need to go back to the original (Manus-based) version:

```bash
git checkout main
git push origin main  # Deploy main branch on Vercel
```

Vercel will automatically redeploy the main branch.
