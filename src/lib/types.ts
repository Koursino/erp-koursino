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

// ---------------------------------------------------------------------------
// Sales orders (Commandes revendeurs) — step 1 skeleton, façon sale.order.
// ---------------------------------------------------------------------------

// Order lifecycle. DB stores snake_case ASCII; the UI shows French labels + a Badge tone.
export const ORDER_STATES = [
  { value: "brouillon", label: "Brouillon", tone: "zinc" },
  { value: "confirmee", label: "Confirmée", tone: "blue" },
  { value: "en_preparation", label: "En préparation", tone: "amber" },
  { value: "livree", label: "Livrée", tone: "blue" },
  { value: "facturee", label: "Facturée", tone: "amber" },
  { value: "payee", label: "Payée", tone: "green" },
  { value: "annulee", label: "Annulée", tone: "red" },
] as const;

export type OrderState = (typeof ORDER_STATES)[number]["value"];

// Allowed state transitions — no arbitrary jumps. Empty array = terminal state.
// Pure data, safe to import client-side (used to render only the permitted buttons).
export const TRANSITIONS: Record<OrderState, OrderState[]> = {
  brouillon: ["confirmee", "annulee"],
  confirmee: ["en_preparation", "annulee"],
  en_preparation: ["livree"],
  livree: ["facturee"],
  facturee: ["payee"],
  payee: [],
  annulee: [],
};

export type Order = {
  id: string;
  reference: string | null;
  company_id: string;
  deal_id: string | null;
  state: OrderState;
  order_date: string;
  notes: string | null;
  currency: string;
  // Maintained by the DB trigger — never write these from the app.
  readonly total_ht: number;
  readonly total_tva: number;
  readonly total_ttc: number;
  confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  companies?: Pick<Company, "id" | "name"> | null;
  deals?: Pick<Deal, "id" | "title"> | null;
};

export const DELIVERY_STATUSES = ["a_livrer", "partiel", "livre"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

// States from which a delivery note (bon de livraison) can be issued: the goods
// have shipped, so invoicing/payment afterwards does not remove the BL.
export const BL_ELIGIBLE_STATES: OrderState[] = ["livree", "facturee", "payee"];

export type OrderLine = {
  id: string;
  order_id: string;
  product_id: string;
  description: string;
  unit_price_ht: number;
  vat_rate: number;
  quantity: number;
  discount_percent: number;
  // Generated column (round(quantity * unit_price_ht * (1 - discount/100), 2)) — read-only.
  readonly subtotal_ht: number;
  position: number;
  qty_delivered: number;
  delivery_status: DeliveryStatus;
  created_at: string;
  updated_at: string;
};

// --- Purchasing module (Achats) — supplier catalog -------------------------
// What a supplier sells TO us (purchase side), layered on the shared products table.

export type SupplierCatalogEntry = {
  id: string;
  supplier_id: string;
  product_id: string;
  supplier_ref: string | null;
  unit_price: number | null;
  currency: string;
  lead_time_days: number | null;
  min_order_qty: number;
  is_preferred: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  products?: Pick<Product, "id" | "name" | "sku" | "unit"> | null;
  companies?: Pick<Company, "id" | "name"> | null;
};

// --- Purchasing module (Achats) — Phase B: purchase orders -----------------

export const PURCHASE_ORDER_STATUSES = [
  { key: "draft", label: "Brouillon", kind: "open" },
  { key: "rfq_sent", label: "Demande de devis", kind: "open" },
  { key: "quote_received", label: "Devis reçu", kind: "open" },
  { key: "confirmed", label: "Confirmé", kind: "open" },
  { key: "ordered", label: "Commandé", kind: "open" },
  { key: "received", label: "Réceptionné", kind: "done" },
  { key: "invoiced", label: "Facturé", kind: "done" },
  { key: "paid", label: "Payé", kind: "done" },
  { key: "cancelled", label: "Annulé", kind: "cancelled" },
] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number]["key"];

export const purchaseOrderStatusLabel = (key: string): string =>
  PURCHASE_ORDER_STATUSES.find((s) => s.key === key)?.label ?? key;

export type PurchaseOrder = {
  id: string;
  reference: string | null;
  supplier_id: string | null;
  status: PurchaseOrderStatus;
  currency: string;
  order_date: string | null;
  expected_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  companies?: Pick<Company, "id" | "name"> | null;
  purchase_order_lines?: PurchaseOrderLine[];
};

export type PurchaseOrderLine = {
  id: string;
  purchase_order_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  position: number;
  created_at: string;
};
