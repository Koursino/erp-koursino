import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, SetupNotice } from "@/components/ui";
import type { Company, ProductRef, PurchaseOrder, Warehouse } from "@/lib/types";
import { PurchaseOrderList } from "./purchase-orders";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Commandes fournisseur" />
        <SetupNotice />
      </>
    );
  }

  const [ordersRes, suppliersRes, warehousesRes, productsRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "*, companies(id, name), warehouses(id, code, name), " +
          "purchase_order_lines(*, products(id, sku, name, attributes_summary))"
      )
      .order("created_at", { ascending: false }),
    supabase.from("companies").select("id, name").eq("is_supplier", true).order("name"),
    supabase.from("warehouses").select("id, code, name").eq("is_active", true).order("name"),
    supabase
      .from("products")
      .select("id, sku, name, attributes_summary")
      .eq("is_active", true)
      .order("sku"),
  ]);

  // The concatenated select string defeats supabase-js's literal-type parsing,
  // so the embedded shape is asserted here instead.
  const orders = (ordersRes.data ?? []) as unknown as PurchaseOrder[];
  const suppliers = (suppliersRes.data ?? []) as Pick<Company, "id" | "name">[];
  const warehouses = (warehousesRes.data ?? []) as Pick<Warehouse, "id" | "code" | "name">[];
  const products = (productsRes.data ?? []) as ProductRef[];

  return (
    <>
      <PageHeader
        title="Commandes fournisseur"
        subtitle="Stock acheté — rien n'entre en stock avant la réception de la marchandise"
      />
      {(suppliers.length === 0 || warehouses.length === 0 || products.length === 0) && (
        <Card className="mb-4 p-4 text-sm text-zinc-600">
          Il faut au moins un{" "}
          <Link href="/companies" className="font-medium underline">
            fournisseur
          </Link>
          , un{" "}
          <Link href="/stock/warehouses" className="font-medium underline">
            entrepôt
          </Link>{" "}
          et un{" "}
          <Link href="/stock/products" className="font-medium underline">
            article
          </Link>
          .
        </Card>
      )}
      <PurchaseOrderList
        orders={orders}
        suppliers={suppliers}
        warehouses={warehouses}
        products={products}
      />
    </>
  );
}
