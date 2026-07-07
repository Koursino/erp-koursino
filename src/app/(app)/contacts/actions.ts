"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

function contactFromForm(fd: FormData) {
  return {
    first_name: str(fd, "first_name") ?? "",
    last_name: str(fd, "last_name") ?? "",
    company_id: str(fd, "company_id"),
    role: str(fd, "role"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    notes: str(fd, "notes"),
  };
}

export async function createContact(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("contacts").insert(contactFromForm(fd));
  revalidatePath("/contacts");
  return { error: error?.message ?? null };
}

export async function updateContact(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("contacts").update(contactFromForm(fd)).eq("id", id);
  revalidatePath("/contacts");
  return { error: error?.message ?? null };
}

export async function deleteContact(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  revalidatePath("/contacts");
  return { error: error?.message ?? null };
}
