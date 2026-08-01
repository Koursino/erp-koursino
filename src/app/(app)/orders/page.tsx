import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";
import { ExportPdfLink } from "@/components/export-pdf-link";
import { formatDhs } from "@/lib/format";
import {
  applySalesFilters,
  hasSalesFilters,
  parseSalesFilters,
  salesFilterQuery,
} from "@/lib/reports";
import { ORDER_STATES, type Order, type OrderState } from "@/lib/types";
import { NewOrderButton } from "./new-order-button";
import { OrderFilters } from "./order-filters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const stateMeta = (s: OrderState) => ORDER_STATES.find((x) => x.value === s);

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; company?: string; from?: string; to?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Commandes" />
        <SetupNotice />
      </>
    );
  }

  const filters = parseSalesFilters(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const rangeFrom = (page - 1) * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  const query = applySalesFilters(
    supabase.from("orders").select("*, companies(id, name)", { count: "exact" }),
    filters
  );

  const { data, count } = await query.order("created_at", { ascending: false }).range(rangeFrom, rangeTo);
  const orders = (data ?? []) as Order[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: companyRows } = await supabase.from("companies").select("id, name").order("name");
  const companies = companyRows ?? [];

  const hasFilters = hasSalesFilters(filters);
  // The export deliberately carries the filters but never `page`: a report covers
  // every matching order, not the 20 rows currently on screen.
  const exportQs = salesFilterQuery(filters);

  const pageHref = (p: number) => {
    const params = new URLSearchParams(exportQs);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/orders?${qs}` : "/orders";
  };

  return (
    <>
      <PageHeader
        title="Commandes"
        subtitle="Commandes revendeurs — de la création à la facturation"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportPdfLink href={`/print/report/sales${exportQs ? `?${exportQs}` : ""}`} />
            <NewOrderButton companies={companies} />
          </div>
        }
      />

      <OrderFilters companies={companies} />

      {orders.length === 0 ? (
        <EmptyState
          title="Aucune commande"
          hint={
            hasFilters
              ? "Aucun résultat pour ces critères."
              : "Créez votre première commande avec « Nouvelle commande »."
          }
        />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">Référence</th>
                <th className="px-5 py-3 font-medium">Revendeur</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 text-right font-medium">Total HT</th>
                <th className="px-5 py-3 text-right font-medium">Total TTC</th>
                <th className="px-5 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders.map((o) => {
                const meta = stateMeta(o.state);
                return (
                  <tr key={o.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-3">
                      <Link href={`/orders/${o.id}`} className="font-mono text-xs font-medium text-zinc-800 hover:underline">
                        {o.reference ?? "— brouillon —"}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{o.companies?.name ?? "—"}</td>
                    <td className="px-5 py-3 text-zinc-600">
                      {new Date(o.order_date).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-zinc-600">
                      {formatDhs(o.total_ht)}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                      {formatDhs(o.total_ttc)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={meta?.tone}>{meta?.label ?? o.state}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
          <span>
            {total} commande{total > 1 ? "s" : ""} · page {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Précédent
              </Link>
            ) : (
              <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-300">Précédent</span>
            )}
            {page < totalPages ? (
              <Link
                href={pageHref(page + 1)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Suivant
              </Link>
            ) : (
              <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-300">Suivant</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
