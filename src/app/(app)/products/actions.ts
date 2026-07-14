"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Non-null server Supabase client type (createClient returns null when unconfigured).
type SupabaseServer = NonNullable<Awaited<ReturnType<typeof createClient>>>;

const BUCKET = "product-photos";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 Mo — kept well under Netlify's function payload cap
// Marker used to recover an object path from a stored public URL.
const PUBLIC_MARKER = `/object/public/${BUCKET}/`;

// FormData string helper: trims and returns null when empty (same convention as the CRM modules).
const str = (fd: FormData, key: string): string | null => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

// Fields the app is allowed to write. `unit_price_ttc` is intentionally excluded:
// it is a generated column (the database is the source of truth for TTC).
type ProductValues = {
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  unit_price_ht: number;
  vat_rate: number;
};

type ParseResult = { error: string } | { values: ProductValues };

// Server-side validation — the authoritative check, returns clear French messages.
function parseAndValidate(fd: FormData): ParseResult {
  const sku = str(fd, "sku");
  const name = str(fd, "name");
  const htRaw = str(fd, "unit_price_ht");
  const vatRaw = str(fd, "vat_rate");

  if (!sku) return { error: "La référence (SKU) est obligatoire." };
  if (!name) return { error: "La désignation est obligatoire." };

  const ht = Number(htRaw);
  if (htRaw === null || !Number.isFinite(ht) || ht < 0)
    return { error: "Le prix HT doit être un nombre positif." };

  const vat = vatRaw === null ? 20 : Number(vatRaw);
  if (!Number.isFinite(vat) || vat < 0 || vat > 100)
    return { error: "Le taux de TVA doit être compris entre 0 et 100." };

  return {
    values: {
      sku,
      name,
      description: str(fd, "description"),
      category: str(fd, "category"),
      unit: str(fd, "unit") ?? "pièce",
      unit_price_ht: ht,
      vat_rate: vat,
    },
  };
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

  const payload = photo.url ? { ...parsed.values, photo_url: photo.url } : parsed.values;

  const { error } = await supabase.from("products").insert(payload);
  if (error) {
    // Clean up the just-uploaded photo if the insert failed.
    if (photo.url) await removePhoto(supabase, photo.url);
    if (error.code === "23505") return { error: "Cette référence (SKU) existe déjà." };
    return { error: error.message };
  }

  revalidatePath("/products");
  return { error: null };
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

  const payload = photo.url ? { ...parsed.values, photo_url: photo.url } : parsed.values;

  const { error } = await supabase.from("products").update(payload).eq("id", id);
  if (error) {
    if (photo.url) await removePhoto(supabase, photo.url); // discard the orphaned new upload
    if (error.code === "23505") return { error: "Cette référence (SKU) existe déjà." };
    return { error: error.message };
  }

  if (oldUrl) await removePhoto(supabase, oldUrl);
  revalidatePath("/products");
  return { error: null };
}

// Primary "delete": deactivate/reactivate without losing the row (protects future orders).
export async function setProductActive(id: string, isActive: boolean) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const { error } = await supabase.from("products").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/products");
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
  revalidatePath("/products");
  return { error: null };
}
