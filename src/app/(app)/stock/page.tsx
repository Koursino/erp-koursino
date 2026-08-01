import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, SetupNotice } from "@/components/ui";
import { ExportPdfLink } from "@/components/export-pdf-link";
import { loadColorLabels } from "@/lib/product-colors";
import {
  buildQuantityIndex,
  parseStockFilters,
  stockColumns,
  stockFilterQuery,
  stockTotalFor,
  stockVisibleProducts,
} from "@/lib/reports";
import type { Product, StockLevel, Warehouse } from "@/lib/types";
import { ManualEntryButton } from "./adjust-stock";

export const dynamic = "force-dynamic";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string; q?: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Stock" />
        <SetupNotice />
      </>
    );
  }

  const filters = parseStockFilters(await searchParams);
  const { warehouse: warehouseFilter, q } = filters;

  const [warehousesRes, productsRes, levelsRes, colorById] = await Promise.all([
    supabase.from("warehouses").select("*").eq("is_active", true).order("name"),
    supabase
      .from("products")
      .select("*, companies(id, name, code)")
      .eq("is_active", true)
      .order("sku"),
    supabase.from("stock_levels").select("product_id, warehouse_id, quantity"),
    // No ids: the page lists every active article, and hundreds of UUIDs in an
    // `.in()` would risk a 414.
    loadColorLabels(supabase),
  ]);

  const warehouses = (warehousesRes.data ?? []) as Warehouse[];
  const products = (productsRes.data ?? []) as Product[];
  const levels = (levelsRes.data ?? []) as Pick<
    StockLevel,
    "product_id" | "warehouse_id" | "quantity"
  >[];

  // quantity[productId][warehouseId]
  const quantity = buildQuantityIndex(levels);
  const columns = stockColumns(warehouses, filters);
  const visible = stockVisibleProducts(products, quantity, filters, colorById);

  const totalFor = (productId: string, scope: Warehouse[]) =>
    stockTotalFor(quantity, productId, scope);

  const totalUnits = products.reduce((sum, p) => sum + totalFor(p.id, columns), 0);
  const lowStock = products.filter(
    (p) => p.min_stock > 0 && totalFor(p.id, warehouses) <= p.min_stock
  );
  const stockValue = products.reduce(
    (sum, p) => sum + totalFor(p.id, columns) * (p.purchase_price ?? 0),
    0
  );

  const productOptions = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    attributes_summary: p.attributes_summary,
  }));
  const warehouseOptions = warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }));

  const exportQs = stockFilterQuery(filters);

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Quantities per article and per warehouse, derived from the movement ledger"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportPdfLink href={`/print/report/stock${exportQs ? `?${exportQs}` : ""}`} />
            <ManualEntryButton
              products={productOptions}
              warehouses={warehouseOptions}
              warehouseId={warehouseFilter || undefined}
            />
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Articles" value={products.length} href="/stock/products" />
        <Stat label="Warehouses" value={warehouses.length} href="/stock/warehouses" />
        <Stat label="Units in stock" value={totalUnits} />
        <Stat
          label="Stock value (cost)"
          value={new Intl.NumberFormat("en-IE", {
            style: "currency",
            currency: "EUR",
            maximumFractionDigits: 0,
          }).format(stockValue)}
        />
      </div>

      {lowStock.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            {lowStock.length} article{lowStock.length > 1 ? "s" : ""} at or below the low-stock
            threshold
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {lowStock.map((p) => (
              <li key={p.id} className="rounded-full bg-white px-3 py-1 text-xs">
                <span className="font-mono">{p.sku}</span>
                <span className="ml-2 text-zinc-500">
                  {totalFor(p.id, warehouses)} / min {p.min_stock}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="warehouse" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
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
          <label htmlFor="q" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Search
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="SKU, nom, fournisseur…" className="w-64" />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {(warehouseFilter || q) && (
          <Link href="/stock" className="pb-2 text-sm text-zinc-500 underline">
            Reset
          </Link>
        )}
      </form>

      {warehouses.length === 0 ? (
        <EmptyState
          title="No warehouse yet"
          hint="Stock is always counted per warehouse — create one first."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing to show"
          hint={
            warehouseFilter
              ? "This warehouse holds none of the matching articles."
              : "Create articles, then receive a purchase order or post a manual entry."
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Article</th>
                <th className="px-5 py-3 font-medium">Couleur</th>
                {columns.map((w) => (
                  <th key={w.id} className="px-5 py-3 text-right font-medium">
                    {w.code}
                  </th>
                ))}
                <th className="px-5 py-3 text-right font-medium">Total</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visible.map((p) => {
                const total = totalFor(p.id, columns);
                const low = p.min_stock > 0 && totalFor(p.id, warehouses) <= p.min_stock;
                return (
                  <tr key={p.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-3 font-mono text-xs font-medium">{p.sku}</td>
                    <td className="px-5 py-3">
                      {/* Colour has its own column now — showing productLabel() here
                          would print it twice on the same row. */}
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-xs text-zinc-500">{p.companies?.name}</span>
                      {low && (
                        <span className="ml-2">
                          <Badge tone="amber">low</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{colorById.get(p.id) ?? "—"}</td>
                    {columns.map((w) => {
                      const qty = quantity.get(p.id)?.get(w.id) ?? 0;
                      return (
                        <td
                          key={w.id}
                          className={
                            qty === 0 ? "px-5 py-3 text-right text-zinc-300" : "px-5 py-3 text-right"
                          }
                        >
                          {qty}
                        </td>
                      );
                    })}
                    <td className="px-5 py-3 text-right font-semibold">{total}</td>
                    <td className="px-5 py-3 text-right">
                      <ManualEntryButton
                        products={productOptions}
                        warehouses={warehouseOptions}
                        productId={p.id}
                        warehouseId={warehouseFilter || undefined}
                        label="Adjust"
                        variant="ghost"
                      />
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

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const card = (
    <Card className="p-5 transition-shadow hover:shadow-md">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}
