import Link from "next/link";
import { Badge, Card, EmptyState, cn } from "@/components/ui";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { Deal, DealStage } from "@/lib/types";

const COLUMNS = [
  { key: "title", label: "Opportunité", align: "left" },
  { key: "company", label: "Société", align: "left" },
  { key: "stage", label: "Étape", align: "left" },
  { key: "expected_close_date", label: "Clôture prévue", align: "left" },
  { key: "value", label: "Montant", align: "right" },
] as const;

export type DealSortKey = (typeof COLUMNS)[number]["key"];
export type SortDir = "asc" | "desc";

export const parseDealSort = (value: string | undefined): DealSortKey =>
  COLUMNS.some((c) => c.key === value) ? (value as DealSortKey) : "stage";

export const parseDir = (value: string | undefined): SortDir => (value === "desc" ? "desc" : "asc");

export function DealList({
  deals,
  stages,
  sort,
  dir,
  query,
}: {
  deals: Deal[];
  stages: DealStage[];
  sort: DealSortKey;
  dir: SortDir;
  /** Current filters + view, so a sort click keeps them. */
  query: string;
}) {
  const stageById = new Map(stages.map((s) => [s.id, s]));

  const compare = (a: Deal, b: Deal): number => {
    switch (sort) {
      case "title":
        return a.title.localeCompare(b.title, "fr");
      case "company":
        return (a.companies?.name ?? "").localeCompare(b.companies?.name ?? "", "fr");
      case "value":
        return (a.value ?? 0) - (b.value ?? 0);
      case "expected_close_date": {
        // Deals without a date sort last whatever the direction.
        const left = a.expected_close_date ?? "";
        const right = b.expected_close_date ?? "";
        if (!left) return 1;
        if (!right) return -1;
        return left.localeCompare(right);
      }
      default: {
        const left = stageById.get(a.stage_id)?.position ?? 0;
        const right = stageById.get(b.stage_id)?.position ?? 0;
        return left - right || a.position - b.position;
      }
    }
  };

  const rows = [...deals].sort((a, b) => {
    const result = compare(a, b);
    return dir === "asc" ? result : -result;
  });

  const sortHref = (key: DealSortKey) => {
    const params = new URLSearchParams(query);
    params.set("view", "list");
    params.set("sort", key);
    // Clicking the active column flips the direction.
    params.set("dir", sort === key && dir === "asc" ? "desc" : "asc");
    return `/pipeline?${params.toString()}`;
  };

  if (rows.length === 0) {
    return (
      <EmptyState title="Aucune opportunité" hint="Modifiez les filtres ou créez une opportunité." />
    );
  }

  const total = rows.reduce((sum, d) => sum + (d.value ?? 0), 0);

  return (
    <Card>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                className={cn("px-5 py-3 font-medium", column.align === "right" && "text-right")}
              >
                <Link
                  href={sortHref(column.key)}
                  className="inline-flex items-center gap-1 hover:text-zinc-900"
                >
                  {column.label}
                  {sort === column.key && (
                    <span aria-hidden className="text-zinc-400">
                      {dir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((deal) => {
            const stage = stageById.get(deal.stage_id);
            return (
              <tr key={deal.id} className="hover:bg-zinc-50">
                <td className="px-5 py-3 font-medium">{deal.title}</td>
                <td className="px-5 py-3 text-zinc-600">{deal.companies?.name ?? "—"}</td>
                <td className="px-5 py-3">
                  <Badge tone={stage?.is_won ? "green" : stage?.is_lost ? "red" : "zinc"}>
                    {stage?.name ?? "—"}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-zinc-600">{fmtDate(deal.expected_close_date)}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {deal.value != null ? fmtMoney(deal.value, deal.currency) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-200 text-sm">
            <td className="px-5 py-3 font-medium text-zinc-500" colSpan={4}>
              {rows.length} opportunité{rows.length > 1 ? "s" : ""}
            </td>
            <td className="px-5 py-3 text-right font-semibold tabular-nums">{fmtMoney(total)}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
