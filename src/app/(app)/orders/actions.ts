"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TRANSITIONS, type OrderState } from "@/lib/types";

// FormData helpers (same convention as the other modules).
const str = (fd: FormData, key: string): string | null => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const num = (fd: FormData, key: string): number | null => {
  const v = str(fd, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

type SupabaseServer = NonNullable<Awaited<ReturnType<typeof createClient>>>;

// Lines are only editable while the order is a draft or freshly confirmed (before préparation).
const LINE_EDITABLE_STATES: OrderState[] = ["brouillon", "confirmee"];

async function loadState(supabase: SupabaseServer, orderId: string): Promise<OrderState | null> {
  const { data } = await supabase.from("orders").select("state").eq("id", orderId).single();
  return (data?.state as OrderState | undefined) ?? null;
}

// --- Header -----------------------------------------------------------------

export async function createOrder(fd: FormData): Promise<{ error: string | null; id?: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const companyId = str(fd, "company_id");
  if (!companyId) return { error: "Sélectionnez le revendeur." };

  // state defaults to 'brouillon', created_by defaults to auth.uid() at the DB level.
  const { data, error } = await supabase
    .from("orders")
    .insert({ company_id: companyId, deal_id: str(fd, "deal_id"), notes: str(fd, "notes") })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/orders");
  return { error: null, id: data.id };
}

export async function updateOrder(orderId: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const state = await loadState(supabase, orderId);
  if (!state) return { error: "Commande introuvable." };
  if (state !== "brouillon") return { error: "L'entête n'est modifiable qu'en Brouillon." };

  const companyId = str(fd, "company_id");
  if (!companyId) return { error: "Le revendeur est obligatoire." };

  const payload: Record<string, unknown> = {
    company_id: companyId,
    deal_id: str(fd, "deal_id"),
    notes: str(fd, "notes"),
  };
  const orderDate = str(fd, "order_date");
  if (orderDate) payload.order_date = orderDate;

  const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
  if (error) return { error: error.message };

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { error: null };
}

// --- Lines ------------------------------------------------------------------

export async function addOrderLine(orderId: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const state = await loadState(supabase, orderId);
  if (!state) return { error: "Commande introuvable." };
  if (!LINE_EDITABLE_STATES.includes(state))
    return { error: "Les lignes ne sont modifiables qu'en Brouillon ou Confirmée." };

  const productId = str(fd, "product_id");
  if (!productId) return { error: "Sélectionnez un produit." };

  // Snapshot the catalog values onto the line (price overridable).
  const { data: product } = await supabase
    .from("products")
    .select("name, unit_price_ht, vat_rate")
    .eq("id", productId)
    .single();
  if (!product) return { error: "Produit introuvable." };

  const quantity = num(fd, "quantity") ?? 1;
  if (quantity <= 0) return { error: "La quantité doit être positive." };
  const discount = num(fd, "discount_percent") ?? 0;
  if (discount < 0 || discount > 100) return { error: "La remise doit être comprise entre 0 et 100." };
  const priceOverride = num(fd, "unit_price_ht");
  if (priceOverride !== null && priceOverride < 0) return { error: "Le prix ne peut pas être négatif." };

  // Append at the end.
  const { count } = await supabase
    .from("order_lines")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);

  const { error } = await supabase.from("order_lines").insert({
    order_id: orderId,
    product_id: productId,
    description: product.name, // snapshot
    unit_price_ht: priceOverride ?? product.unit_price_ht, // default = catalog, overridable
    vat_rate: product.vat_rate, // snapshot
    quantity,
    discount_percent: discount,
    position: count ?? 0,
  });
  if (error) return { error: error.message };

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { error: null };
}

export async function updateOrderLine(lineId: string, fd: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const { data: line } = await supabase.from("order_lines").select("order_id").eq("id", lineId).single();
  if (!line) return { error: "Ligne introuvable." };
  const state = await loadState(supabase, line.order_id);
  if (!state || !LINE_EDITABLE_STATES.includes(state))
    return { error: "Les lignes ne sont modifiables qu'en Brouillon ou Confirmée." };

  const quantity = num(fd, "quantity");
  if (quantity === null || quantity <= 0) return { error: "La quantité doit être positive." };
  const discount = num(fd, "discount_percent") ?? 0;
  if (discount < 0 || discount > 100) return { error: "La remise doit être comprise entre 0 et 100." };
  const price = num(fd, "unit_price_ht");
  if (price === null || price < 0) return { error: "Le prix doit être positif." };

  const { error } = await supabase
    .from("order_lines")
    .update({ quantity, discount_percent: discount, unit_price_ht: price })
    .eq("id", lineId);
  if (error) return { error: error.message };

  revalidatePath(`/orders/${line.order_id}`);
  revalidatePath("/orders");
  return { error: null };
}

export async function removeOrderLine(lineId: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const { data: line } = await supabase.from("order_lines").select("order_id").eq("id", lineId).single();
  if (!line) return { error: "Ligne introuvable." };
  const state = await loadState(supabase, line.order_id);
  if (!state || !LINE_EDITABLE_STATES.includes(state))
    return { error: "Les lignes ne sont modifiables qu'en Brouillon ou Confirmée." };

  const { error } = await supabase.from("order_lines").delete().eq("id", lineId);
  if (error) return { error: error.message };

  revalidatePath(`/orders/${line.order_id}`);
  revalidatePath("/orders");
  return { error: null };
}

// --- State transitions ------------------------------------------------------

export async function confirmOrder(orderId: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const state = await loadState(supabase, orderId);
  if (!state) return { error: "Commande introuvable." };
  if (!TRANSITIONS[state].includes("confirmee"))
    return { error: "Transition non autorisée depuis cet état." };

  const { count } = await supabase
    .from("order_lines")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if (!count) return { error: "Impossible de confirmer une commande sans ligne." };

  // FUTURE HOOK (module Stock, reporté) : vérifier la disponibilité ici. No-op à l'étape 1.

  const { data: reference, error: refErr } = await supabase.rpc("next_order_reference");
  if (refErr || !reference) return { error: "Échec de l'attribution du numéro de commande." };

  // Compare-and-swap on state prevents a double-confirm from burning two numbers on one order.
  const { data: updated, error } = await supabase
    .from("orders")
    .update({ state: "confirmee", reference, confirmed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("state", "brouillon")
    .select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "La commande a déjà été confirmée." };

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { error: null };
}

export async function cancelOrder(orderId: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const state = await loadState(supabase, orderId);
  if (!state) return { error: "Commande introuvable." };
  if (!TRANSITIONS[state].includes("annulee"))
    return { error: "Une commande ne peut être annulée que depuis Brouillon ou Confirmée." };

  const { data: updated, error } = await supabase
    .from("orders")
    .update({ state: "annulee" })
    .eq("id", orderId)
    .eq("state", state)
    .select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "L'état de la commande a changé, réessayez." };

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { error: null };
}

// Linear forward transitions (préparation → livrée → facturée → payée).
export async function setOrderState(orderId: string, next: OrderState) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const state = await loadState(supabase, orderId);
  if (!state) return { error: "Commande introuvable." };
  if (!TRANSITIONS[state].includes(next)) return { error: "Transition non autorisée." };

  // Confirmation assigns the number; cancellation has its own guard — delegate to them.
  if (next === "confirmee") return confirmOrder(orderId);
  if (next === "annulee") return cancelOrder(orderId);

  const { data: updated, error } = await supabase
    .from("orders")
    .update({ state: next })
    .eq("id", orderId)
    .eq("state", state)
    .select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "L'état de la commande a changé, réessayez." };

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { error: null };
}

// Physical delete — drafts only. Beyond Brouillon, use cancellation.
export async function deleteOrder(orderId: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase n'est pas configuré." };

  const { data, error } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId)
    .eq("state", "brouillon")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Seules les commandes en brouillon peuvent être supprimées." };

  revalidatePath("/orders");
  return { error: null };
}
