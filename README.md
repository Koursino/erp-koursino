# Koursino ERP

MVP ERP built step by step. See `docs/adr-001-tech-stack.md` for the stack and cost decisions.

| Step | Module | Status |
|---|---|---|
| 1 | **CRM** — companies, contacts, kanban sales pipeline, activities | ✅ |
| — | **Catalogue Produits** — products catalog (shared by Achats, Ventes, Stock) | ✅ |
| Achats A | **Catalogue fournisseur** — supplier catalog (purchase price, lead time, min qty) — see `docs/adr-002-purchasing-module.md` | ✅ |
| Achats B | **Bons de commande** — purchase orders (statuts + kanban + PDF) | ✅ |
| Ventes 1 | **Commandes revendeurs** — sales orders (lifecycle, auto totals, numbering, BL PDF) | ✅ |
| 2 | **Stock** — warehouses, attributes & SKU, ledger, receptions, transfers, deliveries | ✅ |
| 2b | **Livraisons** — numbered delivery notes (`001-DB/2026`), drivers, BL PDF | ✅ |
| 3 | Supplier payments | planned |

## Stock module

The stock layer (migrations `0006`–`0009`) is additive on top of the
commercial schema (products in MAD with VAT, purchase orders `BC-…`, customer
orders `KRS-…`); nothing pre-existing was rewritten.

**Article codification.** Legacy articles keep their hand-made SKU (`AR-1`,
`BR-AV`, …). Assigning a **supplier** to an article switches it to the
structured code, built by the database and rebuilt automatically when
attributes change:

```
SUPPLIER / MODEL / <attribute codes> / SEQUENCE      LY/CHAISE-AURA/NOIR/0001
```

The supplier fragment is the company `code` (or the first 6 letters of its
name) and the sequence is a running number per supplier.

**Attributes** are user-managed (`/stock/attributes`). Catégorie, Couleur and
Matière ship as defaults — colour feeds the SKU, material is descriptive, and
the category is mirrored onto `products.category` by the database — and you can
add, rename, reorder or delete attributes and their allowed values.

An attribute declares how many values an article may carry (`max_values`).
Couleur accepts two: one value is a plain colour, two make a **bicolour**
article whose SKU segment reads `NOIR-BLC`.

**A colour is an article.** On a reference, "Couleurs" lists the colours being
sold; ticking one creates the matching article (its own SKU, price and stock
level), unticking one deactivates it without touching its history. Variants of
a reference share a `variant_group_id` and are grouped together in the
catalogue.

**Stock is always counted per warehouse**, and only ever changes through four
paths:

| Path | Effect | Function |
|---|---|---|
| Purchase order received | + destination warehouse | `receive_purchase_order` |
| Transfer executed | − source, + destination | `execute_stock_transfer` |
| Manual entry | ± one warehouse (**note required**) | `adjust_stock` |
| Customer order delivered (full or partial) | − source warehouse | `deliver_order` |

Cancelling a delivery puts the goods back with `return` movements
(`return_order_delivery`). Creating or confirming a document never moves
stock. `stock_movements` is an append-only ledger and the single source of
truth; `stock_levels` is a cache maintained by trigger, and stock can never go
negative.

## Delivery notes

Delivering an order and executing a transfer both open a **bon de livraison**
and require a driver (`/stock/drivers`). One yearly counter numbers them all,
restarting at `001` each January:

```
001-DB/2026       1st delivery of 2026, shipped from warehouse DB
002-US-DB/2026    2nd delivery of 2026, moved from US to DB
```

Each movement carries its `delivery_id`, so the printed BL lists what actually
shipped — a partial delivery prints its own quantities, not the ordered ones.

## Stack

Next.js (App Router, TypeScript) · Supabase (PostgreSQL + Auth) · Tailwind CSS · Netlify

## Getting started

1. **Create a Supabase project** (in the Koursino Supabase account).
2. **Apply the schema**: run the migrations in `supabase/migrations/` in
   filename order (`0001` → `0012`). `0002` also creates a public Storage
   bucket `product-photos`; if the SQL editor refuses to create the
   `storage.objects` policies, create that bucket and its policies from the
   Storage UI.
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
src/app/(app)/         Authenticated app pages (dashboard, pipeline, catalogue, stock, …)
src/app/login/         Sign-in page
src/lib/supabase/      Supabase client helpers (browser / server / config)
src/components/ui.tsx  Shared UI primitives
docs/                  Architecture decision records
```
