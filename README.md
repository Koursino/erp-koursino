# Koursino ERP

MVP ERP built step by step. See `docs/adr-001-tech-stack.md` for the stack and cost decisions.

| Step | Module | Status |
|---|---|---|
| 1 | **CRM** — companies, contacts, kanban sales pipeline, activities | ✅ this codebase |
| 2 | Stock management (incl. kanban restock view) | planned |
| 3 | Supplier payments | planned |

## Stack

Next.js (App Router, TypeScript) · Supabase (PostgreSQL + Auth) · Tailwind CSS · Netlify

## Getting started

1. **Create a Supabase project** (in the Koursino Supabase account).
2. **Apply the schema**: open the Supabase SQL editor and run
   `supabase/migrations/0001_crm_schema.sql`.
3. **Configure the app**:
   ```bash
   cp .env.example .env.local
   # fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
   # (Supabase dashboard -> Project Settings -> API)
   ```
4. **Create a user**: Supabase dashboard → Authentication → Users → Add user
   (email + password). Sign-ups are not open — users are provisioned by the admin.
5. **Run it**:
   ```bash
   npm install
   npm run dev
   ```
   Without `.env.local` the app runs in setup mode and shows these instructions
   instead of data.

## Deploying (Netlify)

Connect the GitHub repo to Netlify, set the two `NEXT_PUBLIC_SUPABASE_*`
environment variables in the site settings, and deploy. The default Next.js
build settings work as-is.

## Project layout

```
supabase/migrations/   SQL schema, one file per migration
src/app/(app)/         Authenticated app pages (dashboard, pipeline, companies, …)
src/app/login/         Sign-in page
src/lib/supabase/      Supabase client helpers (browser / server / config)
src/components/ui.tsx  Shared UI primitives
docs/                  Architecture decision records
```
