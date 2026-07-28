"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { num, str } from "@/lib/form";

function productFromForm(fd: FormData) {
  const supplierId = str(fd, "supplier_id");
  return {
    name: str(fd, "name") ?? "",
    description: str(fd, "description"),
    category: str(fd, "category"),
    unit: str(fd, "unit") ?? "pièce",
    unit_price_ht: num(fd, "unit_price_ht") ?? 0,
    vat_rate: num(fd, "vat_rate") ?? 20,
    purchase_price: num(fd, "purchase_price"),
    barcode: str(fd, "barcode"),
    min_stock: num(fd, "min_stock") ?? 0,
    notes: str(fd, "notes"),
    is_active: fd.get("is_active") !== null,
    // Setting a supplier switches the article to the generated SKU
    // (SUPPLIER/MODEL/…/SEQ); leaving it empty keeps the legacy code.
    supplier_id: supplierId,
    model: str(fd, "model"),
    model_code: str(fd, "model_code"),
  };
}

/**
 * Attribute choices are posted as `attr_<attributeId>` fields. Replacing the
 * whole set keeps the article's attributes in sync with the form; each write
 * re-triggers the SKU/summary rebuild in the database.
 */
async function saveAttributes(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  productId: string,
  fd: FormData
) {
  const rows: { product_id: string; attribute_id: string; value_id: string }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("attr_") || typeof value !== "string" || value === "") continue;
    rows.push({ product_id: productId, attribute_id: key.slice(5), value_id: value });
  }

  const { error: deleteError } = await supabase
    .from("product_values")
    .delete()
    .eq("product_id", productId);
  if (deleteError) return deleteError.message;

  if (rows.length === 0) return null;
  const { error } = await supabase.from("product_values").insert(rows);
  return error?.message ?? null;
}

function revalidateProducts() {
  revalidatePath("/stock/products");
  revalidatePath("/stock");
}

export async function createProduct(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };

  const fields = productFromForm(fd);
  // `sku` is NOT NULL in the live schema. With a supplier the trigger builds
  // the real code; without one the user provides the legacy-style code.
  const sku = str(fd, "sku") ?? "";
  if (!fields.supplier_id && !sku) {
    return { error: "Donnez un code SKU, ou choisissez un fournisseur pour le générer" };
  }

  const { data, error } = await supabase
    .from("products")
    .insert({ ...fields, sku: sku || "AUTO" })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const attrError = await saveAttributes(supabase, data.id, fd);
  revalidateProducts();
  return { error: attrError };
}

export async function updateProduct(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };

  const fields = productFromForm(fd);
  const sku = str(fd, "sku");
  const { error } = await supabase
    .from("products")
    // Manual SKU only matters for legacy articles; the trigger overrides it
    // as soon as a supplier is set.
    .update(sku && !fields.supplier_id ? { ...fields, sku } : fields)
    .eq("id", id);
  if (error) return { error: error.message };

  const attrError = await saveAttributes(supabase, id, fd);
  revalidateProducts();
  return { error: attrError };
}

export async function deleteProduct(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from("products").delete().eq("id", id);
  revalidateProducts();
  return { error: error?.message ?? null };
}
