import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";
import { ExportPdfLink } from "@/components/export-pdf-link";
import { fmtDate } from "@/lib/format";
import { REPORT_ROW_LIMIT } from "@/lib/reports";
import { DELIVERY_KIND_LABEL, type DeliveryNote } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; warehouse?: string; driver?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Bons de livraison" />
        <SetupNotice />
      </>
    );
  }

  let query = supabase
    .from("delivery_notes")
    .select(
      "*, drivers(id, name, phone), " +
        // Two foreign keys to the same table, so each embed names its constraint.
        "from_warehouse:warehouses!delivery_notes_from_warehouse_id_fkey(id, code, name), " +
        "to_warehouse:warehouses!delivery_notes_to_warehouse_id_fkey(id, code, name), " +
        "orders(id, reference, company_id), stock_transfers(id, reference)"
    )
    .order("delivered_at", { ascending: false });
  if (sp.kind) query = query.eq("kind", sp.kind);
  if (sp.warehouse) query = query.eq("from_warehouse_id", sp.warehouse);
  if (sp.driver) query = query.eq("driver_id", sp.driver);

  const { data } = await query.range(0, REPORT_ROW_LIMIT - 1);
  // The concatenated select string defeats supabase-js's literal-type parsing,
  // so the embedded shape is asserted here instead.
  const deliveries = (data ?? []) as unknown as DeliveryNote[];

  const kindHref = (kind: string) => {
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    const qs = params.toString();
    return qs ? `/stock/deliveries?${qs}` : "/stock/deliveries";
  };

  return (
    <>
      <PageHeader
        title="Bons de livraison"
        subtitle="Numérotation annuelle unique : 001-DB/2026 pour une sortie client, 002-US-DB/2026 pour un transfert"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { value: "", label: "Tous" },
          { value: "customer", label: "Livraisons clients" },
          { value: "transfer", label: "Transferts" },
        ].map((option) => (
          <Link
            key={option.value || "all"}
            href={kindHref(option.value)}
            className={
              (sp.kind ?? "") === option.value
                ? "rounded-full bg-zinc-900 px-3 py-1 text-sm font-medium text-white"
                : "rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
            }
          >
            {option.label}
          </Link>
        ))}
      </div>

      {deliveries.length === 0 ? (
        <EmptyState
          title="Aucun bon de livraison"
          hint="Livrez une commande client ou exécutez un transfert : le BL est créé automatiquement."
        />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">N° BL</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Trajet</th>
                <th className="px-5 py-3 font-medium">Document</th>
                <th className="px-5 py-3 font-medium">Livreur</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {deliveries.map((d) => (
                <tr key={d.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-3 font-mono text-xs font-medium">{d.reference}</td>
                  <td className="px-5 py-3">
                    <Badge tone={d.kind === "transfer" ? "blue" : "green"}>
                      {DELIVERY_KIND_LABEL[d.kind]}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-zinc-600">
                    {d.from_warehouse?.code ?? "—"}
                    {d.to_warehouse && ` → ${d.to_warehouse.code}`}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-600">
                    {d.orders?.reference ?? d.stock_transfers?.reference ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{d.drivers?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-zinc-600">{fmtDate(d.delivered_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <ExportPdfLink href={`/print/bl/${d.id}`} label="Bon de livraison" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
