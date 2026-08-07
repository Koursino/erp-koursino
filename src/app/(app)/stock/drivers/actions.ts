"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { str } from "@/lib/form";

function revalidateDrivers() {
  revalidatePath("/stock/drivers");
  // Every delivery dialog offers the list of drivers.
  revalidatePath("/stock/sales-orders");
  revalidatePath("/stock/transfers");
  revalidatePath("/stock/deliveries");
}

function driverFromForm(fd: FormData) {
  return {
    name: str(fd, "name") ?? "",
    phone: str(fd, "phone"),
    notes: str(fd, "notes"),
    is_active: fd.get("is_active") !== null,
  };
}

export async function createDriver(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };
  const { error } = await supabase.from("drivers").insert(driverFromForm(fd));
  revalidateDrivers();
  return { error: error?.message ?? null };
}

export async function updateDriver(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };
  const { error } = await supabase.from("drivers").update(driverFromForm(fd)).eq("id", id);
  revalidateDrivers();
  return { error: error?.message ?? null };
}

/**
 * Deactivation is the normal way out: `delivery_notes.driver_id` is
 * ON DELETE RESTRICT, so a driver who already signed a BL cannot be deleted —
 * the database says so and the message explains it.
 */
export async function deleteDriver(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const { data: used } = await supabase
    .from("delivery_notes")
    .select("id")
    .eq("driver_id", id)
    .limit(1);
  if ((used ?? []).length > 0) {
    return { error: "Ce livreur figure sur des bons de livraison — désactivez-le plutôt." };
  }

  const { error } = await supabase.from("drivers").delete().eq("id", id);
  revalidateDrivers();
  return { error: error?.message ?? null };
}
