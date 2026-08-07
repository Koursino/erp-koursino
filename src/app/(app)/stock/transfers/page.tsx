import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, SetupNotice } from "@/components/ui";
import type { Driver, Product, StockTransfer, Warehouse } from "@/lib/types";
import { TransferList, type LevelRow } from "./transfers";

export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Transfers" />
        <SetupNotice />
      </>
    );
  }

  const [transfersRes, warehousesRes, driversRes, productsRes, levelsRes] = await Promise.all([
    supabase
      .from("stock_transfers")
      .select(
        "*, " +
          // Two foreign keys to the same table, so each embed names its constraint.
          "from_warehouse:warehouses!stock_transfers_from_warehouse_id_fkey(id, code, name), " +
          "to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(id, code, name), " +
          "stock_transfer_lines(*, products(id, sku, name, attributes_summary))"
      )
      .order("created_at", { ascending: false }),
    supabase.from("warehouses").select("id, code, name").eq("is_active", true).order("name"),
    supabase.from("drivers").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("products")
      .select("id, sku, name, attributes_summary")
      .eq("is_active", true)
      .order("sku"),
    supabase.from("stock_levels").select("product_id, warehouse_id, quantity"),
  ]);

  // The concatenated select string defeats supabase-js's literal-type parsing,
  // so the embedded shape is asserted here instead.
  const transfers = (transfersRes.data ?? []) as unknown as StockTransfer[];
  const warehouses = (warehousesRes.data ?? []) as Pick<Warehouse, "id" | "code" | "name">[];
  const drivers = (driversRes.data ?? []) as Pick<Driver, "id" | "name">[];
  const products = (productsRes.data ?? []) as Pick<
    Product,
    "id" | "sku" | "name" | "attributes_summary"
  >[];
  const levels = (levelsRes.data ?? []) as LevelRow[];

  return (
    <>
      <PageHeader
        title="Transfers"
        subtitle="Move articles between warehouses — one operation, two movements, always balanced"
      />
      {warehouses.length < 2 && (
        <Card className="mb-4 p-4 text-sm text-zinc-600">
          A transfer needs two warehouses. Create a second one on the{" "}
          <Link href="/stock/warehouses" className="font-medium underline">
            Warehouses
          </Link>{" "}
          page.
        </Card>
      )}
      <TransferList
        transfers={transfers}
        warehouses={warehouses}
        drivers={drivers}
        products={products}
        levels={levels}
      />
    </>
  );
}
