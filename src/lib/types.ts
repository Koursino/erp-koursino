export type Company = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  is_customer: boolean;
  is_supplier: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  companies?: Pick<Company, "id" | "name"> | null;
};

export type DealStage = {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

export type Deal = {
  id: string;
  title: string;
  company_id: string | null;
  contact_id: string | null;
  stage_id: string;
  value: number | null;
  currency: string;
  expected_close_date: string | null;
  position: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  companies?: Pick<Company, "id" | "name"> | null;
};

export const ACTIVITY_TYPES = ["call", "email", "meeting", "note", "task"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type Activity = {
  id: string;
  type: ActivityType;
  subject: string;
  content: string | null;
  due_date: string | null;
  done: boolean;
  company_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  created_at: string;
  companies?: Pick<Company, "id" | "name"> | null;
  deals?: Pick<Deal, "id" | "title"> | null;
};

// Product families (Catalogue Produits).
// Managed as a fixed list in code (the DB column stays plain `text`, so editing this
// list needs no migration). Drives the form category select and the list filter.
export const PRODUCT_CATEGORIES = ["Chaises", "Tables"] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  photo_url: string | null;
  unit_price_ht: number;
  vat_rate: number;
  // Computed by Postgres (generated column) — never write it from the app.
  readonly unit_price_ttc: number;
  unit: string;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
