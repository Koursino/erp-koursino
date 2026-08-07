import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, SetupNotice } from "@/components/ui";
import type { Company, Deal, Driver, Order, ProductRef, Warehouse } from "@/lib/types";
import { OrderList, type LevelRow } from "./sales-orders";

export const dynamic = "force-dynamic";

export default async function SalesOrdersPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Commandes clients" />
        <SetupNotice />
      </>
    );
  }

  const [ordersRes, customersRes, warehousesRes, driversRes, productsRes, dealsRes, levelsRes] =
    await Promise.all([
      supabase
        .from("orders")
        .select(
          "*, companies(id, name), warehouses(id, code, name), " +
            "order_lines(*, products(id, sku, name, attributes_summary))"
        )
        .order("created_at", { ascending: false }),
      supabase.from("companies").select("id, name").eq("is_customer", true).order("name"),
      supabase.from("warehouses").select("id, code, name").eq("is_active", true).order("name"),
      supabase.from("drivers").select("id, name").eq("is_active", true).order("name"),
      supabase
        .from("products")
        .select("id, sku, name, attributes_summary")
        .eq("is_active", true)
        .order("sku"),
      supabase.from("deals").select("id, title").order("created_at", { ascending: false }),
      supabase.from("stock_levels").select("product_id, warehouse_id, quantity"),
    ]);

  // The concatenated select string defeats supabase-js's literal-type parsing,
  // so the embedded shape is asserted here instead.
  const orders = ((ordersRes.data ?? []) as unknown as Order[]).map((o) => ({
    ...o,
    order_lines: [...(o.order_lines ?? [])].sort((a, b) => a.position - b.position),
  }));
  const customers = (customersRes.data ?? []) as Pick<Company, "id" | "name">[];
  const warehouses = (warehousesRes.data ?? []) as Pick<Warehouse, "id" | "code" | "name">[];
  const drivers = (driversRes.data ?? []) as Pick<Driver, "id" | "name">[];
  const products = (productsRes.data ?? []) as ProductRef[];
  const deals = (dealsRes.data ?? []) as Pick<Deal, "id" | "title">[];
  const levels = (levelsRes.data ?? []) as LevelRow[];

  return (
    <>
      <PageHeader
        title="Commandes clients"
        subtitle="Engagements de vente — le stock est décrémenté uniquement à la livraison"
      />
      {(customers.length === 0 || products.length === 0) && (
        <Card className="mb-4 p-4 text-sm text-zinc-600">
          Il faut au moins un{" "}
          <Link href="/companies" className="font-medium underline">
            client
          </Link>{" "}
          et un{" "}
          <Link href="/products" className="font-medium underline">
            article
          </Link>
          .
        </Card>
      )}
      <OrderList
        orders={orders}
        customers={customers}
        warehouses={warehouses}
        drivers={drivers}
        products={products}
        deals={deals}
        levels={levels}
      />
    </>
  );
}
