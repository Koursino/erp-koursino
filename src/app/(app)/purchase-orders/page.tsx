import { createClient } from "@/lib/supabase/server";
import { PageHeader, SetupNotice } from "@/components/ui";
import type { PurchaseOrder, PurchaseOrderLine } from "@/lib/types";
import { PurchaseOrderKanban } from "./po-kanban";
import { NewPurchaseOrderButton } from "./new-po-button";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Bons de commande" />
        <SetupNotice />
      </>
    );
  }

  const [ordersRes, suppliersRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("*, companies:supplier_id(id, name), purchase_order_lines(quantity, unit_price)")
      .order("created_at", { ascending: false }),
    supabase.from("companies").select("id, name").eq("is_supplier", true).order("name"),
  ]);

  const orders = ((ordersRes.data ?? []) as (PurchaseOrder & {
    purchase_order_lines: Pick<PurchaseOrderLine, "quantity" | "unit_price">[];
  })[]).map((o) => ({
    ...o,
    total: (o.purchase_order_lines ?? []).reduce(
      (sum, l) => sum + Number(l.quantity) * Number(l.unit_price),
      0
    ),
  }));

  const suppliers = suppliersRes.data ?? [];

  return (
    <>
      <PageHeader
        title="Bons de commande"
        subtitle="Suivi des achats — glissez une carte entre les statuts (devis → confirmé → commandé → réceptionné → facturé)"
        action={<NewPurchaseOrderButton suppliers={suppliers} />}
      />
      {suppliers.length === 0 && (
        <p className="mb-4 text-sm text-amber-700">
          Marquez d&apos;abord au moins une entreprise comme « supplier » dans Companies pour créer un bon de commande.
        </p>
      )}
      <PurchaseOrderKanban orders={orders} />
    </>
  );
}
