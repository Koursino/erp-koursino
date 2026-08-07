export type Company = {
  id: string;
  name: string;
  code: string | null;
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

// ---------------------------------------------------------------------------
// Products (Catalogue Produits) — shared by Achats, Ventes and Stock.
// ---------------------------------------------------------------------------

// Product families used to be a fixed list in code. Since migration 0010 they
// are the values of the CATEGORY attribute, editable on /stock/attributes;
// `products.category` is the denormalized mirror the database maintains.
export const CATEGORY_ATTRIBUTE_CODE = "CATEGORY";
/** Colour is the attribute that feeds the SKU and drives the variants of a reference. */
export const COLOR_ATTRIBUTE_CODE = "COLOR";

export type Product = {
  id: string;
  /** Legacy hand-made code (AR-1) or generated SUPPLIER/MODEL/…/SEQ. */
  sku: string;
  name: string;
  description: string | null;
  // Mirror of the CATEGORY attribute, maintained by the DB since 0010 — write
  // the attribute value, never this column.
  readonly category: string | null;
  photo_url: string | null;
  unit_price_ht: number;
  vat_rate: number;
  // Computed by Postgres (generated column) — never write it from the app.
  readonly unit_price_ttc: number;
  unit: string;
  currency: string;
  is_active: boolean;
  // Stock layer (migrations 0006+). While supplier_id is null the article
  // keeps its legacy SKU; setting it switches to the generated code.
  supplier_id: string | null;
  model: string | null;
  model_code: string | null;
  seq: number | null;
  attributes_summary: string | null;
  barcode: string | null;
  purchase_price: number | null;
  min_stock: number;
  notes: string | null;
  /** Articles sharing this id are colour variants of one commercial reference (0011). */
  variant_group_id: string | null;
  created_at: string;
  updated_at: string;
  companies?: Pick<Company, "id" | "name" | "code"> | null;
  product_values?: ProductValue[];
};

export type ProductRef = Pick<Product, "id" | "sku" | "name" | "attributes_summary">;

/** Display label for an article: "CHAISE AURA · Noir". */
export const productLabel = (p: Pick<Product, "name" | "attributes_summary">) =>
  p.attributes_summary ? `${p.name} · ${p.attributes_summary}` : p.name;

// ---------------------------------------------------------------------------
// Stock — warehouses, article attributes, ledger (migrations 0006+)
// ---------------------------------------------------------------------------

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** A user-managed article characteristic (colour, material, size, …). */
export type ProductAttribute = {
  id: string;
  code: string;
  name: string;
  position: number;
  /** When true, the chosen value's code becomes a segment of the SKU. */
  in_sku: boolean;
  /** When false, the attribute stays out of the variant label (case of CATEGORY). */
  in_summary: boolean;
  /** Values an article may carry: 1 for a plain attribute, 2 for COLOR (bicolour). */
  max_values: number;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_attribute_values?: ProductAttributeValue[];
};

export type ProductAttributeValue = {
  id: string;
  attribute_id: string;
  label: string;
  /** Short fragment used inside the SKU, e.g. "NOIR". */
  code: string;
  position: number;
  created_at: string;
};

/** One attribute value assigned to one article. */
export type ProductValue = {
  product_id: string;
  attribute_id: string;
  value_id: string;
};

export type StockLevel = {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  updated_at: string;
  products?: Product | null;
  warehouses?: Pick<Warehouse, "id" | "code" | "name"> | null;
};

// ---------------------------------------------------------------------------
// Livraisons — bons de livraison numérotés et livreurs (migration 0012)
// ---------------------------------------------------------------------------

export type Driver = {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const DELIVERY_KINDS = ["customer", "transfer"] as const;
export type DeliveryKind = (typeof DELIVERY_KINDS)[number];

export const DELIVERY_KIND_LABEL: Record<DeliveryKind, string> = {
  customer: "Livraison client",
  transfer: "Transfert",
};

export type DeliveryNote = {
  id: string;
  /** 001-DB/2026 for a customer delivery, 002-US-DB/2026 for a transfer. */
  readonly reference: string;
  kind: DeliveryKind;
  order_id: string | null;
  transfer_id: string | null;
  from_warehouse_id: string;
  to_warehouse_id: string | null;
  driver_id: string;
  delivered_at: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
  drivers?: Pick<Driver, "id" | "name" | "phone"> | null;
  from_warehouse?: Pick<Warehouse, "id" | "code" | "name"> | null;
  to_warehouse?: Pick<Warehouse, "id" | "code" | "name"> | null;
  orders?: Pick<Order, "id" | "reference" | "company_id"> | null;
  stock_transfers?: Pick<StockTransfer, "id" | "reference"> | null;
};

export const MOVEMENT_REASONS = [
  "reception",
  "delivery",
  "transfer_in",
  "transfer_out",
  "adjustment",
  "return",
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

export type StockMovement = {
  id: string;
  product_id: string;
  warehouse_id: string;
  /** Signed: positive enters the warehouse, negative leaves it. */
  quantity: number;
  reason: MovementReason;
  purchase_order_id: string | null;
  order_id: string | null;
  /** The bon de livraison this movement belongs to; null for receptions, adjustments and returns. */
  delivery_id: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  products?: ProductRef | null;
  warehouses?: Pick<Warehouse, "id" | "code" | "name"> | null;
};

// ---------------------------------------------------------------------------
// Purchasing module (Achats) — supplier catalog
// What a supplier sells TO us (purchase side), layered on the shared products.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Purchasing module (Achats) — Phase B: purchase orders (BC-YYYY-NNNN)
// ---------------------------------------------------------------------------

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

/** Statuses from which the goods can still be received into a warehouse. */
export const PO_RECEIVABLE_STATUSES: PurchaseOrderStatus[] = [
  "draft",
  "rfq_sent",
  "quote_received",
  "confirmed",
  "ordered",
];

export type PurchaseOrder = {
  id: string;
  reference: string | null;
  supplier_id: string | null;
  /** Destination warehouse for the reception (stock layer). */
  warehouse_id: string | null;
  status: PurchaseOrderStatus;
  currency: string;
  order_date: string | null;
  expected_date: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  companies?: Pick<Company, "id" | "name"> | null;
  warehouses?: Pick<Warehouse, "id" | "code" | "name"> | null;
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
  products?: ProductRef | null;
};

// ---------------------------------------------------------------------------
// Sales orders (Commandes revendeurs) — KRS-YYYY-NNNNN, façon sale.order.
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

export const ORDER_STATE_LABEL: Record<OrderState, string> = Object.fromEntries(
  ORDER_STATES.map((s) => [s.value, s.label])
) as Record<OrderState, string>;

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

export const DELIVERY_STATUSES = ["a_livrer", "partiel", "livre"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

// States from which a delivery note (bon de livraison) can be issued: the goods
// have shipped, so invoicing/payment afterwards does not remove the BL.
export const BL_ELIGIBLE_STATES: OrderState[] = ["livree", "facturee", "payee"];

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
  /** Source warehouse for deliveries (stock layer). */
  warehouse_id: string | null;
  delivered_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  companies?: Pick<Company, "id" | "name"> | null;
  deals?: Pick<Deal, "id" | "title"> | null;
  warehouses?: Pick<Warehouse, "id" | "code" | "name"> | null;
  order_lines?: OrderLine[];
};

/** Lines are editable only while the order is a draft. */
export const isOrderEditable = (o: Pick<Order, "state">) => o.state === "brouillon";

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
  products?: ProductRef | null;
};

// ---------------------------------------------------------------------------
// Transfers between warehouses (stock layer)
// ---------------------------------------------------------------------------

export const TRANSFER_STATUSES = ["draft", "done", "cancelled"] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export type StockTransferLine = {
  id: string;
  transfer_id: string;
  product_id: string;
  quantity: number;
  products?: ProductRef | null;
};

export type StockTransfer = {
  id: string;
  reference: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: TransferStatus;
  transfer_date: string;
  executed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  from_warehouse?: Pick<Warehouse, "id" | "code" | "name"> | null;
  to_warehouse?: Pick<Warehouse, "id" | "code" | "name"> | null;
  stock_transfer_lines?: StockTransferLine[];
};

/** One warehouse row inside a split line (kept for the shared line editor). */
export type LineAllocationInput = {
  warehouse_id: string;
  quantity: number;
};

/** A line as posted from a multi-line document form. */
export type OrderLineInput = {
  product_id: string;
  quantity: number;
  unit_price?: number | null;
  allocations?: LineAllocationInput[];
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
