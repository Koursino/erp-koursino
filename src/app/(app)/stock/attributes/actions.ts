"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { int, str } from "@/lib/form";

function revalidateAttributes() {
  revalidatePath("/stock/attributes");
  revalidatePath("/stock/products");
}

function attributeFromForm(fd: FormData) {
  return {
    code: str(fd, "code") ?? "",
    name: str(fd, "name") ?? "",
    position: int(fd, "position"),
    in_sku: fd.get("in_sku") !== null,
    is_required: fd.get("is_required") !== null,
    is_active: fd.get("is_active") !== null,
  };
}

export async function createAttribute(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("product_attributes").insert(attributeFromForm(fd));
  revalidateAttributes();
  return { error: error?.message ?? null };
}

export async function updateAttribute(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase
    .from("product_attributes")
    .update(attributeFromForm(fd))
    .eq("id", id);
  revalidateAttributes();
  return { error: error?.message ?? null };
}

export async function deleteAttribute(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("product_attributes").delete().eq("id", id);
  revalidateAttributes();
  return { error: error?.message ?? null };
}

export async function createAttributeValue(attributeId: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("product_attribute_values").insert({
    attribute_id: attributeId,
    label: str(fd, "label") ?? "",
    // Left empty, the database derives the code from the label.
    code: str(fd, "code") ?? str(fd, "label") ?? "",
    position: int(fd, "position"),
  });
  revalidateAttributes();
  return { error: error?.message ?? null };
}

export async function updateAttributeValue(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase
    .from("product_attribute_values")
    .update({
      label: str(fd, "label") ?? "",
      code: str(fd, "code") ?? str(fd, "label") ?? "",
      position: int(fd, "position"),
    })
    .eq("id", id);
  revalidateAttributes();
  return { error: error?.message ?? null };
}

export async function deleteAttributeValue(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("product_attribute_values").delete().eq("id", id);
  revalidateAttributes();
  return { error: error?.message ?? null };
}
