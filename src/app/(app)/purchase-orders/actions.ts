"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PURCHASE_ORDER_STATUSES } from "@/lib/types";

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

const num = (fd: FormData, key: string) => {
  const v = str(fd, key);
  return v != null ? Number(v) : null;
};

const VALID_STATUS = new Set(PURCHASE_ORDER_STATUSES.map((s) => s.key));

// --- Purchase order header -------------------------------------------------

export async function createPurchaseOrder(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré.", id: null };
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      supplier_id: str(fd, "supplier_id"),
      currency: str(fd, "currency") ?? "MAD",
      order_date: str(fd, "order_date"),
      expected_date: str(fd, "expected_date"),
      notes: str(fd, "notes"),
    })
    .select("id")
    .single();
  revalidatePath("/purchase-orders");
  return { error: error?.message ?? null, id: data?.id ?? null };
}

export async function updatePurchaseOrder(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      supplier_id: str(fd, "supplier_id"),
      currency: str(fd, "currency") ?? "MAD",
      order_date: str(fd, "order_date"),
      expected_date: str(fd, "expected_date"),
      notes: str(fd, "notes"),
    })
    .eq("id", id);
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  return { error: error?.message ?? null };
}

export async function movePurchaseOrder(id: string, status: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };
  if (!VALID_STATUS.has(status as never)) return { error: "Statut invalide." };
  const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", id);
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  return { error: error?.message ?? null };
}

export async function deletePurchaseOrder(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
  revalidatePath("/purchase-orders");
  return { error: error?.message ?? null };
}

// --- Order lines -----------------------------------------------------------

export async function addLine(poId: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };
  const { error } = await supabase.from("purchase_order_lines").insert({
    purchase_order_id: poId,
    product_id: str(fd, "product_id"),
    description: str(fd, "description") ?? "",
    quantity: num(fd, "quantity") ?? 1,
    unit_price: num(fd, "unit_price") ?? 0,
  });
  revalidatePath(`/purchase-orders/${poId}`);
  return { error: error?.message ?? null };
}

export async function updateLine(lineId: string, poId: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };
  const { error } = await supabase
    .from("purchase_order_lines")
    .update({
      description: str(fd, "description") ?? "",
      quantity: num(fd, "quantity") ?? 1,
      unit_price: num(fd, "unit_price") ?? 0,
    })
    .eq("id", lineId);
  revalidatePath(`/purchase-orders/${poId}`);
  return { error: error?.message ?? null };
}

export async function deleteLine(lineId: string, poId: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };
  const { error } = await supabase.from("purchase_order_lines").delete().eq("id", lineId);
  revalidatePath(`/purchase-orders/${poId}`);
  return { error: error?.message ?? null };
}
