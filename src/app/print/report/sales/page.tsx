import { createClient } from "@/lib/supabase/server";
import { ReportSheet } from "@/components/report-sheet";
import { fmtDate, formatDhs } from "@/lib/format";
import {
  applySalesFilters,
  describeSalesFilters,
  parseSalesFilters,
  REPORT_ROW_LIMIT,
} from "@/lib/reports";
import { ORDER_STATES, type Order } from "@/lib/types";

export const dynamic = "force-dynamic";

// État des ventes clients — printable A4 portrait.
// Unlike the /orders screen (paginated at 20), the report covers every order
// matching the filters, hence the explicit range instead of a page window.

export default async function SalesReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; company?: string; from?: string; to?: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) {
    return <div className="p-10 text-sm text-zinc-600">Supabase n&apos;est pas configuré.</div>;
  }

  const filters = parseSalesFilters(await searchParams);

  const [{ data }, companyRes] = await Promise.all([
    applySalesFilters(supabase.from("orders").select("*, companies(id, name)"), filters)
      .order("order_date", { ascending: false })
      .range(0, REPORT_ROW_LIMIT - 1),
    // Named even when the filter returns nothing, so the header never prints a UUID.
    filters.company
      ? supabase.from("companies").select("name").eq("id", filters.company).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const orders = (data ?? []) as Order[];
  const truncated = orders.length >= REPORT_ROW_LIMIT;

  const totalHt = orders.reduce((s, o) => s + Number(o.total_ht), 0);
  const totalTtc = orders.reduce((s, o) => s + Number(o.total_ttc), 0);

  // Recap per state, in the lifecycle order rather than by volume.
  const recap = ORDER_STATES.map((s) => {
    const rows = orders.filter((o) => o.state === s.value);
    return { label: s.label, count: rows.length, ttc: rows.reduce((x, o) => x + Number(o.total_ttc), 0) };
  }).filter((r) => r.count > 0);

  const companyName = (companyRes.data as { name: string } | null)?.name;

  return (
    <ReportSheet
      title="ÉTAT DES VENTES CLIENTS"
      criteria={describeSalesFilters(filters, companyName)}
      meta={[
        { label: "Commandes", value: orders.length },
        { label: "Total HT", value: formatDhs(totalHt) },
        { label: "Total TTC", value: formatDhs(totalTtc) },
      ]}
      truncated={truncated}
    >
      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-3 font-semibold">Référence</th>
            <th className="py-2 px-3 font-semibold">Revendeur</th>
            <th className="py-2 px-3 font-semibold">Date</th>
            <th className="py-2 px-3 text-right font-semibold">Total HT</th>
            <th className="py-2 px-3 text-right font-semibold">Total TTC</th>
            <th className="py-2 pl-3 font-semibold">Statut</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-zinc-100">
              <td className="py-2 pr-3 font-mono text-xs">{o.reference ?? "— brouillon —"}</td>
              <td className="py-2 px-3">{o.companies?.name ?? "—"}</td>
              <td className="py-2 px-3 text-zinc-600">{fmtDate(o.order_date)}</td>
              <td className="py-2 px-3 text-right tabular-nums text-zinc-600">
                {formatDhs(o.total_ht)}
              </td>
              <td className="py-2 px-3 text-right font-medium tabular-nums">
                {formatDhs(o.total_ttc)}
              </td>
              <td className="py-2 pl-3 text-zinc-600">
                {ORDER_STATES.find((s) => s.value === o.state)?.label ?? o.state}
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-zinc-400">
                Aucune commande pour ces critères
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-zinc-300">
            <td colSpan={3} className="py-3 pr-3 text-right font-medium text-zinc-500">
              Total
            </td>
            <td className="py-3 px-3 text-right font-semibold tabular-nums">{formatDhs(totalHt)}</td>
            <td className="py-3 px-3 text-right text-base font-bold tabular-nums text-zinc-900">
              {formatDhs(totalTtc)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>

      {recap.length > 0 && (
        <div className="mt-10 break-inside-avoid">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Récapitulatif par statut
          </p>
          <table className="mt-2 w-full max-w-md border-collapse text-sm">
            <tbody>
              {recap.map((r) => (
                <tr key={r.label} className="border-b border-zinc-100">
                  <td className="py-1.5 pr-3">{r.label}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-zinc-500">
                    {r.count} cde{r.count > 1 ? "s" : ""}
                  </td>
                  <td className="py-1.5 pl-3 text-right font-medium tabular-nums">
                    {formatDhs(r.ttc)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportSheet>
  );
}
