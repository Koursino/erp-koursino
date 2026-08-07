import Link from "next/link";
import { Badge, Card, EmptyState, cn } from "@/components/ui";
import { fmtDate, formatDhs, statusTone } from "@/lib/format";
import { purchaseOrderStatusLabel } from "@/lib/types";
import type { KanbanOrder } from "./po-kanban";

// Sortable columns. Sorting happens in JS because the board already loads every
// matching row, and the amount is computed from the lines rather than stored.
const COLUMNS = [
  { key: "reference", label: "Référence", align: "left" },
  { key: "supplier", label: "Fournisseur", align: "left" },
  { key: "status", label: "Statut", align: "left" },
  { key: "order_date", label: "Date", align: "left" },
  { key: "expected_date", label: "Attendu le", align: "left" },
  { key: "total", label: "Montant", align: "right" },
] as const;

export type SortKey = (typeof COLUMNS)[number]["key"];
export type SortDir = "asc" | "desc";

export const parseSort = (value: string | undefined): SortKey =>
  COLUMNS.some((c) => c.key === value) ? (value as SortKey) : "order_date";

export const parseDir = (value: string | undefined): SortDir => (value === "asc" ? "asc" : "desc");

function compare(a: KanbanOrder, b: KanbanOrder, key: SortKey): number {
  switch (key) {
    case "reference":
      return (a.reference ?? "").localeCompare(b.reference ?? "", "fr");
    case "supplier":
      return (a.companies?.name ?? "").localeCompare(b.companies?.name ?? "", "fr");
    case "status":
      return purchaseOrderStatusLabel(a.status).localeCompare(
        purchaseOrderStatusLabel(b.status),
        "fr"
      );
    case "total":
      return a.total - b.total;
    default: {
      // Dates: empty ones sort last whatever the direction.
      const left = a[key] ?? "";
      const right = b[key] ?? "";
      if (!left) return 1;
      if (!right) return -1;
      return left.localeCompare(right);
    }
  }
}

export function PurchaseOrderList({
  orders,
  sort,
  dir,
  query,
}: {
  orders: KanbanOrder[];
  sort: SortKey;
  dir: SortDir;
  /** Current filters + view, so a sort click keeps them. */
  query: string;
}) {
  const rows = [...orders].sort((a, b) => {
    const result = compare(a, b, sort);
    return dir === "asc" ? result : -result;
  });

  const sortHref = (key: SortKey) => {
    const params = new URLSearchParams(query);
    params.set("view", "list");
    params.set("sort", key);
    // Clicking the active column flips the direction.
    params.set("dir", sort === key && dir === "desc" ? "asc" : "desc");
    return `/purchase-orders?${params.toString()}`;
  };

  if (rows.length === 0) {
    return <EmptyState title="Aucun achat" hint="Modifiez les filtres ou créez un nouvel achat." />;
  }

  const total = rows.reduce((sum, o) => sum + o.total, 0);

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
                <Link href={sortHref(column.key)} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  {column.label}
                  {sort === column.key && (
                    <span aria-hidden className="text-zinc-400">
                      {dir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </Link>
              </th>
            ))}
            <th className="px-5 py-3 font-medium">Couleurs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((order) => (
            <tr key={order.id} className="hover:bg-zinc-50">
              <td className="px-5 py-3 font-mono text-xs font-medium">
                <Link href={`/purchase-orders/${order.id}`} className="hover:underline">
                  {order.reference ?? "—"}
                </Link>
              </td>
              <td className="px-5 py-3">{order.companies?.name ?? "—"}</td>
              <td className="px-5 py-3">
                <Badge tone={statusTone(order.status)}>
                  {purchaseOrderStatusLabel(order.status)}
                </Badge>
              </td>
              <td className="px-5 py-3 text-zinc-600">{fmtDate(order.order_date)}</td>
              <td className="px-5 py-3 text-zinc-600">{fmtDate(order.expected_date)}</td>
              <td className="px-5 py-3 text-right tabular-nums">{formatDhs(order.total)}</td>
              <td className="px-5 py-3 text-zinc-600">
                {order.colors.length > 0 ? order.colors.join(", ") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-200 text-sm">
            <td className="px-5 py-3 font-medium text-zinc-500" colSpan={5}>
              {rows.length} achat{rows.length > 1 ? "s" : ""}
            </td>
            <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatDhs(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
