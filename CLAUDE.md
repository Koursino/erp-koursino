# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # next dev
npm run build          # next build (also the Netlify build command)
npm run lint           # eslint (flat config, next core-web-vitals + typescript)
npx tsc --noEmit       # typecheck — do this before claiming a change compiles
```

There is no test suite and no test runner in this project. Verification means
`npx tsc --noEmit` + `npm run build`, and — for anything touching SQL — running
the migration against a scratch Postgres (see *Migrations* below). Building the
app proves nothing about the SQL.

## Architecture

Next.js 16 App Router + TypeScript, Supabase (Postgres + Auth + Storage),
Tailwind v4, deployed on Netlify. Modular monolith: one folder per ERP module
under `src/app/(app)/`. See `docs/adr-001-tech-stack.md` and
`docs/adr-002-purchasing-module.md` for the decisions behind the stack and the
purchasing state machine.

### The database holds the business logic

This is the single most important thing to understand. Postgres — not the
TypeScript — owns document numbering, totals, SKU generation and every stock
movement. The app reads and calls; it does not compute.

Never write these from the app (triggers / generated columns own them):
`orders.total_ht/total_tva/total_ttc`, `order_lines.subtotal_ht`,
`products.unit_price_ttc`, `products.sku` / `attributes_summary` / `seq`,
`products.category` (mirror of the CATEGORY attribute since 0010),
`stock_levels.quantity`, `purchase_orders.reference`, `orders.reference`
(auto since 0009), `delivery_notes.reference` (0012). `src/lib/types.ts` marks
the read-only ones `readonly` — respect that marker.

Stock changes through exactly four RPCs (plus one undo), never through direct
writes to `stock_levels`:

| Path | RPC |
|---|---|
| Purchase order received into a warehouse | `receive_purchase_order` |
| Transfer executed between warehouses | `execute_stock_transfer` |
| Manual entry (note mandatory) | `adjust_stock` |
| Customer order delivered, full or partial | `deliver_order` |
| Cancel a delivery (writes `return` movements) | `return_order_delivery` |

`deliver_order` and `execute_stock_transfer` both take a mandatory
`p_driver_id` since 0012: they open a `delivery_notes` row first, then stamp
every movement with its `delivery_id` — the ledger is append-only, so a
movement can never be attached to a BL after the fact. Delivery notes share one
yearly counter, `001-DB/2026` for a customer shipment and `002-US-DB/2026` for a
transfer.

`stock_movements` is an append-only ledger and the source of truth;
`stock_levels` is a trigger-maintained cache; quantities can never go negative.
Creating or confirming a document never moves stock.

### Page / action pattern

Every module folder follows the same shape:

- `page.tsx` — async Server Component, `export const dynamic = "force-dynamic"`,
  reads Supabase directly with `createClient()` from `@/lib/supabase/server`,
  and renders `<SetupNotice />` when that returns `null`.
- `actions.ts` — `"use server"`, mutations that return `{ error: string | null }`
  (never throw), then `revalidatePath()` every affected route.
- `*-form.tsx` / `*-kanban.tsx` — `"use client"`, drives actions with
  `useTransition` and renders the returned `error` inline. Forms are overlays
  opened from a button, not separate routes.

`createClient()` on the server returns **null** when Supabase env vars are
missing — this is deliberate "setup mode" (see below), so every call site must
handle it.

### Auth and setup mode

`src/middleware.ts` refreshes the Supabase session and redirects
unauthenticated users to `/login`. Sign-ups are closed; users are provisioned
from the Supabase dashboard. RLS is uniformly
`for all to authenticated using (true)` — authentication is the boundary, there
is no per-row tenancy.

Without `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(`isSupabaseConfigured()` in `src/lib/supabase/config.ts`), middleware skips the
auth wall and pages render setup instructions instead of data. Keep new pages
compatible with that mode.

### PDFs

There is no PDF library. Every printable document is a normal route under
`src/app/print/` styled for A4, and the user does Print → Save as PDF via
`<PrintButton />`. Screens link to them with `<ExportPdfLink />`
(`target="_blank"`). Report routes reuse the filter helpers in
`src/lib/reports.ts` so a printed report can never show rows the screen hides.

### Shared helpers worth knowing before writing new code

- `src/lib/types.ts` — hand-written domain types **and** the state machines
  (`TRANSITIONS` for orders, `PURCHASE_ORDER_STATUSES`). Not generated from the
  DB; keep it in sync manually. Pure data, safe to import client-side.
