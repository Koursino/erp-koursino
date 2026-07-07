"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

export async function createActivity(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("activities").insert({
    type: str(fd, "type") ?? "note",
    subject: str(fd, "subject") ?? "",
    content: str(fd, "content"),
    due_date: str(fd, "due_date"),
    company_id: str(fd, "company_id"),
    deal_id: str(fd, "deal_id"),
  });
  revalidatePath("/activities");
  return { error: error?.message ?? null };
}

export async function toggleActivityDone(id: string, done: boolean) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("activities").update({ done }).eq("id", id);
  revalidatePath("/activities");
  return { error: error?.message ?? null };
}

export async function deleteActivity(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("activities").delete().eq("id", id);
  revalidatePath("/activities");
  return { error: error?.message ?? null };
}
