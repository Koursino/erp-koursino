import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";
import type { Activity } from "@/lib/types";
import { NewActivityButton, ActivityRowControls } from "./activity-components";

export const dynamic = "force-dynamic";

const typeTone = { call: "blue", email: "blue", meeting: "amber", note: "zinc", task: "green" } as const;

export default async function ActivitiesPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Activities" />
        <SetupNotice />
      </>
    );
  }

  const [activitiesRes, companiesRes, dealsRes] = await Promise.all([
    supabase
      .from("activities")
      .select("*, companies(id, name), deals(id, title)")
      .order("created_at", { ascending: false }),
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("deals").select("id, title").order("created_at", { ascending: false }),
  ]);
  const activities = (activitiesRes.data ?? []) as Activity[];
  const companies = (companiesRes.data ?? []).map((c) => ({ id: c.id, label: c.name }));
  const deals = (dealsRes.data ?? []).map((d) => ({ id: d.id, label: d.title }));

  return (
    <>
      <PageHeader
        title="Activities"
        subtitle="Calls, emails, meetings, notes and tasks"
        action={<NewActivityButton companies={companies} deals={deals} />}
      />
      {activities.length === 0 ? (
        <EmptyState title="No activity logged yet" hint="Keep the history of every customer interaction here." />
      ) : (
        <Card>
          <ul className="divide-y divide-zinc-100">
            {activities.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                <Badge tone={typeTone[a.type]}>{a.type}</Badge>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${a.done ? "text-zinc-400 line-through" : ""}`}>
                    {a.subject}
                  </p>
                  {a.content && <p className="mt-0.5 text-sm text-zinc-500">{a.content}</p>}
                  <p className="mt-1 text-xs text-zinc-400">
                    {[a.companies?.name, a.deals?.title].filter(Boolean).join(" · ")}
                    {a.due_date && ` · due ${new Date(a.due_date).toLocaleString()}`}
                    {` · ${new Date(a.created_at).toLocaleDateString()}`}
                  </p>
                </div>
                <ActivityRowControls activity={a} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
