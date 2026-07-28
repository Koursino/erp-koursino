"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

function companyFromForm(fd: FormData) {
  return {
    name: str(fd, "name") ?? "",
    // Supplier abbreviation opening every article SKU, e.g. "SAMS".
    code: str(fd, "code")?.toUpperCase().replace(/[^A-Z0-9]+/g, "-") ?? null,
    industry: str(fd, "industry"),
    website: str(fd, "website"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    city: str(fd, "city"),
    country: str(fd, "country"),
    notes: str(fd, "notes"),
    is_supplier: fd.get("is_supplier") === "on",
  };
}

export async function createCompany(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("companies").insert(companyFromForm(fd));
  revalidatePath("/companies");
  return { error: error?.message ?? null };
}

export async function updateCompany(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("companies").update(companyFromForm(fd)).eq("id", id);
  revalidatePath("/companies");
  return { error: error?.message ?? null };
}

export async function deleteCompany(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("companies").delete().eq("id", id);
  revalidatePath("/companies");
  return { error: error?.message ?? null };
}
