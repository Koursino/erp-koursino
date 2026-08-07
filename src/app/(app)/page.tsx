import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, SetupNotice, Badge } from "@/components/ui";
import type { Activity, Deal, DealStage } from "@/lib/types";

export const dynamic = "force-dynamic";

const fmtMoney = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

export default async function DashboardPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <SetupNotice />
      </>
    );
  }

  const [companies, contacts, stagesRes, dealsRes, activitiesRes, productsRes, levelsRes] =
    await Promise.all([
      supabase.from("companies").select("id", { count: "exact", head: true }),
      supabase.from("contacts").select("id", { count: "exact", head: true }),
      supabase.from("deal_stages").select("*"),
      supabase.from("deals").select("*"),
      supabase
        .from("activities")
        .select("*, companies(id, name), deals(id, title)")
        .order("created_at", { ascending: false })
        .limit(6),
      supabase.from("products").select("id, min_stock").eq("is_active", true),
      supabase.from("stock_levels").select("product_id, quantity"),
    ]);

  const stages = (stagesRes.data ?? []) as DealStage[];
  const deals = (dealsRes.data ?? []) as Deal[];
  const activities = (activitiesRes.data ?? []) as Activity[];

  const closedStageIds = new Set(stages.filter((s) => s.is_won || s.is_lost).map((s) => s.id));
  const wonStageIds = new Set(stages.filter((s) => s.is_won).map((s) => s.id));
  const openDeals = deals.filter((d) => !closedStageIds.has(d.stage_id));
  const pipelineValue = openDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const wonValue = deals
    .filter((d) => wonStageIds.has(d.stage_id))
    .reduce((sum, d) => sum + (d.value ?? 0), 0);

  const stockProducts = (productsRes.data ?? []) as { id: string; min_stock: number }[];
  const stockLevels = (levelsRes.data ?? []) as { product_id: string; quantity: number }[];
  const unitsByProduct = new Map<string, number>();
  for (const level of stockLevels) {
    unitsByProduct.set(level.product_id, (unitsByProduct.get(level.product_id) ?? 0) + level.quantity);
  }
  const lowStockCount = stockProducts.filter(
    (p) => p.min_stock > 0 && (unitsByProduct.get(p.id) ?? 0) <= p.min_stock
  ).length;

  const stats = [
    { label: "Companies", value: companies.count ?? 0, href: "/companies" },
    { label: "Contacts", value: contacts.count ?? 0, href: "/contacts" },
    { label: "Open deals", value: openDeals.length, href: "/pipeline" },
    { label: "Pipeline value", value: fmtMoney(pipelineValue), href: "/pipeline" },
    { label: "Won (total)", value: fmtMoney(wonValue), href: "/pipeline" },
    { label: "Articles", value: stockProducts.length, href: "/products" },
    {
      label: "Units in stock",
      value: [...unitsByProduct.values()].reduce((a, b) => a + b, 0),
      href: "/stock",
    },
    { label: "Low stock", value: lowStockCount, href: "/stock" },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Koursino CRM and stock at a glance" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="p-5 transition-shadow hover:shadow-md">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{s.label}</p>
              <p className="mt-2 text-2xl font-semibold">{s.value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Recent activity
      </h2>
      {activities.length === 0 ? (
        <p className="text-sm text-zinc-500">No activity yet. Log calls, emails and notes from the Activities page.</p>
      ) : (
        <Card>
          <ul className="divide-y divide-zinc-100">
            {activities.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                <Badge tone="blue">{a.type}</Badge>
                <span className="text-sm font-medium">{a.subject}</span>
                <span className="text-sm text-zinc-500">
                  {a.deals?.title ?? a.companies?.name ?? ""}
                </span>
                <span className="ml-auto text-xs text-zinc-400">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
