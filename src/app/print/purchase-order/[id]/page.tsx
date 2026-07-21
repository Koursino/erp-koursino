import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  purchaseOrderStatusLabel,
  type Company,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from "@/lib/types";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return <div className="p-10 text-sm text-zinc-600">Supabase n&apos;est pas configuré.</div>;
  }

  const { data: order } = await supabase
    .from("purchase_orders")
    .select("*, companies:supplier_id(*), purchase_order_lines(*)")
    .eq("id", id)
    .single();

  if (!order) notFound();
  const po = order as PurchaseOrder & {
    companies: Company | null;
    purchase_order_lines: PurchaseOrderLine[];
  };
  const lines = (po.purchase_order_lines ?? []).sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)
  );
  const supplier = po.companies;

  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: po.currency }).format(n);
  const total = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0);
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("fr-FR") : "—";

  return (
    <div className="min-h-screen bg-zinc-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <PrintButton />
      </div>
      <div className="mx-auto max-w-[210mm] bg-white p-[18mm] text-sm text-zinc-800 shadow print:max-w-none print:p-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-300 pb-6">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">
              K
            </div>
            <p className="mt-2 text-lg font-semibold text-zinc-900">Koursino</p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">BON DE COMMANDE</h1>
            <p className="mt-1 font-mono text-sm text-zinc-600">{po.reference ?? "—"}</p>
            <p className="mt-2 text-xs text-zinc-500">
              Statut : {purchaseOrderStatusLabel(po.status)}
            </p>
          </div>
        </div>

        {/* Parties + dates */}
        <div className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Fournisseur</p>
            <p className="mt-1 font-medium text-zinc-900">{supplier?.name ?? "—"}</p>
            {supplier?.address && <p className="text-zinc-600">{supplier.address}</p>}
            {(supplier?.city || supplier?.country) && (
              <p className="text-zinc-600">
                {[supplier?.city, supplier?.country].filter(Boolean).join(", ")}
              </p>
            )}
            {supplier?.email && <p className="text-zinc-600">{supplier.email}</p>}
            {supplier?.phone && <p className="text-zinc-600">{supplier.phone}</p>}
          </div>
          <div className="text-right">
            <div className="inline-block text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Date</p>
              <p className="mt-1 text-zinc-900">{fmtDate(po.order_date)}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Livraison attendue
              </p>
              <p className="mt-1 text-zinc-900">{fmtDate(po.expected_date)}</p>
            </div>
          </div>
        </div>

        {/* Lines */}
        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-3 font-semibold">Désignation</th>
              <th className="py-2 px-3 text-right font-semibold">Qté</th>
              <th className="py-2 px-3 text-right font-semibold">Prix unitaire</th>
              <th className="py-2 pl-3 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-zinc-100">
                <td className="py-2 pr-3">{l.description}</td>
                <td className="py-2 px-3 text-right tabular-nums">{l.quantity}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmt(Number(l.unit_price))}</td>
                <td className="py-2 pl-3 text-right tabular-nums">
                  {fmt(Number(l.quantity) * Number(l.unit_price))}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-zinc-400">
                  Aucune ligne
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-300">
              <td colSpan={3} className="py-3 pr-3 text-right font-medium text-zinc-500">
                Total
              </td>
              <td className="py-3 pl-3 text-right text-base font-bold text-zinc-900">{fmt(total)}</td>
            </tr>
          </tfoot>
        </table>

        {po.notes && (
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">{po.notes}</p>
          </div>
        )}

        <p className="mt-16 text-center text-[11px] text-zinc-400">
          Bon de commande généré par Koursino ERP
        </p>
      </div>
    </div>
  );
}
