import type { createClient } from "@/lib/supabase/server";
import { COLOR_ATTRIBUTE_CODE } from "@/lib/types";

// Colour is not a column on `products`: it is a user-managed attribute
// (product_values → product_attributes → product_attribute_values). This module
// resolves it to a plain product_id → "Noir" map so any server page can show a
// dedicated "Couleur" column.
//
// Deliberately three flat queries joined in JS: product_values references
// product_attribute_values through a COMPOSITE foreign key
// (value_id, attribute_id) → (id, attribute_id), which PostgREST cannot embed
// reliably. Same approach as the catalogue screen.

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

// Attributes are user-managed and renameable — fall back to the label.
const COLOR_NAME_HINTS = ["couleur", "color", "colour"];

// PostgREST caps responses at 1000 rows by default; ask for more explicitly so
// later articles do not silently lose their colour.
const MAX_ROWS = 5000;

// Beyond this, an `.in()` list makes the request URL long enough to risk a 414 —
// load every colour instead and filter in memory.
const MAX_IN_LIST = 100;

/** Id of the colour attribute, tolerant to a rename. Null when it no longer exists. */
export async function findColorAttributeId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("product_attributes")
    .select("id, code, name")
    .eq("is_active", true)
    .order("position");

  const attributes = (data ?? []) as { id: string; code: string; name: string }[];
  const byCode = attributes.find((a) => a.code === COLOR_ATTRIBUTE_CODE);
  if (byCode) return byCode.id;

  const byName = attributes.find((a) => COLOR_NAME_HINTS.includes(a.name.trim().toLowerCase()));
  return byName?.id ?? null;
}

/**
 * product_id → "Noir", or "Noir/Blanc" for a bicolour article (migration 0010
 * lets COLOR hold two values). Covers the given articles, or all of them when
 * `productIds` is omitted. Never throws: a missing attribute yields an empty
 * map, so every call site degrades to "—".
 */
export async function loadColorLabels(
  supabase: SupabaseClient,
  productIds?: string[]
): Promise<Map<string, string>> {
  const colorById = new Map<string, string>();

  if (productIds && productIds.length === 0) return colorById;

  const attributeId = await findColorAttributeId(supabase);
  if (!attributeId) return colorById;

  const narrow = productIds && productIds.length <= MAX_IN_LIST;
  let assignments = supabase
    .from("product_values")
    .select("product_id, value_id")
    .eq("attribute_id", attributeId);
  if (narrow) assignments = assignments.in("product_id", productIds!);

  const [valuesRes, labelsRes] = await Promise.all([
    assignments.range(0, MAX_ROWS - 1),
    supabase
      .from("product_attribute_values")
      .select("id, label, position")
      .eq("attribute_id", attributeId)
      .range(0, MAX_ROWS - 1),
  ]);

  const valueById = new Map(
    ((labelsRes.data ?? []) as { id: string; label: string; position: number }[]).map((v) => [
      v.id,
      v,
    ])
  );
  const wanted = narrow ? null : productIds ? new Set(productIds) : null;

  // A bicolour article has two rows; they are joined in the value order used by
  // the database when it builds `attributes_summary`, so both read alike.
  const pickedByProduct = new Map<string, { label: string; position: number }[]>();
  for (const row of (valuesRes.data ?? []) as { product_id: string; value_id: string }[]) {
    if (wanted && !wanted.has(row.product_id)) continue;
    const value = valueById.get(row.value_id);
    if (!value) continue;
    const picked = pickedByProduct.get(row.product_id) ?? [];
    picked.push(value);
    pickedByProduct.set(row.product_id, picked);
  }

  for (const [productId, picked] of pickedByProduct) {
    picked.sort((a, b) => a.position - b.position || a.label.localeCompare(b.label, "fr"));
    colorById.set(productId, picked.map((v) => v.label).join("/"));
  }

  return colorById;
}
