"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseOrderLines, str } from "@/lib/form";
import type { OrderState } from "@/lib/types";

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;

function revalidateAll() {
  revalidatePath("/stock/sales-orders");
  revalidatePath("/stock");
  revalidatePath("/stock/movements");
}

function orderFromForm(fd: FormData) {
  return {
    company_id: str(fd, "company_id"),
    deal_id: str(fd, "deal_id"),
    warehouse_id: str(fd, "warehouse_id"),
    order_date: str(fd, "order_date"),
    notes: str(fd, "notes"),
  };
}

/**
 * Replaces the lines of a DRAFT order. `order_lines.description` is NOT NULL
 * in the live schema and the VAT rate comes from the article, so both are
 * looked up here. Totals are recomputed by the `order_lines_totals` trigger.
 */
async function replaceLines(supabase: Client, orderId: string, fd: FormData) {
  const lines = parseOrderLines(fd);

  const { error: deleteError } = await supabase
    .from("order_lines")
    .delete()
    .eq("order_id", orderId);
  if (deleteError) return deleteError.message;
  if (lines.length === 0) return null;

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, sku, name, attributes_summary, unit_price_ht, vat_rate")
    .in("id", lines.map((l) => l.product_id));
  if (productsError) return productsError.message;

  const byId = new Map((products ?? []).map((p) => [p.id, p]));

  const { error } = await supabase.from("order_lines").insert(
    lines.map((l, index) => {
      const product = byId.get(l.product_id);
      const label = product
        ? [product.name, product.attributes_summary].filter(Boolean).join(" · ")
        : "";
      return {
        order_id: orderId,
        product_id: l.product_id,
        description: label || product?.sku || "Article",
        quantity: l.quantity,
        unit_price_ht: l.unit_price ?? product?.unit_price_ht ?? 0,
        vat_rate: product?.vat_rate ?? 20,
        position: index,
      };
    })
  );
  return error?.message ?? null;
}

export async function createOrder(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };

  // The KRS-YYYY-NNNNN reference is set by the database trigger (0007).
  const { data, error } = await supabase
    .from("orders")
    .insert(orderFromForm(fd))
    .select("id")
    .single();
  if (error) return { error: error.message };

  const lineError = await replaceLines(supabase, data.id, fd);
  revalidateAll();
  return { error: lineError };
}

export async function updateOrder(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data: current, error: readError } = await supabase
    .from("orders")
    .select("state")
    .eq("id", id)
    .single();
  if (readError) return { error: readError.message };
  if (current.state !== "brouillon") {
    return { error: "Seule une commande en brouillon peut être modifiée" };
  }

  const { error } = await supabase.from("orders").update(orderFromForm(fd)).eq("id", id);
  if (error) return { error: error.message };

  const lineError = await replaceLines(supabase, id, fd);
  revalidateAll();
  return { error: lineError };
}

/** Freezes the commitment. No stock moves — that is the delivery's job. */
export async function confirmOrder(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase
    .from("orders")
    .update({ state: "confirmee", confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("state", "brouillon");
  revalidateAll();
  return { error: error?.message ?? null };
}

/**
 * The ONLY way an order decrements stock. The database function checks
 * availability in the source warehouse, posts the delivery movements, updates
 * the per-line counters and derives the state (livree / en_preparation) — all
 * in one transaction. `lines` restricts the delivery to given quantities for
 * a partial shipment; null delivers everything still owed.
 */
export async function deliverOrder(
  id: string,
  warehouseId: string,
  lines: { line_id: string; quantity: number }[] | null
) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.rpc("deliver_order", {
    p_order_id: id,
    p_warehouse_id: warehouseId,
    p_lines: lines,
  });
  revalidateAll();
  return { error: error?.message ?? null };
}

/** Puts delivered goods back into their warehouses. The note is mandatory. */
export async function returnOrderDelivery(id: string, note: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.rpc("return_order_delivery", {
    p_order_id: id,
    p_note: note,
  });
  revalidateAll();
  return { error: error?.message ?? null };
}

/** Bookkeeping transitions after delivery (facturée, payée) or cancellation. */
export async function setOrderState(id: string, state: OrderState) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };

  if (state === "livree") {
    return { error: "Utilisez la livraison : c'est elle qui décrémente le stock" };
  }
  if (state === "annulee") {
    // Delivered goods must come back into stock before the order is voided,
    // otherwise the ledger and reality diverge silently.
    const { data: delivered } = await supabase
      .from("order_lines")
      .select("id")
      .eq("order_id", id)
      .gt("qty_delivered", 0)
      .limit(1);
    if ((delivered ?? []).length > 0) {
      return { error: "Des articles ont été livrés : faites d'abord un retour en stock" };
    }
  }

  const { error } = await supabase.from("orders").update({ state }).eq("id", id);
  revalidateAll();
  return { error: error?.message ?? null };
}

export async function deleteOrder(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data: movements } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("order_id", id)
    .limit(1);
  if ((movements ?? []).length > 0) {
    return { error: "Cette commande a bougé du stock — annulez-la, ne la supprimez pas" };
  }

  const { error } = await supabase.from("orders").delete().eq("id", id);
  revalidateAll();
  return { error: error?.message ?? null };
}
