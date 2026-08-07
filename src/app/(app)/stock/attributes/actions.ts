"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { int, str } from "@/lib/form";

function revalidateAttributes() {
  revalidatePath("/stock/attributes");
  // Categories and colours are attribute values now, so the catalogue and the
  // stock screens both read from here.
  revalidatePath("/products");
  revalidatePath("/stock");
}

function attributeFromForm(fd: FormData) {
  return {
    code: str(fd, "code") ?? "",
    name: str(fd, "name") ?? "",
    position: int(fd, "position"),
    in_sku: fd.get("in_sku") !== null,
    in_summary: fd.get("in_summary") !== null,
    // 1 = one value per article, 2 = bicolour. The database rejects anything
    // above 5 and enforces the limit per article.
    max_values: Math.min(5, Math.max(1, int(fd, "max_values", 1))),
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
