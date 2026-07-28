import type { LineAllocationInput, OrderLineInput } from "./types";

/** Trimmed string field, or null when empty. */
export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

/** Numeric field, or null when empty / not a number. */
export const num = (fd: FormData, key: string) => {
  const v = str(fd, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Integer field with a fallback (used for counters such as min_stock). */
export const int = (fd: FormData, key: string, fallback = 0) => {
  const n = num(fd, key);
  return n === null ? fallback : Math.trunc(n);
};

/**
 * Warehouse rows of one line, merged per warehouse so the (line, warehouse)
 * unique constraint never trips. Rows without a warehouse or with a
 * non-positive quantity are dropped.
 */
function parseAllocations(input: unknown): LineAllocationInput[] {
  if (!Array.isArray(input)) return [];

  const merged = new Map<string, LineAllocationInput>();
  for (const item of input) {
    if (typeof item !== "object" || item === null) continue;
    const { warehouse_id, quantity } = item as Record<string, unknown>;
    if (typeof warehouse_id !== "string" || warehouse_id === "") continue;

    const qty = Math.trunc(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const existing = merged.get(warehouse_id);
    if (existing) existing.quantity += qty;
    else merged.set(warehouse_id, { warehouse_id, quantity: qty });
  }
  return [...merged.values()];
}

/**
 * Order lines are posted as JSON by the shared line editor. Lines without a
 * product or with a non-positive quantity are dropped, and duplicated products
 * are merged so the (order, product) unique constraint never trips.
 *
 * When a line carries warehouse rows, the line quantity is *derived* from them
 * — "REF-1 / 70" is 50 from E1 plus 20 from E2, never a number typed on its
 * own — which is exactly what the database checks before confirming.
 */
export function parseOrderLines(fd: FormData, key = "lines"): OrderLineInput[] {
  const raw = str(fd, key);
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const merged = new Map<string, OrderLineInput>();
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const { product_id, quantity, unit_price, allocations } = item as Record<string, unknown>;
    if (typeof product_id !== "string" || product_id === "") continue;

    const rows = parseAllocations(allocations);
    const qty = rows.length > 0
      ? rows.reduce((sum, r) => sum + r.quantity, 0)
      : Math.trunc(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const price = Number(unit_price);
    const existing = merged.get(product_id);
    if (existing) {
      existing.quantity += qty;
      for (const row of rows) {
        const same = existing.allocations?.find((a) => a.warehouse_id === row.warehouse_id);
        if (same) same.quantity += row.quantity;
        else existing.allocations = [...(existing.allocations ?? []), row];
      }
    } else {
      merged.set(product_id, {
        product_id,
        quantity: qty,
        unit_price: Number.isFinite(price) ? price : null,
        allocations: rows,
      });
    }
  }
  return [...merged.values()];
}
