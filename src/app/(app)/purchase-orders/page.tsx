import { createClient } from "@/lib/supabase/server";
import { PageHeader, SetupNotice } from "@/components/ui";
import { ExportPdfLink } from "@/components/export-pdf-link";
import { loadColorLabels } from "@/lib/product-colors";
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
      .select(
        "*, companies:supplier_id(id, name), purchase_order_lines(product_id, quantity, unit_price)"
      )
      .order("created_at", { ascending: false }),
    supabase.from("companies").select("id, name").eq("is_supplier", true).order("name"),
  ]);

  const rows = (ordersRes.data ?? []) as (PurchaseOrder & {
    purchase_order_lines: Pick<PurchaseOrderLine, "product_id" | "quantity" | "unit_price">[];
  })[];

  // One lookup for the whole board; the kanban is a client component and cannot
  // reach the server-only helper itself.
  const colorById = await loadColorLabels(
    supabase,
    [
      ...new Set(
        rows.flatMap((o) =>
          (o.purchase_order_lines ?? []).map((l) => l.product_id).filter((id): id is string => !!id)
        )
      ),
    ]
  );

  const orders = rows.map((o) => {
    const lines = o.purchase_order_lines ?? [];
    return {
      ...o,
      total: lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0),
      colors: [
        ...new Set(
          lines
            .map((l) => (l.product_id ? colorById.get(l.product_id) : undefined))
            .filter((c): c is string => !!c)
        ),
      ].sort((a, b) => a.localeCompare(b, "fr")),
    };
  });

  const suppliers = suppliersRes.data ?? [];

  return (
    <>
      <PageHeader
        title="Bons de commande"
        subtitle="Suivi des achats — glissez une carte entre les statuts (devis → confirmé → commandé → réceptionné → facturé)"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportPdfLink href="/print/report/purchases" />
            <NewPurchaseOrderButton suppliers={suppliers} />
          </div>
        }
      />
      {suppliers.length === 0 && (
        <p className="mb-4 text-sm text-amber-700">
          Marquez d&apos;abord au moins une entreprise comme « supplier » dans Companies pour créer un achat.
        </p>
      )}
      <PurchaseOrderKanban orders={orders} />
    </>
  );
}
