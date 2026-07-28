import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";
import type { StockLevel, Warehouse } from "@/lib/types";
import { NewWarehouseButton, WarehouseRowActions } from "./warehouse-form";

export const dynamic = "force-dynamic";

export default async function WarehousesPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Warehouses" />
        <SetupNotice />
      </>
    );
  }

  const [warehousesRes, levelsRes] = await Promise.all([
    supabase.from("warehouses").select("*").order("name"),
    supabase.from("stock_levels").select("warehouse_id, quantity"),
  ]);

  const warehouses = (warehousesRes.data ?? []) as Warehouse[];
  const levels = (levelsRes.data ?? []) as Pick<StockLevel, "warehouse_id" | "quantity">[];

  const totals = new Map<string, { units: number; skus: number }>();
  for (const level of levels) {
    const entry = totals.get(level.warehouse_id) ?? { units: 0, skus: 0 };
    entry.units += level.quantity;
    if (level.quantity > 0) entry.skus += 1;
    totals.set(level.warehouse_id, entry);
  }

  return (
    <>
      <PageHeader
        title="Warehouses"
        subtitle="Every article lives in a warehouse — stock is always counted per warehouse"
        action={<NewWarehouseButton />}
      />
      {warehouses.length === 0 ? (
        <EmptyState title="No warehouses yet" hint="Create one before adding articles or receiving stock." />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Articles in stock</th>
                <th className="px-5 py-3 font-medium">Units</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {warehouses.map((w) => {
                const total = totals.get(w.id) ?? { units: 0, skus: 0 };
                return (
                  <tr key={w.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-3 font-mono text-xs font-medium">{w.code}</td>
                    <td className="px-5 py-3 font-medium">{w.name}</td>
                    <td className="px-5 py-3 text-zinc-600">
                      {[w.city, w.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{total.skus}</td>
                    <td className="px-5 py-3 font-medium">{total.units}</td>
                    <td className="px-5 py-3">
                      <span className="flex gap-1">
                        {w.is_default && <Badge tone="blue">default</Badge>}
                        {!w.is_active && <Badge tone="red">inactive</Badge>}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <WarehouseRowActions warehouse={w} />
                    </td>
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
