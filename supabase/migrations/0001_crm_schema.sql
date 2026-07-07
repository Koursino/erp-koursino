-- CRM module schema (ERP step 1)
-- Companies and contacts are core entities shared with future modules
-- (stock: none; supplier payments: suppliers reuse companies via `is_supplier`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  industry    text,
  website     text,
  email       text,
  phone       text,
  address     text,
  city        text,
  country     text,
  is_customer boolean not null default true,
  is_supplier boolean not null default false, -- used by module 3 (supplier payments)
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------------
create table public.contacts (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  first_name text not null,
  last_name  text not null default '',
  role       text,
  email      text,
  phone      text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_company_id_idx on public.contacts(company_id);

-- ---------------------------------------------------------------------------
-- Deal stages (kanban columns)
-- ---------------------------------------------------------------------------
create table public.deal_stages (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  position int  not null,
  is_won   boolean not null default false,
  is_lost  boolean not null default false
);

insert into public.deal_stages (name, position, is_won, is_lost) values
  ('Lead',        1, false, false),
  ('Qualified',   2, false, false),
  ('Proposal',    3, false, false),
  ('Negotiation', 4, false, false),
  ('Won',         5, true,  false),
  ('Lost',        6, false, true);

-- ---------------------------------------------------------------------------
-- Deals (kanban cards)
-- ---------------------------------------------------------------------------
create table public.deals (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  company_id          uuid references public.companies(id) on delete set null,
  contact_id          uuid references public.contacts(id)  on delete set null,
  stage_id            uuid not null references public.deal_stages(id),
  value               numeric(12,2),
  currency            text not null default 'EUR',
  expected_close_date date,
  position            int not null default 0, -- ordering inside a kanban column
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index deals_stage_id_idx   on public.deals(stage_id);
create index deals_company_id_idx on public.deals(company_id);

-- ---------------------------------------------------------------------------
-- Activities (calls, emails, meetings, notes, tasks)
-- ---------------------------------------------------------------------------
create table public.activities (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('call', 'email', 'meeting', 'note', 'task')),
  subject    text not null,
  content    text,
  due_date   timestamptz,
  done       boolean not null default false,
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id)  on delete cascade,
  deal_id    uuid references public.deals(id)     on delete cascade,
  created_at timestamptz not null default now()
);

create index activities_deal_id_idx    on public.activities(deal_id);
create index activities_company_id_idx on public.activities(company_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();
create trigger deals_updated_at before update on public.deals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security: single-team MVP — any authenticated user has full access.
-- Tighten to role-based policies when multi-team access is needed.
-- ---------------------------------------------------------------------------
alter table public.companies   enable row level security;
alter table public.contacts    enable row level security;
alter table public.deal_stages enable row level security;
alter table public.deals       enable row level security;
alter table public.activities  enable row level security;

create policy "authenticated full access" on public.companies
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.contacts
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.deal_stages
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.deals
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.activities
  for all to authenticated using (true) with check (true);
