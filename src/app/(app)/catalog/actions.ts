"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

const num = (fd: FormData, key: string) => {
  const v = str(fd, key);
  return v != null ? Number(v) : null;
};

function entryFromForm(fd: FormData) {
  return {
    supplier_id: str(fd, "supplier_id"),
    product_id: str(fd, "product_id"),
    supplier_ref: str(fd, "supplier_ref"),
    unit_price: num(fd, "unit_price"),
    currency: str(fd, "currency") ?? "EUR",
    lead_time_days: num(fd, "lead_time_days"),
    min_order_qty: num(fd, "min_order_qty") ?? 1,
    is_preferred: fd.get("is_preferred") === "on",
    notes: str(fd, "notes"),
  };
}

export async function createCatalogEntry(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("supplier_catalog").insert(entryFromForm(fd));
  revalidatePath("/catalog");
  return { error: error?.message ?? null };
}

export async function updateCatalogEntry(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("supplier_catalog").update(entryFromForm(fd)).eq("id", id);
  revalidatePath("/catalog");
  return { error: error?.message ?? null };
}

export async function deleteCatalogEntry(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("supplier_catalog").delete().eq("id", id);
  revalidatePath("/catalog");
  return { error: error?.message ?? null };
}
