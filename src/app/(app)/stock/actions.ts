"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { int, str } from "@/lib/form";

/**
 * Manual stock entry — the third way stock changes, next to receptions and
 * transfers. `quantity` is a signed delta and the note is mandatory: the
 * database rejects the movement without one, since there is no source document
 * to explain it.
 */
export async function adjustStock(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };

  const note = str(fd, "note");
  if (!note) return { error: "A note is required for a manual stock entry" };

  const mode = str(fd, "mode"); // "add" | "remove"
  const quantity = Math.abs(int(fd, "quantity"));
  if (quantity === 0) return { error: "Quantity must be greater than zero" };

  const { error } = await supabase.rpc("adjust_stock", {
    p_product_id: str(fd, "product_id"),
    p_warehouse_id: str(fd, "warehouse_id"),
    p_quantity: mode === "remove" ? -quantity : quantity,
    p_note: note,
  });

  revalidatePath("/stock");
  revalidatePath("/stock/movements");
  revalidatePath("/stock/products");
  return { error: error?.message ?? null };
}
