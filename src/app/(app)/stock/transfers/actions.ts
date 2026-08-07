"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseOrderLines, str } from "@/lib/form";

function revalidateAll() {
  revalidatePath("/stock/transfers");
  revalidatePath("/stock");
  revalidatePath("/stock/movements");
}

function transferFromForm(fd: FormData) {
  return {
    from_warehouse_id: str(fd, "from_warehouse_id"),
    to_warehouse_id: str(fd, "to_warehouse_id"),
    transfer_date: str(fd, "transfer_date"),
    notes: str(fd, "notes"),
  };
}

async function replaceLines(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  transferId: string,
  fd: FormData
) {
  const lines = parseOrderLines(fd);
  const { error: deleteError } = await supabase
    .from("stock_transfer_lines")
    .delete()
    .eq("transfer_id", transferId);
  if (deleteError) return deleteError.message;

  if (lines.length === 0) return null;
  const { error } = await supabase.from("stock_transfer_lines").insert(
    // Transfers move quantities, not money.
    lines.map((l) => ({ transfer_id: transferId, product_id: l.product_id, quantity: l.quantity }))
  );
  return error?.message ?? null;
}

export async function createTransfer(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data, error } = await supabase
    .from("stock_transfers")
    .insert(transferFromForm(fd))
    .select("id")
    .single();
  if (error) return { error: error.message };

  const lineError = await replaceLines(supabase, data.id, fd);
  revalidateAll();
  return { error: lineError };
}

export async function updateTransfer(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase.from("stock_transfers").update(transferFromForm(fd)).eq("id", id);
  if (error) return { error: error.message };

  const lineError = await replaceLines(supabase, id, fd);
  revalidateAll();
  return { error: lineError };
}

/**
 * Moves the stock: one outgoing movement in the source warehouse and one
 * incoming movement in the destination, in a single transaction, under a bon
 * de livraison numbered with both warehouses (002-US-DB/2026). Refused if the
 * source does not hold enough, or without a driver (migration 0012).
 */
export async function executeTransfer(id: string, driverId: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  if (!driverId) return { error: "Sélectionnez le livreur." };

  const { error } = await supabase.rpc("execute_stock_transfer", {
    p_transfer_id: id,
    p_driver_id: driverId,
  });
  revalidateAll();
  return { error: error?.message ?? null };
}

export async function cancelTransfer(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase
    .from("stock_transfers")
    .update({ status: "cancelled" })
    .eq("id", id);
  revalidateAll();
  return { error: error?.message ?? null };
}

export async function deleteTransfer(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("stock_transfers").delete().eq("id", id);
  revalidateAll();
  return { error: error?.message ?? null };
}
