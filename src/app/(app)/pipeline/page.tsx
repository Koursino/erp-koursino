import { createClient } from "@/lib/supabase/server";
import { PageHeader, SetupNotice } from "@/components/ui";
import type { Deal, DealStage } from "@/lib/types";
import { Kanban } from "./kanban";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Pipeline" />
        <SetupNotice />
      </>
    );
  }

  const [stagesRes, dealsRes, companiesRes, contactsRes] = await Promise.all([
    supabase.from("deal_stages").select("*").order("position"),
    supabase
      .from("deals")
      .select("*, companies(id, name)")
      .order("created_at", { ascending: false }),
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("contacts").select("id, first_name, last_name, company_id").order("last_name"),
  ]);

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle="Drag deals between stages — changes are saved automatically"
      />
      <Kanban
        stages={(stagesRes.data ?? []) as DealStage[]}
        deals={(dealsRes.data ?? []) as Deal[]}
        companies={companiesRes.data ?? []}
        contacts={contactsRes.data ?? []}
      />
    </>
  );
}
