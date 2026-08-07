"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { int, num, str } from "@/lib/form";

// Non-null server Supabase client type (createClient returns null when unconfigured).
type SupabaseServer = NonNullable<Awaited<ReturnType<typeof createClient>>>;

const BUCKET = "product-photos";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 Mo — kept well under Netlify's function payload cap
// Marker used to recover an object path from a stored public URL.
const PUBLIC_MARKER = `/object/public/${BUCKET}/`;

function revalidateCatalog() {
  revalidatePath("/products");
  revalidatePath("/catalog");
  revalidatePath("/stock");
}

// Fields the app is allowed to write. Deliberately excluded: `unit_price_ttc`
// and `sku` (generated), `attributes_summary`, and `category` — since migration
// 0010 the category is the CATEGORY attribute and the column is its mirror.
type ProductValues = {
  name: string;
  description: string | null;
  unit: string;
  unit_price_ht: number;
  vat_rate: number;
  supplier_id: string | null;
  model: string | null;
  model_code: string | null;
  purchase_price: number | null;
  min_stock: number;
  barcode: string | null;
  notes: string | null;
  is_active: boolean;
};

type ParseResult = { error: string } | { values: ProductValues; sku: string | null };

// Server-side validation — the authoritative check, returns clear French messages.
function parseAndValidate(fd: FormData): ParseResult {
  const name = str(fd, "name");
  const htRaw = str(fd, "unit_price_ht");
  const vatRaw = str(fd, "vat_rate");
  const supplierId = str(fd, "supplier_id");
  const sku = str(fd, "sku");

  if (!name) return { error: "La désignation est obligatoire." };
  // With a supplier the database builds SUPPLIER/MODEL/…/SEQ; without one the
  // article keeps a hand-made code, which the user has to provide.
  if (!supplierId && !sku)
    return { error: "Donnez une référence (SKU), ou choisissez un fournisseur pour la générer." };

  const ht = Number(htRaw);
  if (htRaw === null || !Number.isFinite(ht) || ht < 0)
    return { error: "Le prix HT doit être un nombre positif." };

  const vat = vatRaw === null ? 20 : Number(vatRaw);
  if (!Number.isFinite(vat) || vat < 0 || vat > 100)
    return { error: "Le taux de TVA doit être compris entre 0 et 100." };

  return {
    sku,
    values: {
      name,
      description: str(fd, "description"),
      unit: str(fd, "unit") ?? "pièce",
      unit_price_ht: ht,
      vat_rate: vat,
      supplier_id: supplierId,
      model: str(fd, "model"),
      model_code: str(fd, "model_code"),
      purchase_price: num(fd, "purchase_price"),
      min_stock: int(fd, "min_stock"),
      barcode: str(fd, "barcode"),
      notes: str(fd, "notes"),
      is_active: fd.get("is_active") !== null,
    },
  };
}

/**
 * Attribute choices are posted as `attr_<attributeId>` fields — several times
 * for a multi-value attribute such as the colour of a bicolour article.
 * Replacing the whole set keeps the article in sync with the form, and each
 * write re-triggers the SKU / summary / category rebuild in the database.
 */
async function saveAttributes(supabase: SupabaseServer, productId: string, fd: FormData) {
  const seen = new Set<string>();
  const rows: { product_id: string; attribute_id: string; value_id: string }[] = [];

  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("attr_") || typeof value !== "string" || value === "") continue;
    const attributeId = key.slice(5);
    // Picking the same colour twice on a bicolour article is a no-op, not an error.
    const dedupeKey = `${attributeId}:${value}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    rows.push({ product_id: productId, attribute_id: attributeId, value_id: value });
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

// Uploads an image to Supabase Storage and returns its public URL (or a French error).
async function uploadPhoto(
  supabase: SupabaseServer,
  file: File
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return { error: "Format d'image non supporté (JPEG, PNG ou WebP)." };
  if (file.size > MAX_IMAGE_BYTES)
    return { error: "L'image dépasse la taille maximale de 3 Mo." };

  // Random, collision-proof path (not keyed on SKU, which can change on edit).
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
  const path = `products/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { error: "Échec du téléversement de la photo." };

  return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

