# ADR-001: Technology stack for the Koursino ERP MVP

- **Status:** Accepted
- **Date:** 2026-07-07
- **Decision maker:** CEO, Koursino

## Context

Koursino needs a first version of its ERP covering three modules, delivered step by step:

1. **CRM** (first)
2. **Stock management**
3. **Supplier payments**

Constraints: minimal running cost, small team, fast iteration, and a foundation
that will not need re-architecting when modules 2 and 3 are added.

## Decision

Build a **modular monolith** web application:

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js (React) + TypeScript** | One codebase for UI and API; largest talent pool; excellent tooling. |
| Database & backend services | **Supabase (PostgreSQL)** | Managed Postgres + authentication + row-level security + file storage out of the box. Relational integrity is essential for stock and payments. |
| UI | **Tailwind CSS + shadcn/ui** | Professional admin UI (tables, forms, dashboards) at zero cost. |
| Hosting | **Netlify** | Git-based deploys; free tier permits commercial use. |
| Transactional email | **Brevo** | Free tier (300 emails/day) covers MVP needs. |

Each ERP module lives as a folder/domain inside the single app. Core entities
shared across modules (companies, contacts, products, currency amounts) are
designed once in the database schema so CRM, stock, and payments compose
rather than duplicate.

## Cost

| Item | Launch | Growth |
|---|---|---|
| Supabase | Free (500 MB DB) | $25/mo Pro |
| Netlify | Free | Free–$19/mo |
| Brevo | Free | Free–$9/mo |
| Domain | ~$12/yr | ~$12/yr |
| **Total** | **~$1/mo** | **~$26–54/mo** |

Note: the Supabase free tier pauses projects after ~1 week of inactivity;
upgrade to Pro when the ERP is in daily production use.

## Alternatives considered

- **Off-the-shelf open-source ERP (Odoo Community, ERPNext):** faster to a
  working system if processes are standard; rejected in favor of a custom
  build to keep workflows tailored to Koursino and the platform fully owned.
- **Microservices:** rejected as premature — higher cost and operational
  complexity with no benefit at MVP scale.
- **NoSQL database:** rejected — ERP data (stock levels, supplier balances,
  deal pipelines) is inherently relational and needs transactional integrity.

## Module roadmap

1. **CRM (step 1):** companies & contacts, sales pipeline (leads → deals with
   stages and values), activity log (calls, emails, notes, reminders).
2. **Stock management (step 2):** products, warehouses/locations, stock
   movements, low-stock alerts.
3. **Supplier payments (step 3):** suppliers (reuses the company entity),
   purchase invoices, payment schedule and status, due-date reminders.
