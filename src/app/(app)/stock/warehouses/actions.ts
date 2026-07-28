"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { str } from "@/lib/form";

function warehouseFromForm(fd: FormData) {
  return {
    // The database normalises the code (uppercase, no accents) as well.
    code: str(fd, "code") ?? "",
    name: str(fd, "name") ?? "",
    address: str(fd, "address"),
    city: str(fd, "city"),
    country: str(fd, "country"),
    notes: str(fd, "notes"),
    is_default: fd.get("is_default") === "on",
    is_active: fd.get("is_active") !== null,
  };
}

export async function createWarehouse(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("warehouses").insert(warehouseFromForm(fd));
  revalidatePath("/stock/warehouses");
  revalidatePath("/stock");
  return { error: error?.message ?? null };
}

export async function updateWarehouse(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("warehouses").update(warehouseFromForm(fd)).eq("id", id);
  revalidatePath("/stock/warehouses");
  revalidatePath("/stock");
  return { error: error?.message ?? null };
}

export async function deleteWarehouse(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("warehouses").delete().eq("id", id);
  revalidatePath("/stock/warehouses");
  revalidatePath("/stock");
  return { error: error?.message ?? null };
}