// Best-effort removal of a stored photo from its public URL (ignores failures).
async function removePhoto(supabase: SupabaseServer, url: string): Promise<void> {
  const path = url.includes(PUBLIC_MARKER) ? url.split(PUBLIC_MARKER)[1] : null;
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}

// Reads an optional uploaded photo from the form. Returns its URL, null (no file),
// or an error to surface.
async function readPhoto(
  supabase: SupabaseServer,
  fd: FormData
): Promise<{ url: string | null } | { error: string }> {
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { url: null };
  const uploaded = await uploadPhoto(supabase, file);
  if ("error" in uploaded) return { error: uploaded.error };
  return { url: uploaded.url };
}

export async function createProduct(fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const parsed = parseAndValidate(fd);
  if ("error" in parsed) return parsed;

  const photo = await readPhoto(supabase, fd);
  if ("error" in photo) return { error: photo.error };

  // `sku` is NOT NULL in the live schema; with a supplier the trigger
  // immediately overwrites this placeholder with the generated code.
  const payload = {
    ...parsed.values,
    sku: parsed.sku ?? "AUTO",
    ...(photo.url ? { photo_url: photo.url } : {}),
  };

  const { data, error } = await supabase.from("products").insert(payload).select("id").single();
  if (error) {
    // Clean up the just-uploaded photo if the insert failed.
    if (photo.url) await removePhoto(supabase, photo.url);
    if (error.code === "23505") return { error: "Cette référence (SKU) existe déjà." };
    return { error: error.message };
  }

  const attrError = await saveAttributes(supabase, data.id, fd);
  revalidateCatalog();
  return { error: attrError };
}

export async function updateProduct(id: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const parsed = parseAndValidate(fd);
  if ("error" in parsed) return parsed;

  const photo = await readPhoto(supabase, fd);
  if ("error" in photo) return { error: photo.error };

  // When replacing the photo, remember the previous one to clean up afterwards.
  let oldUrl: string | null = null;
  if (photo.url) {
    const { data: existing } = await supabase
      .from("products")
      .select("photo_url")
      .eq("id", id)
      .single();
    oldUrl = (existing?.photo_url as string | null) ?? null;
  }

  const payload = {
    ...parsed.values,
    // A hand-made code is only meaningful while no supplier drives the SKU.
    ...(parsed.sku && !parsed.values.supplier_id ? { sku: parsed.sku } : {}),
    ...(photo.url ? { photo_url: photo.url } : {}),
  };

  const { error } = await supabase.from("products").update(payload).eq("id", id);
  if (error) {
    if (photo.url) await removePhoto(supabase, photo.url); // discard the orphaned new upload
    if (error.code === "23505") return { error: "Cette référence (SKU) existe déjà." };
    return { error: error.message };
  }

  const attrError = await saveAttributes(supabase, id, fd);
  if (oldUrl) await removePhoto(supabase, oldUrl);
  revalidateCatalog();
  return { error: attrError };
}

/**
 * "Pour telle référence, voici les couleurs qu'on commercialise."
 *
 * A colour is a stockable article, so declaring the colours of a reference
 * means keeping one sibling article per colour, all sharing the reference's
 * `variant_group_id`. Colours removed from the list are DEACTIVATED, never
 * deleted: the variant may already carry stock or appear on a document.
 */
