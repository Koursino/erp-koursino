import { createClient } from "@/lib/supabase/server";
import { ReportSheet } from "@/components/report-sheet";
import { fmtDate, fmtMoney, fmtQty } from "@/lib/format";
import { loadColorLabels } from "@/lib/product-colors";
import {
  applyPurchaseFilters,
  describePurchaseFilters,
  parsePurchaseFilters,
  REPORT_ROW_LIMIT,
} from "@/lib/reports";
import {
  PURCHASE_ORDER_STATUSES,
  purchaseOrderStatusLabel,
  type Product,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from "@/lib/types";

export const dynamic = "force-dynamic";

// État des achats — printable A4 landscape.
// Two blocks: a per-status summary mirroring the kanban columns, then the
// line-level detail, which is where the Couleur column belongs.

type PoWithLines = PurchaseOrder & { purchase_order_lines: PurchaseOrderLine[] };

export default async function PurchasesReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; supplier?: string; from?: string; to?: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) {
    return <div className="p-10 text-sm text-zinc-600">Supabase n&apos;est pas configuré.</div>;
  }

  // Same filters as the /purchase-orders screen, so a printed report can never
  // list rows the board hides.
  const filters = parsePurchaseFilters(await searchParams);

  const [{ data }, supplierRes] = await Promise.all([
    applyPurchaseFilters(
      supabase
        .from("purchase_orders")
        .select("*, companies:supplier_id(id, name), purchase_order_lines(*)"),
      filters
    )
      .order("created_at", { ascending: false })
      .range(0, REPORT_ROW_LIMIT - 1),
    // Named even when the filter returns nothing, so the header never prints a UUID.
    filters.supplier
      ? supabase.from("companies").select("name").eq("id", filters.supplier).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const orders = (data ?? []) as PoWithLines[];
  const truncated = orders.length >= REPORT_ROW_LIMIT;

  const productIds = [
    ...new Set(
      orders.flatMap((o) =>
        (o.purchase_order_lines ?? []).map((l) => l.product_id).filter((id): id is string => !!id)
      )
    ),
  ];

  // The line description is a snapshot taken when the line was added and drifts
  // from the catalogue — read SKU and name from products instead.
  const [productsRes, colorById] = await Promise.all([
    productIds.length
      ? supabase.from("products").select("id, sku, name").in("id", productIds)
      : Promise.resolve({ data: [] }),
    loadColorLabels(supabase, productIds),
  ]);
  const productById = new Map(
    ((productsRes.data ?? []) as Pick<Product, "id" | "sku" | "name">[]).map((p) => [p.id, p])
  );

  const lineTotal = (l: PurchaseOrderLine) => Number(l.quantity) * Number(l.unit_price);
  const poTotal = (o: PoWithLines) => (o.purchase_order_lines ?? []).reduce((s, l) => s + lineTotal(l), 0);

  const grandTotal = orders.reduce((s, o) => s + poTotal(o), 0);
  const lineCount = orders.reduce((s, o) => s + (o.purchase_order_lines ?? []).length, 0);

  const recap = PURCHASE_ORDER_STATUSES.map((s) => {
    const rows = orders.filter((o) => o.status === s.key);
    return { label: s.label, count: rows.length, total: rows.reduce((x, o) => x + poTotal(o), 0) };
  }).filter((r) => r.count > 0);

  const sorted = [...orders].sort((a, b) =>
    (b.order_date ?? b.created_at).localeCompare(a.order_date ?? a.created_at)
  );

  return (
    <ReportSheet
      title="ÉTAT DES ACHATS"
      orientation="landscape"
      criteria={describePurchaseFilters(filters, supplierRes.data?.name ?? undefined)}
      meta={[
        { label: "Bons de commande", value: orders.length },
        { label: "Lignes", value: lineCount },
        { label: "Total", value: fmtMoney(grandTotal) },
      ]}
      truncated={truncated}
    >
      {recap.length > 0 && (
        <div className="mt-8 break-inside-avoid">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Synthèse par statut
          </p>
          <table className="mt-2 w-full max-w-lg border-collapse text-sm">
            <tbody>
              {recap.map((r) => (
                <tr key={r.label} className="border-b border-zinc-100">
                  <td className="py-1.5 pr-3">{r.label}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-zinc-500">
                    {r.count} BC
                  </td>
                  <td className="py-1.5 pl-3 text-right font-medium tabular-nums">
                    {fmtMoney(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Détail des achats
      </p>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-3 font-semibold">Référence</th>
            <th className="py-2 px-3 font-semibold">Fournisseur</th>
            <th className="py-2 px-3 font-semibold">Statut</th>
            <th className="py-2 px-3 font-semibold">Date</th>
            <th className="py-2 px-3 font-semibold">SKU</th>
            <th className="py-2 px-3 font-semibold">Article</th>
            <th className="py-2 px-3 font-semibold">Couleur</th>
            <th className="py-2 px-3 text-right font-semibold">Qté</th>
            <th className="py-2 px-3 text-right font-semibold">PU</th>
            <th className="py-2 pl-3 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => {
            const lines = [...(o.purchase_order_lines ?? [])].sort(
              (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)
            );
            if (lines.length === 0) {
              return (
                <tr key={o.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-3 font-mono text-xs">{o.reference ?? "—"}</td>
                  <td className="py-2 px-3">{o.companies?.name ?? "—"}</td>
                  <td className="py-2 px-3 text-zinc-600">{purchaseOrderStatusLabel(o.status)}</td>
                  <td className="py-2 px-3 text-zinc-600">{fmtDate(o.order_date)}</td>
                  <td colSpan={6} className="py-2 px-3 text-zinc-400">
                    Aucune ligne
                  </td>
                </tr>
              );
            }
            const rows = lines.map((l, i) => {
              const product = l.product_id ? productById.get(l.product_id) : undefined;
              return (
                <tr key={l.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-3 font-mono text-xs">{i === 0 ? o.reference ?? "—" : ""}</td>
                  <td className="py-2 px-3">{i === 0 ? o.companies?.name ?? "—" : ""}</td>
                  <td className="py-2 px-3 text-zinc-600">
                    {i === 0 ? purchaseOrderStatusLabel(o.status) : ""}
                  </td>
                  <td className="py-2 px-3 text-zinc-600">{i === 0 ? fmtDate(o.order_date) : ""}</td>
                  <td className="py-2 px-3 font-mono text-xs">{product?.sku ?? "—"}</td>
                  <td className="py-2 px-3">{product?.name ?? l.description}</td>
                  <td className="py-2 px-3 text-zinc-600">
                    {(l.product_id && colorById.get(l.product_id)) || "—"}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtQty(Number(l.quantity))}</td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {fmtMoney(Number(l.unit_price), o.currency)}
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums">
                    {fmtMoney(lineTotal(l), o.currency)}
                  </td>
                </tr>
              );
            });

            if (lines.length > 1) {
              rows.push(
                <tr key={`${o.id}-subtotal`} className="border-b border-zinc-200">
                  <td colSpan={9} className="py-1.5 pr-3 text-right text-xs text-zinc-500">
                    Sous-total {o.reference ?? "—"}
                  </td>
                  <td className="py-1.5 pl-3 text-right text-xs font-semibold tabular-nums">
                    {fmtMoney(poTotal(o), o.currency)}
                  </td>
                </tr>
              );
            }
            return rows;
          })}
          {orders.length === 0 && (
            <tr>
              <td colSpan={10} className="py-4 text-center text-zinc-400">
                Aucun bon de commande
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-zinc-300">
            <td colSpan={9} className="py-3 pr-3 text-right font-medium text-zinc-500">
              Total des achats
            </td>
            <td className="py-3 pl-3 text-right text-base font-bold tabular-nums text-zinc-900">
              {fmtMoney(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </ReportSheet>
  );
}
