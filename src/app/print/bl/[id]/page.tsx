import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";
import { fmtDate, fmtQty } from "@/lib/format";
import { loadColorLabels } from "@/lib/product-colors";
import { DELIVERY_KIND_LABEL, type Company, type DeliveryNote, type StockMovement } from "@/lib/types";

export const dynamic = "force-dynamic";

// Bon de livraison — printable A4 page; the browser's "Print → Save as PDF"
// produces the file, so no PDF library is involved (same as the purchase order).
//
// Unlike the order-derived note it replaces, this document is built from the
// MOVEMENTS attached to the delivery, so a partial shipment prints exactly what
// left the warehouse. It covers both kinds: a customer delivery (001-DB/2026)
// and a warehouse transfer (002-US-DB/2026).

export default async function DeliveryNotePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return <div className="p-10 text-sm text-zinc-600">Supabase n&apos;est pas configuré.</div>;
  }

  const { data } = await supabase
    .from("delivery_notes")
    .select(
      "*, drivers(id, name, phone), " +
        "from_warehouse:warehouses!delivery_notes_from_warehouse_id_fkey(id, code, name), " +
        "to_warehouse:warehouses!delivery_notes_to_warehouse_id_fkey(id, code, name), " +
        "orders(id, reference, company_id), stock_transfers(id, reference)"
    )
    .eq("id", id)
    .single();
  if (!data) notFound();

  const delivery = data as unknown as DeliveryNote;

  // Only the outgoing side of a transfer is listed: the incoming movement is
  // the same goods arriving, and printing both would double every quantity.
  const { data: movementRows } = await supabase
    .from("stock_movements")
    .select("*, products(id, sku, name, attributes_summary)")
    .eq("delivery_id", id)
    .lt("quantity", 0)
    .order("created_at");
  const movements = (movementRows ?? []) as unknown as StockMovement[];

  const productIds = [...new Set(movements.map((m) => m.product_id))];
  const [{ data: productRows }, colorById] = await Promise.all([
    productIds.length
      ? supabase.from("products").select("id, unit").in("id", productIds)
      : Promise.resolve({ data: [] }),
    loadColorLabels(supabase, productIds),
  ]);
  const unitById = new Map(
    ((productRows ?? []) as { id: string; unit: string }[]).map((p) => [p.id, p.unit])
  );

  // The consignee: the reseller for a sale, the destination warehouse for a transfer.
  let customer: Company | null = null;
  if (delivery.orders?.company_id) {
    const { data: companyRow } = await supabase
      .from("companies")
      .select("*")
      .eq("id", delivery.orders.company_id)
      .single();
    customer = (companyRow as Company | null) ?? null;
  }

  const totalQty = movements.reduce((sum, m) => sum + Math.abs(Number(m.quantity)), 0);

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
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">BON DE LIVRAISON</h1>
            <p className="mt-1 font-mono text-sm text-zinc-600">{delivery.reference}</p>
            <p className="mt-2 text-xs text-zinc-500">
              {DELIVERY_KIND_LABEL[delivery.kind]}
              {delivery.orders?.reference && ` — commande n° ${delivery.orders.reference}`}
              {delivery.stock_transfers?.reference &&
                ` — transfert ${delivery.stock_transfers.reference}`}
            </p>
          </div>
        </div>

        {/* Parties + dates */}
        <div className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Livré à</p>
            {customer ? (
              <>
                <p className="mt-1 font-medium text-zinc-900">{customer.name}</p>
                {customer.address && <p className="text-zinc-600">{customer.address}</p>}
                {(customer.city || customer.country) && (
                  <p className="text-zinc-600">
                    {[customer.city, customer.country].filter(Boolean).join(", ")}
                  </p>
                )}
                {customer.phone && <p className="text-zinc-600">{customer.phone}</p>}
                {customer.email && <p className="text-zinc-600">{customer.email}</p>}
              </>
            ) : (
              <p className="mt-1 font-medium text-zinc-900">
                {delivery.to_warehouse
                  ? `${delivery.to_warehouse.name} (${delivery.to_warehouse.code})`
                  : "—"}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="inline-block text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Date de livraison
              </p>
              <p className="mt-1 text-zinc-900">{fmtDate(delivery.delivered_at)}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Expédié depuis
              </p>
              <p className="mt-1 text-zinc-900">
                {delivery.from_warehouse
                  ? `${delivery.from_warehouse.name} (${delivery.from_warehouse.code})`
                  : "—"}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Livreur
              </p>
              <p className="mt-1 text-zinc-900">
                {delivery.drivers?.name ?? "—"}
                {delivery.drivers?.phone && (
                  <span className="text-zinc-500"> · {delivery.drivers.phone}</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Lines — a delivery note carries quantities, not prices (those belong on the invoice). */}
        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-3 font-semibold">Désignation</th>
              <th className="py-2 px-3 font-semibold">SKU</th>
              <th className="py-2 px-3 font-semibold">Couleur</th>
              <th className="py-2 px-3 text-right font-semibold">Qté livrée</th>
              <th className="py-2 pl-3 text-left font-semibold">Unité</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-b border-zinc-100">
                <td className="py-2 pr-3">{m.products?.name ?? "—"}</td>
                <td className="py-2 px-3 font-mono text-xs text-zinc-500">
                  {m.products?.sku ?? "—"}
                </td>
                <td className="py-2 px-3 text-zinc-600">{colorById.get(m.product_id) ?? "—"}</td>
                <td className="py-2 px-3 text-right font-medium tabular-nums">
                  {fmtQty(Math.abs(Number(m.quantity)))}
                </td>
                <td className="py-2 pl-3 text-zinc-600">{unitById.get(m.product_id) ?? "—"}</td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-zinc-400">
                  Aucune ligne
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-300">
              <td colSpan={3} className="py-3 pr-3 text-right font-medium text-zinc-500">
                Total livré
              </td>
              <td className="py-3 px-3 text-right text-base font-bold text-zinc-900">
                {fmtQty(totalQty)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>

        {delivery.note && (
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">{delivery.note}</p>
          </div>
        )}

        {/* Signatures — a delivery note is proof of receipt. */}
        <div className="mt-12 grid grid-cols-2 gap-8 break-inside-avoid">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Signature du livreur
            </p>
            <p className="text-sm text-zinc-600">{delivery.drivers?.name ?? ""}</p>
            <div className="mt-2 h-24 rounded border border-zinc-300" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {delivery.kind === "transfer"
                ? "Signature du responsable de l'entrepôt"
                : "Signature et cachet du client"}
            </p>
            <div className="mt-2 h-24 rounded border border-zinc-300" />
            <p className="mt-1 text-[11px] text-zinc-400">
              Précédée de la mention « Reçu conforme »
            </p>
          </div>
        </div>

        <p className="mt-10 text-center text-[11px] text-zinc-400">
          Bon de livraison {delivery.reference} — généré par Koursino ERP
        </p>
      </div>
    </div>
  );
}
