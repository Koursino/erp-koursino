import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BL_ELIGIBLE_STATES, ORDER_STATES, type Company, type Order, type OrderLine } from "@/lib/types";
import { loadColorLabels } from "@/lib/product-colors";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

// A delivery note (bon de livraison) rendered as a printable A4 page.
// The browser's "Print → Save as PDF" produces the PDF, so no PDF library or
// serverless binary is needed.
//
// Numbering: derived 1:1 from the order reference (BL-KRS-YYYY-NNNNN) so the document
// is unique and traceable today. The future deliveries module will introduce real BL
// records (with their own sequence and partial-delivery support) and replace this.

export default async function DeliveryNotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return <div className="p-10 text-sm text-zinc-600">Supabase n&apos;est pas configuré.</div>;
  }

  const { data } = await supabase
    .from("orders")
    .select("*, companies(*)")
    .eq("id", id)
    .single();
  if (!data) notFound();

  const order = data as Order & { companies: Company | null };
  const customer = order.companies;

  // A delivery note only makes sense once the goods have shipped.
  if (!BL_ELIGIBLE_STATES.includes(order.state)) {
    const label = ORDER_STATES.find((s) => s.value === order.state)?.label ?? order.state;
    return (
      <div className="mx-auto max-w-lg p-10 text-sm text-zinc-700">
        <h1 className="text-lg font-semibold text-zinc-900">Bon de livraison indisponible</h1>
        <p className="mt-2">
          Cette commande est au statut « {label} ». Le bon de livraison n&apos;est éditable qu&apos;à partir du
          statut « Livrée ».
        </p>
      </div>
    );
  }

  const { data: lineRows } = await supabase
    .from("order_lines")
    .select("*")
    .eq("order_id", id)
    .order("position");
  const lines = (lineRows ?? []) as OrderLine[];

  // Sales units and colours live on the catalog (order lines snapshot price, not unit)
  // — fetch them for display only.
  const productIds = [...new Set(lines.map((l) => l.product_id))];
  const [{ data: productRows }, colorById] = await Promise.all([
    productIds.length
      ? supabase.from("products").select("id, unit").in("id", productIds)
      : Promise.resolve({ data: [] }),
    loadColorLabels(supabase, productIds),
  ]);
  const unitById = new Map(
    ((productRows ?? []) as { id: string; unit: string }[]).map((p) => [p.id, p.unit])
  );

  // Partial-delivery tracking is not driven yet (qty_delivered defaults to 0): until the
  // deliveries module lands, a delivered order ships the full ordered quantity.
  const deliveredQty = (l: OrderLine) =>
    Number(l.qty_delivered) > 0 ? Number(l.qty_delivered) : Number(l.quantity);

  const fmtQty = (n: number) =>
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n);
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
  const totalQty = lines.reduce((s, l) => s + deliveredQty(l), 0);

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
            <p className="mt-1 font-mono text-sm text-zinc-600">
              {order.reference ? `BL-${order.reference}` : "—"}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Commande n° {order.reference ?? "—"} du {fmtDate(order.order_date)}
            </p>
          </div>
        </div>

        {/* Parties + dates */}
        <div className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Livré à</p>
            <p className="mt-1 font-medium text-zinc-900">{customer?.name ?? "—"}</p>
            {customer?.address && <p className="text-zinc-600">{customer.address}</p>}
            {(customer?.city || customer?.country) && (
              <p className="text-zinc-600">
                {[customer?.city, customer?.country].filter(Boolean).join(", ")}
              </p>
            )}
            {customer?.phone && <p className="text-zinc-600">{customer.phone}</p>}
            {customer?.email && <p className="text-zinc-600">{customer.email}</p>}
          </div>
          <div className="text-right">
            <div className="inline-block text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Date de livraison
              </p>
              <p className="mt-1 text-zinc-900">{new Date().toLocaleDateString("fr-FR")}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Nombre de lignes
              </p>
              <p className="mt-1 text-zinc-900">{lines.length}</p>
            </div>
          </div>
        </div>

        {/* Lines — a delivery note carries quantities, not prices (those belong on the invoice). */}
        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-3 font-semibold">Désignation</th>
              <th className="py-2 px-3 font-semibold">Couleur</th>
              <th className="py-2 px-3 text-right font-semibold">Qté commandée</th>
              <th className="py-2 px-3 text-right font-semibold">Qté livrée</th>
              <th className="py-2 pl-3 text-left font-semibold">Unité</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-zinc-100">
                <td className="py-2 pr-3">{l.description}</td>
                <td className="py-2 px-3 text-zinc-600">{colorById.get(l.product_id) ?? "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums text-zinc-500">
                  {fmtQty(Number(l.quantity))}
                </td>
                <td className="py-2 px-3 text-right font-medium tabular-nums">{fmtQty(deliveredQty(l))}</td>
                <td className="py-2 pl-3 text-zinc-600">{unitById.get(l.product_id) ?? "—"}</td>
              </tr>
            ))}
            {lines.length === 0 && (
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

        {order.notes && (
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">{order.notes}</p>
          </div>
        )}

        {/* Signatures — a delivery note is proof of receipt. */}
        <div className="mt-12 grid grid-cols-2 gap-8 break-inside-avoid">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Signature du livreur
            </p>
            <div className="mt-2 h-24 rounded border border-zinc-300" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Signature et cachet du client
            </p>
            <div className="mt-2 h-24 rounded border border-zinc-300" />
            <p className="mt-1 text-[11px] text-zinc-400">Précédée de la mention « Reçu conforme »</p>
          </div>
        </div>

        <p className="mt-10 text-center text-[11px] text-zinc-400">
          Bon de livraison généré par Koursino ERP
        </p>
      </div>
    </div>
  );
}
