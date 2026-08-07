import { fmtDate } from "@/lib/format";
import {
  ORDER_STATES,
  purchaseOrderStatusLabel,
  type Product,
  type Warehouse,
} from "@/lib/types";

// Filtering rules shared by each "état" screen and its printable report, so a
// PDF can never list rows the screen hides (or vice versa).

// PostgREST caps responses at 1000 rows by default. Reports ask for more
// explicitly and say so in the footer when the ceiling is reached, rather than
// truncating a printed document silently.
export const REPORT_ROW_LIMIT = 5000;

// ---------------------------------------------------------------------------
// État des ventes clients (/orders)
// ---------------------------------------------------------------------------

export type SalesFilters = { state: string; company: string; from: string; to: string };

export function parseSalesFilters(sp: {
  state?: string;
  company?: string;
  from?: string;
  to?: string;
}): SalesFilters {
  return {
    state: sp.state ?? "",
    company: sp.company ?? "",
    from: sp.from ?? "",
    to: sp.to ?? "",
  };
}

/**
 * The .eq/.gte/.lte chain, applied identically on screen and in the report.
 * Kept generic and unconstrained: constraining Q to the PostgREST builder shape
 * makes TypeScript unify the whole filter-builder type graph (TS2589).
 */
export function applySalesFilters<Q>(query: Q, f: SalesFilters): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  if (f.state) q = q.eq("state", f.state);
  if (f.company) q = q.eq("company_id", f.company);
  if (f.from) q = q.gte("order_date", f.from);
  if (f.to) q = q.lte("order_date", f.to);
  return q as Q;
}

/** Query string carrying the filters (never the page — a report covers them all). */
export function salesFilterQuery(f: SalesFilters): string {
  const params = new URLSearchParams();
  if (f.state) params.set("state", f.state);
  if (f.company) params.set("company", f.company);
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  return params.toString();
}

export const hasSalesFilters = (f: SalesFilters) =>
  Boolean(f.state || f.company || f.from || f.to);

/** Human-readable criteria, printed in the report header. */
export function describeSalesFilters(f: SalesFilters, companyName?: string): string[] {
  const lines: string[] = [];
  if (f.state) {
    lines.push(`Statut : ${ORDER_STATES.find((s) => s.value === f.state)?.label ?? f.state}`);
  }
  if (f.company) lines.push(`Revendeur : ${companyName ?? f.company}`);
  if (f.from || f.to) {
    lines.push(`Période : ${f.from ? fmtDate(f.from) : "…"} → ${f.to ? fmtDate(f.to) : "…"}`);
  }
  return lines.length ? lines : ["Aucun filtre — toutes les commandes"];
}

// ---------------------------------------------------------------------------
// État des achats (/purchase-orders)
// ---------------------------------------------------------------------------

export type PurchaseFilters = { status: string; supplier: string; from: string; to: string };

export function parsePurchaseFilters(sp: {
  status?: string;
  supplier?: string;
  from?: string;
  to?: string;
}): PurchaseFilters {
  return {
    status: sp.status ?? "",
    supplier: sp.supplier ?? "",
    from: sp.from ?? "",
    to: sp.to ?? "",
  };
}

/** Same rules on the kanban, the list and the printed report. See applySalesFilters. */
export function applyPurchaseFilters<Q>(query: Q, f: PurchaseFilters): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  if (f.status) q = q.eq("status", f.status);
  if (f.supplier) q = q.eq("supplier_id", f.supplier);
  if (f.from) q = q.gte("order_date", f.from);
  if (f.to) q = q.lte("order_date", f.to);
  return q as Q;
}

export function purchaseFilterQuery(f: PurchaseFilters): string {
  const params = new URLSearchParams();
  if (f.status) params.set("status", f.status);
  if (f.supplier) params.set("supplier", f.supplier);
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  return params.toString();
}

export const hasPurchaseFilters = (f: PurchaseFilters) =>
  Boolean(f.status || f.supplier || f.from || f.to);

/** Human-readable criteria, printed in the report header. */
export function describePurchaseFilters(f: PurchaseFilters, supplierName?: string): string[] {
  const lines: string[] = [];
  if (f.status) lines.push(`Statut : ${purchaseOrderStatusLabel(f.status)}`);
  if (f.supplier) lines.push(`Fournisseur : ${supplierName ?? f.supplier}`);
  if (f.from || f.to) {
    lines.push(`Période : ${f.from ? fmtDate(f.from) : "…"} → ${f.to ? fmtDate(f.to) : "…"}`);
  }
  return lines.length ? lines : ["Aucun filtre — tous les achats"];
}

// ---------------------------------------------------------------------------
// État du stock (/stock)
// ---------------------------------------------------------------------------

export type StockFilters = { warehouse: string; q: string };

export function parseStockFilters(sp: { warehouse?: string; q?: string }): StockFilters {
  return { warehouse: sp.warehouse ?? "", q: sp.q ?? "" };
}

export function stockFilterQuery(f: StockFilters): string {
  const params = new URLSearchParams();
  if (f.warehouse) params.set("warehouse", f.warehouse);
  if (f.q) params.set("q", f.q);
  return params.toString();
}

/** quantity[productId][warehouseId], built from the stock_levels rows. */
export function buildQuantityIndex(
  levels: { product_id: string; warehouse_id: string; quantity: number }[]
): Map<string, Map<string, number>> {
  const quantity = new Map<string, Map<string, number>>();
  for (const level of levels) {
    const row = quantity.get(level.product_id) ?? new Map<string, number>();
    row.set(level.warehouse_id, level.quantity);
    quantity.set(level.product_id, row);
  }
  return quantity;
}

export const stockTotalFor = (
  quantity: Map<string, Map<string, number>>,
  productId: string,
  scope: Warehouse[]
) => scope.reduce((sum, w) => sum + (quantity.get(productId)?.get(w.id) ?? 0), 0);

/** Warehouse columns shown: all of them, or just the selected one. */
export const stockColumns = (warehouses: Warehouse[], f: StockFilters) =>
  f.warehouse ? warehouses.filter((w) => w.id === f.warehouse) : warehouses;

/** The exact visibility rule of the stock screen — reused by the report. */
export function stockVisibleProducts(
  products: Product[],
  quantity: Map<string, Map<string, number>>,
  f: StockFilters,
  colorById?: Map<string, string>
): Product[] {
  const search = f.q.trim().toLowerCase();
  return products.filter((p) => {
    if (search) {
      const haystack = `${p.sku} ${p.name} ${p.attributes_summary ?? ""} ${
        colorById?.get(p.id) ?? ""
      } ${p.companies?.name ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    // With a warehouse selected, only show what that warehouse actually holds.
    if (f.warehouse) return (quantity.get(p.id)?.get(f.warehouse) ?? 0) > 0;
    return true;
  });
}

export function describeStockFilters(f: StockFilters, warehouseName?: string): string[] {
  const lines: string[] = [];
  if (f.warehouse) lines.push(`Entrepôt : ${warehouseName ?? f.warehouse}`);
  if (f.q) lines.push(`Recherche : « ${f.q} »`);
  return lines.length ? lines : ["Aucun filtre — tous les entrepôts"];
}
