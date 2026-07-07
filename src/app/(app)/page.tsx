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

  const [companies, contacts, stagesRes, dealsRes, activitiesRes] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("deal_stages").select("*"),
    supabase.from("deals").select("*"),
    supabase
      .from("activities")
      .select("*, companies(id, name), deals(id, title)")
      .order("created_at", { ascending: false })
      .limit(6),
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

  const stats = [
    { label: "Companies", value: companies.count ?? 0, href: "/companies" },
    { label: "Contacts", value: contacts.count ?? 0, href: "/contacts" },
    { label: "Open deals", value: openDeals.length, href: "/pipeline" },
    { label: "Pipeline value", value: fmtMoney(pipelineValue), href: "/pipeline" },
    { label: "Won (total)", value: fmtMoney(wonValue), href: "/pipeline" },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Koursino CRM at a glance" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
