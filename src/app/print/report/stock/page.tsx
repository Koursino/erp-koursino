import { createClient } from "@/lib/supabase/server";
import { ReportSheet } from "@/components/report-sheet";
import { formatDhs, fmtQty } from "@/lib/format";
import { loadColorLabels } from "@/lib/product-colors";
import {
  buildQuantityIndex,
  describeStockFilters,
  parseStockFilters,
  stockColumns,
  stockTotalFor,
  stockVisibleProducts,
} from "@/lib/reports";
import type { Product, StockLevel, Warehouse } from "@/lib/types";

export const dynamic = "force-dynamic";

// État du stock — printable A4 landscape (one column per warehouse gets wide fast).
// Filters come from /stock through the query string so the document matches the screen.

export default async function StockReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string; q?: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) {
    return <div className="p-10 text-sm text-zinc-600">Supabase n&apos;est pas configuré.</div>;
  }

  const filters = parseStockFilters(await searchParams);

  const [warehousesRes, productsRes, levelsRes, colorById] = await Promise.all([
    supabase.from("warehouses").select("*").eq("is_active", true).order("name"),
    supabase
      .from("products")
      .select("*, companies(id, name, code)")
      .eq("is_active", true)
      .order("sku"),
    supabase.from("stock_levels").select("product_id, warehouse_id, quantity"),
    loadColorLabels(supabase),
  ]);

  const warehouses = (warehousesRes.data ?? []) as Warehouse[];
  const products = (productsRes.data ?? []) as Product[];
  const levels = (levelsRes.data ?? []) as Pick<
    StockLevel,
    "product_id" | "warehouse_id" | "quantity"
  >[];

  const quantity = buildQuantityIndex(levels);
  const columns = stockColumns(warehouses, filters);
  const visible = stockVisibleProducts(products, quantity, filters, colorById);

  const totalFor = (productId: string) => stockTotalFor(quantity, productId, columns);
  const warehouseTotal = (w: Warehouse) =>
    visible.reduce((sum, p) => sum + (quantity.get(p.id)?.get(w.id) ?? 0), 0);

  const totalUnits = visible.reduce((sum, p) => sum + totalFor(p.id), 0);
  const stockValue = visible.reduce((sum, p) => sum + totalFor(p.id) * (p.purchase_price ?? 0), 0);

  const warehouseName = warehouses.find((w) => w.id === filters.warehouse)?.name;
  const dense = columns.length > 6;

  return (
    <ReportSheet
      title="ÉTAT DU STOCK"
      orientation="landscape"
      criteria={describeStockFilters(filters, warehouseName)}
      meta={[
        { label: "Articles", value: visible.length },
        { label: "Unités en stock", value: fmtQty(totalUnits) },
        { label: "Valeur (coût)", value: formatDhs(stockValue) },
      ]}
    >
      {dense && (
        <p className="mt-6 text-xs text-zinc-500">
          {columns.length} entrepôts affichés — filtrez par entrepôt pour un document plus lisible.
        </p>
      )}

      <table className={`mt-8 w-full border-collapse ${dense ? "text-[10px]" : "text-sm"}`}>
        <thead>
          <tr className="border-b-2 border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-3 font-semibold">SKU</th>
            <th className="py-2 px-3 font-semibold">Article</th>
            <th className="py-2 px-3 font-semibold">Couleur</th>
            {columns.map((w) => (
              <th key={w.id} className="py-2 px-3 text-right font-semibold">
                {w.code}
              </th>
            ))}
            <th className="py-2 pl-3 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((p) => (
            <tr key={p.id} className="border-b border-zinc-100">
              <td className="py-2 pr-3 font-mono text-xs">{p.sku}</td>
              <td className="py-2 px-3">
                {p.name}
                {p.companies?.name && (
                  <span className="ml-2 text-xs text-zinc-500">{p.companies.name}</span>
                )}
              </td>
              <td className="py-2 px-3 text-zinc-600">{colorById.get(p.id) ?? "—"}</td>
              {columns.map((w) => {
                const qty = quantity.get(p.id)?.get(w.id) ?? 0;
                return (
                  <td
                    key={w.id}
                    className={
                      qty === 0
                        ? "py-2 px-3 text-right tabular-nums text-zinc-300"
                        : "py-2 px-3 text-right tabular-nums"
                    }
                  >
                    {fmtQty(qty)}
                  </td>
                );
              })}
              <td className="py-2 pl-3 text-right font-semibold tabular-nums">
                {fmtQty(totalFor(p.id))}
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={columns.length + 4} className="py-4 text-center text-zinc-400">
                Aucun article pour ces critères
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-zinc-300">
            <td colSpan={3} className="py-3 pr-3 text-right font-medium text-zinc-500">
              Total
            </td>
            {columns.map((w) => (
              <td key={w.id} className="py-3 px-3 text-right font-semibold tabular-nums">
                {fmtQty(warehouseTotal(w))}
              </td>
            ))}
            <td className="py-3 pl-3 text-right text-base font-bold tabular-nums text-zinc-900">
              {fmtQty(totalUnits)}
            </td>
          </tr>
          <tr>
            <td colSpan={columns.length + 3} className="py-2 pr-3 text-right text-zinc-500">
              Valeur du stock (prix d&apos;achat)
            </td>
            <td className="py-2 pl-3 text-right font-semibold tabular-nums">
              {formatDhs(stockValue)}
            </td>
          </tr>
        </tfoot>
      </table>
    </ReportSheet>
  );
}
