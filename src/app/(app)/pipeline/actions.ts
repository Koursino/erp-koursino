"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

function dealFromForm(fd: FormData) {
  const value = str(fd, "value");
  return {
    title: str(fd, "title") ?? "",
    company_id: str(fd, "company_id"),
    contact_id: str(fd, "contact_id"),
    stage_id: str(fd, "stage_id"),
    value: value ? Number(value) : null,
    expected_close_date: str(fd, "expected_close_date"),
    notes: str(fd, "notes"),
  };
}

export async function createDeal(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("deals").insert(dealFromForm(fd));
  revalidatePath("/pipeline");
  return { error: error?.message ?? null };
}

export async function updateDeal(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("deals").update(dealFromForm(fd)).eq("id", id);
  revalidatePath("/pipeline");
  return { error: error?.message ?? null };
}

export async function moveDeal(dealId: string, stageId: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("deals").update({ stage_id: stageId }).eq("id", dealId);
  revalidatePath("/pipeline");
  return { error: error?.message ?? null };
}

export async function deleteDeal(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("deals").delete().eq("id", id);
  revalidatePath("/pipeline");
  return { error: error?.message ?? null };
}
