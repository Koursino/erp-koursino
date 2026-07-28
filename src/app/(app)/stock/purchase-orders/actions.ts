"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseOrderLines, str } from "@/lib/form";
import type { PurchaseOrderStatus } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/stock/purchase-orders");
  revalidatePath("/stock");
  revalidatePath("/stock/movements");
}

function orderFromForm(fd: FormData) {
  return {
    supplier_id: str(fd, "supplier_id"),
    warehouse_id: str(fd, "warehouse_id"),
    order_date: str(fd, "order_date"),
    expected_date: str(fd, "expected_date"),
    notes: str(fd, "notes"),
  };
}

/** Lines are replaced wholesale — the form always posts the complete document. */
async function replaceLines(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  orderId: string,
  fd: FormData
) {
  const lines = parseOrderLines(fd);
  const { error: deleteError } = await supabase
    .from("purchase_order_lines")
    .delete()
    .eq("purchase_order_id", orderId);
  if (deleteError) return deleteError.message;

  if (lines.length === 0) return null;
  const { error } = await supabase.from("purchase_order_lines").insert(
    lines.map((l, index) => ({
      purchase_order_id: orderId,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price ?? 0,
      position: index,
    }))
  );
  return error?.message ?? null;
}

export async function createPurchaseOrder(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };

  // The BC-YYYY-NNNN reference is set by the database trigger.
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert(orderFromForm(fd))
    .select("id")
    .single();
  if (error) return { error: error.message };

  const lineError = await replaceLines(supabase, data.id, fd);
  revalidateAll();
  return { error: lineError };
}

export async function updatePurchaseOrder(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase.from("purchase_orders").update(orderFromForm(fd)).eq("id", id);
  if (error) return { error: error.message };

  const lineError = await replaceLines(supabase, id, fd);
  revalidateAll();
  return { error: lineError };
}

/**
 * The ONLY way a purchase order adds stock: the database function posts the
 * reception movements into the destination warehouse and flips the status to
 * `received` in a single transaction.
 */
export async function receivePurchaseOrder(id: string, warehouseId: string | null) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.rpc("receive_purchase_order", {
    p_order_id: id,
    p_warehouse_id: warehouseId,
  });
  revalidateAll();
  return { error: error?.message ?? null };
}

/** Status bookkeeping only (rfq_sent, ordered, paid…) — never moves stock. */
export async function setPurchaseOrderStatus(id: string, status: PurchaseOrderStatus) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  if (status === "received") {
    return { error: "Utilisez la réception : c'est elle qui incrémente le stock" };
  }
  const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", id);
  revalidateAll();
  return { error: error?.message ?? null };
}

export async function deletePurchaseOrder(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
  revalidateAll();
  return { error: error?.message ?? null };
}
