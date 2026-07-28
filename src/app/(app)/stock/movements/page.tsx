import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, EmptyState, PageHeader, Select, SetupNotice } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { productLabel, type StockMovement, type Warehouse } from "@/lib/types";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, { label: string; tone: "green" | "red" | "blue" | "amber" }> = {
  reception: { label: "Reception", tone: "green" },
  delivery: { label: "Delivery", tone: "red" },
  transfer_in: { label: "Transfer in", tone: "blue" },
  transfer_out: { label: "Transfer out", tone: "blue" },
  adjustment: { label: "Manual entry", tone: "amber" },
  return: { label: "Return", tone: "amber" },
};

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string; reason?: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Stock movements" />
        <SetupNotice />
      </>
    );
  }

  const { warehouse: warehouseFilter = "", reason: reasonFilter = "" } = await searchParams;

  let query = supabase
    .from("stock_movements")
    .select(
      "*, products(id, sku, name, attributes_summary), warehouses(id, code, name)"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (warehouseFilter) query = query.eq("warehouse_id", warehouseFilter);
  if (reasonFilter) query = query.eq("reason", reasonFilter);

  const [movementsRes, warehousesRes] = await Promise.all([
    query,
    supabase.from("warehouses").select("id, code, name").order("name"),
  ]);

  const movements = (movementsRes.data ?? []) as StockMovement[];
  const warehouses = (warehousesRes.data ?? []) as Pick<Warehouse, "id" | "code" | "name">[];

  return (
    <>
      <PageHeader
        title="Stock movements"
        subtitle="Append-only ledger — every quantity in the ERP traces back to a line here"
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="warehouse"
            className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Warehouse
          </label>
          <Select id="warehouse" name="warehouse" defaultValue={warehouseFilter} className="w-56">
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label
            htmlFor="reason"
            className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Type
          </label>
          <Select id="reason" name="reason" defaultValue={reasonFilter} className="w-48">
            <option value="">All types</option>
            {Object.entries(REASON_LABELS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {(warehouseFilter || reasonFilter) && (
          <Link href="/stock/movements" className="pb-2 text-sm text-zinc-500 underline">
            Reset
          </Link>
        )}
      </form>

      {movements.length === 0 ? (
        <EmptyState
          title="No movements yet"
          hint="Receive a purchase order, execute a transfer or post a manual entry."
        />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Article</th>
                <th className="px-5 py-3 font-medium">Warehouse</th>
                <th className="px-5 py-3 text-right font-medium">Quantity</th>
                <th className="px-5 py-3 font-medium">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {movements.map((m) => {
                const reason = REASON_LABELS[m.reason] ?? { label: m.reason, tone: "zinc" as const };
                return (
                  <tr key={m.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-3 text-zinc-600">{fmtDate(m.created_at)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={reason.tone}>{reason.label}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs">{m.products?.sku}</span>
                      <span className="ml-2 text-zinc-600">
                        {m.products ? productLabel(m.products) : ""}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{m.warehouses?.name ?? "—"}</td>
                    <td
                      className={
                        m.quantity > 0
                          ? "px-5 py-3 text-right font-semibold text-emerald-700"
                          : "px-5 py-3 text-right font-semibold text-red-700"
                      }
                    >
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="px-5 py-3 text-zinc-500">{m.note ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
