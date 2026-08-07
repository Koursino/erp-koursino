import { createClient } from "@/lib/supabase/server";
import { PageHeader, SetupNotice } from "@/components/ui";
import { ViewToggle, parseView } from "@/components/view-toggle";
import type { Deal, DealStage } from "@/lib/types";
import { Kanban } from "./kanban";
import { DealFilters } from "./deal-filters";
import { DealList, parseDealSort, parseDir } from "./deal-list";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    stage?: string;
    company?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Pipeline" />
        <SetupNotice />
      </>
    );
  }

  const view = parseView(sp.view);

  const [stagesRes, dealsRes, companiesRes, contactsRes] = await Promise.all([
    supabase.from("deal_stages").select("*").order("position"),
    supabase
      .from("deals")
      .select("*, companies(id, name)")
      .order("created_at", { ascending: false }),
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("contacts").select("id, first_name, last_name, company_id").order("last_name"),
  ]);

  const stages = (stagesRes.data ?? []) as DealStage[];
  const deals = (dealsRes.data ?? []) as Deal[];
  const companies = companiesRes.data ?? [];

  // Filters apply to the list only: the kanban's columns ARE the stages, and
  // hiding cards from it would make the board misrepresent the pipeline.
  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = deals.filter(
    (d) =>
      (!q || d.title.toLowerCase().includes(q)) &&
      (!sp.stage || d.stage_id === sp.stage) &&
      (!sp.company || d.company_id === sp.company)
  );

  const filterQuery = new URLSearchParams(
    Object.entries({ q: sp.q, stage: sp.stage, company: sp.company }).filter(
      ([, value]) => value
    ) as [string, string][]
  ).toString();

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle={
          view === "kanban"
            ? "Glissez les opportunités entre les étapes — l'enregistrement est automatique"
            : "Cliquez un en-tête de colonne pour trier"
        }
        action={<ViewToggle view={view} basePath="/pipeline" query={filterQuery} />}
      />

      {view === "list" ? (
        <>
          <DealFilters stages={stages} companies={companies} />
          <DealList
            deals={filtered}
            stages={stages}
            sort={parseDealSort(sp.sort)}
            dir={parseDir(sp.dir)}
            query={filterQuery}
          />
        </>
      ) : (
        <Kanban
          stages={stages}
          deals={deals}
          companies={companies}
          contacts={contactsRes.data ?? []}
        />
      )}
    </>
  );
}