export async function saveReferenceColors(productId: string, valueIds: string[]) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const { data: reference, error: readError } = await supabase
    .from("products")
    .select("*, product_values(attribute_id, value_id)")
    .eq("id", productId)
    .single();
  if (readError || !reference) return { error: readError?.message ?? "Article introuvable." };

  const { data: colorAttribute } = await supabase
    .from("product_attributes")
    .select("id, max_values")
    .eq("code", "COLOR")
    .maybeSingle();
  if (!colorAttribute) return { error: "L'attribut Couleur n'existe pas." };

  const groupId = reference.variant_group_id as string | null;
  if (!groupId) return { error: "Cet article n'a pas encore de groupe de variantes." };

  // The whole family, plus the colour each member carries.
  const { data: siblingRows } = await supabase
    .from("products")
    .select("id, sku, is_active, product_values(attribute_id, value_id)")
    .eq("variant_group_id", groupId);

  type Sibling = {
    id: string;
    sku: string;
    is_active: boolean;
    product_values: { attribute_id: string; value_id: string }[] | null;
  };
  const siblings = (siblingRows ?? []) as Sibling[];

  const colorOf = (s: Sibling) =>
    (s.product_values ?? []).find((v) => v.attribute_id === colorAttribute.id)?.value_id ?? null;

  const wanted = [...new Set(valueIds.filter(Boolean))];
  const byColor = new Map<string, Sibling>();
  for (const sibling of siblings) {
    const color = colorOf(sibling);
    if (color) byColor.set(color, sibling);
  }

  const { data: valueRows } = await supabase
    .from("product_attribute_values")
    .select("id, code, label")
    .eq("attribute_id", colorAttribute.id);
  const valueById = new Map(
    ((valueRows ?? []) as { id: string; code: string; label: string }[]).map((v) => [v.id, v])
  );

  // The reference itself takes the first colour when it has none, so declaring
  // three colours yields three articles and not four. Consumed once.
  let uncolored = siblings.find((s) => colorOf(s) === null) ?? null;

  for (const valueId of wanted) {
    const existing = byColor.get(valueId);
    if (existing) {
      if (!existing.is_active) {
        await supabase.from("products").update({ is_active: true }).eq("id", existing.id);
      }
      continue;
    }

    const value = valueById.get(valueId);
    if (!value) continue;

    if (uncolored) {
      const { error } = await supabase
        .from("product_values")
        .insert({ product_id: uncolored.id, attribute_id: colorAttribute.id, value_id: valueId });
      if (error) return { error: error.message };
      byColor.set(valueId, uncolored);
      uncolored = null;
      continue;
    }

    const { data: created, error: insertError } = await supabase
      .from("products")
      .insert({
        // Without a supplier the SKU is hand-made, so derive one that stays readable.
        sku: reference.supplier_id ? "AUTO" : `${reference.sku}-${value.code}`,
        name: reference.name,
        description: reference.description,
        photo_url: reference.photo_url,
        unit: reference.unit,
        unit_price_ht: reference.unit_price_ht,
        vat_rate: reference.vat_rate,
        currency: reference.currency,
        supplier_id: reference.supplier_id,
        model: reference.model,
        model_code: reference.model_code,
        purchase_price: reference.purchase_price,
        min_stock: reference.min_stock,
        notes: reference.notes,
        is_active: true,
        variant_group_id: groupId,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505")
        return { error: `Une référence existe déjà pour la couleur ${value.label}.` };
      return { error: insertError.message };
    }

    // Copy the reference's other attributes (matière, catégorie…), then the colour.
    const inherited = (reference.product_values ?? []) as { attribute_id: string; value_id: string }[];
    const rows = [
      ...inherited
        .filter((v) => v.attribute_id !== colorAttribute.id)
        .map((v) => ({ product_id: created.id, attribute_id: v.attribute_id, value_id: v.value_id })),
      { product_id: created.id, attribute_id: colorAttribute.id, value_id: valueId },
    ];
    const { error: valuesError } = await supabase.from("product_values").insert(rows);
    if (valuesError) return { error: valuesError.message };
  }

  // Colours no longer commercialised: deactivate, keep the history.
  const dropped = [...byColor.entries()].filter(([valueId]) => !wanted.includes(valueId));
  for (const [, sibling] of dropped) {
    if (sibling.is_active) {
      await supabase.from("products").update({ is_active: false }).eq("id", sibling.id);
    }
  }

  revalidateCatalog();
  return { error: null };
}

// Primary "delete": deactivate/reactivate without losing the row (protects future orders).
export async function setProductActive(id: string, isActive: boolean) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const { error } = await supabase.from("products").update({ is_active: isActive }).eq("id", id);
  revalidateCatalog();
  return { error: error?.message ?? null };
}

// Hard delete (guarded in the UI) — also removes the stored photo.
export async function deleteProduct(id: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const { data: existing } = await supabase
    .from("products")
    .select("photo_url")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { error: error.message };

  if (existing?.photo_url) await removePhoto(supabase, existing.photo_url as string);
  revalidateCatalog();
  return { error: null };
}
