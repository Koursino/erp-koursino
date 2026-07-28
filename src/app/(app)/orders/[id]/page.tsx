import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader, SetupNotice } from "@/components/ui";
import { formatDhs } from "@/lib/format";
import { BL_ELIGIBLE_STATES, ORDER_STATES, type Order, type OrderLine } from "@/lib/types";
import { OrderActions, OrderHeaderCard } from "./order-header";
import { OrderLinesEditor } from "./order-lines-editor";

export const dynamic = "force-dynamic";

type ProductOption = { id: string; name: string; unit_price_ht: number; vat_rate: number };
type CompanyOption = { id: string; name: string };
type DealOption = { id: string; title: string };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Next 16: params is a Promise
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Commande" />
        <SetupNotice />
      </>
    );
  }

  const { data: orderRow } = await supabase
    .from("orders")
    .select("*, companies(id, name), deals(id, title)")
    .eq("id", id)
    .single();
  if (!orderRow) notFound();
  const order = orderRow as Order;

  const [{ data: lineRows }, { data: productRows }, { data: companyRows }, { data: dealRows }] =
    await Promise.all([
      supabase.from("order_lines").select("*").eq("order_id", id).order("position"),
      supabase
        .from("products")
        .select("id, name, unit_price_ht, vat_rate")
        .eq("is_active", true)
        .order("name"),
      supabase.from("companies").select("id, name").order("name"),
      supabase.from("deals").select("id, title").order("created_at", { ascending: false }),
    ]);

  const lines = (lineRows ?? []) as OrderLine[];
  const products = (productRows ?? []) as ProductOption[];
  const companies = (companyRows ?? []) as CompanyOption[];
  const deals = (dealRows ?? []) as DealOption[];

  const meta = ORDER_STATES.find((x) => x.value === order.state);

  return (
    <>
      <div className="mb-6">
        <Link href="/orders" className="text-sm text-zinc-500 hover:underline">
          ← Commandes
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-zinc-900">
              {order.reference ?? "Nouvelle commande"}
            </h1>
            <Badge tone={meta?.tone}>{meta?.label ?? order.state}</Badge>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-2">
            {/* A delivery note can be issued once the goods have shipped. */}
            {BL_ELIGIBLE_STATES.includes(order.state) && (
              <Link
                href={`/print/delivery-note/${order.id}`}
                target="_blank"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
              >
                Bon de livraison (PDF)
              </Link>
            )}
            <OrderActions order={order} hasLines={lines.length > 0} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <OrderHeaderCard order={order} companies={companies} deals={deals} />
          <OrderLinesEditor order={order} lines={lines} products={products} />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-zinc-700">Totaux</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Total HT</dt>
                <dd className="tabular-nums">{formatDhs(order.total_ht)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">TVA</dt>
                <dd className="tabular-nums">{formatDhs(order.total_tva)}</dd>
              </div>
              <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-semibold">
                <dt>Total TTC</dt>
                <dd className="tabular-nums">{formatDhs(order.total_ttc)}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5 text-sm">
            <h3 className="mb-3 text-sm font-semibold text-zinc-700">Suivi</h3>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-zinc-400">Créée le</dt>
                <dd>{new Date(order.created_at).toLocaleDateString("fr-FR")}</dd>
              </div>
              {order.confirmed_at && (
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Confirmée le</dt>
                  <dd>{new Date(order.confirmed_at).toLocaleDateString("fr-FR")}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
