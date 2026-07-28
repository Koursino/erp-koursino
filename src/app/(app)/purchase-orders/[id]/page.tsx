import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, SetupNotice } from "@/components/ui";
import type { PurchaseOrder, PurchaseOrderLine, SupplierCatalogEntry } from "@/lib/types";
import { PurchaseOrderDetail } from "./po-detail";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Achat" />
        <SetupNotice />
      </>
    );
  }

  const { data: order } = await supabase
    .from("purchase_orders")
    .select("*, companies:supplier_id(id, name), purchase_order_lines(*)")
    .eq("id", id)
    .single();

  if (!order) notFound();
  const po = order as PurchaseOrder & { purchase_order_lines: PurchaseOrderLine[] };
  const lines = (po.purchase_order_lines ?? []).sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)
  );

  // Products this supplier sells us, to add lines with the purchase price pre-filled.
  const catalogRes = po.supplier_id
    ? await supabase
        .from("supplier_catalog")
        .select("*, products(id, name, sku, unit)")
        .eq("supplier_id", po.supplier_id)
    : { data: [] };

  const suppliersRes = await supabase
    .from("companies")
    .select("id, name")
    .eq("is_supplier", true)
    .order("name");

  return (
    <>
      <div className="mb-4">
        <Link href="/purchase-orders" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Bons de commande
        </Link>
      </div>
      <PurchaseOrderDetail
        order={po}
        lines={lines}
        catalog={(catalogRes.data ?? []) as SupplierCatalogEntry[]}
        suppliers={suppliersRes.data ?? []}
      />
    </>
  );
}