- Attributes are multi-valued since 0010: `product_values` is keyed on
  (product, attribute, **value**) and `product_attributes.max_values` caps how
  many an article may hold — 2 for COLOR, which is how "bicolore" is modelled.
  `in_summary` keeps a classifying attribute (CATEGORY) out of the variant
  label. A colour is a stockable article; variants of one reference share
  `products.variant_group_id`.
- `src/lib/form.ts` — `str`/`num`/`int` FormData readers and `parseOrderLines`,
  which merges duplicate products and derives a line's quantity from its
  per-warehouse allocations (never from a typed total).
- `src/lib/format.ts` — `formatDhs` (MAD, `1 234,50 Dhs`), `fmtDate` (fr-FR),
  `statusTone` for `<Badge>`. Use these rather than new `Intl` instances.
- `src/lib/product-colors.ts` — colour is an *attribute*, not a column;
  resolving it takes three flat queries joined in JS because `product_values`
  references `product_attribute_values` through a composite FK that PostgREST
  cannot embed.
- `src/components/ui.tsx` — the whole UI kit (`PageHeader`, `Card`, `Badge`,
  `Input`, `Button`, `EmptyState`, `SetupNotice`). No shadcn/ui despite ADR-001.
- `src/components/view-toggle.tsx` — `?view=kanban|list` switch shared by the
  status boards; the list views sort in JS over rows already loaded.

PostgREST caps responses at 1000 rows; list/report queries that can exceed that
pass an explicit `.range(0, N-1)` (see `REPORT_ROW_LIMIT`).

## Migrations — read this before touching SQL

The live Supabase project holds **real production data** and its schema was
built by hand outside this repo. Migrations `0002`–`0005` describe tables that
already existed and were applied manually; only `0006`–`0009` (the stock layer)
are tracked in Supabase's migration history.

Consequences:

- Never write a greenfield `create table` migration for an existing entity.
  Inspect the live schema first (`list_tables` via the Supabase MCP) and write
  the migration **additively** — `0006` is the model to copy.
- Never run `apply_migration` against production without confirming with the
  user first.
- Validate SQL on a scratch local Postgres (Homebrew PG 17) before delivering
  it. It needs an `authenticated` role plus Supabase shims: schema `auth` with
  an `auth.uid()` returning null **and** a table `auth.users` (0005 references
  it), and schema `storage` with `buckets` / `objects` (0002 seeds a bucket).
  Without `auth.users`, migration 0005 fails and every later file collapses
  with "relation public.orders does not exist" — which looks like a bug in the
  migration you just wrote. `initdb` needs `LC_ALL=C --locale=C`, and the
  server must listen on TCP (`127.0.0.1:55432`) because the scratchpad path
  exceeds the Unix socket length limit.
- Gotcha already paid for once: `INSERT … ON CONFLICT DO UPDATE` evaluates
  CHECK constraints on the *proposed* row before conflict resolution — that
  broke every outgoing stock movement until `0008` switched to update-first.

## Conventions

- The catalogue is one screen: `/products`. `/stock/products` is a redirect —
  do not reintroduce a second product form.
- **UI language is French, code is English.** Labels, statuses and messages
  shown to users are French (`Brouillon`, `Réceptionné`, `Sélectionnez le
  revendeur.`); identifiers, comments and commit messages are English. Some
  older stock screens still show English labels — match the surrounding file.
- DB stores ASCII snake_case states (`en_preparation`, `quote_received`); the
  French label lives in `src/lib/types.ts` next to the value.
- Document references: purchase orders `BC-YYYY-NNNN`, customer orders
  `KRS-YYYY-NNNNN`, delivery notes `NNN-<warehouse>/YYYY` (or
  `NNN-<from>-<to>/YYYY` for a transfer). The older `BL-<order reference>` page
  survives only as a fallback for orders delivered before 0012.
- Money is MAD throughout; `products.unit_price_ht` is the **sale** price,
  `supplier_catalog.unit_price` the **purchase** price.
- Article SKU: legacy hand-made codes (`AR-1`) are preserved and only switch to
  the generated `SUPPLIER/MODEL/ATTRS/SEQ` form once `products.supplier_id` is
  set. Don't rewrite existing SKUs.
- Product photos go to the public `product-photos` Storage bucket through a
  Server Action; `next.config.ts` raises the Server Action body limit to 4 MB
  for it.
