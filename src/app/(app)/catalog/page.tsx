import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, SetupNotice, cn } from "@/components/ui";
import type { SupplierCatalogEntry } from "@/lib/types";
import { NewCatalogEntryButton, CatalogRowActions } from "./catalog-form";

export const dynamic = "force-dynamic";

const fmtMoney = (n: number, currency = "MAD") =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(n);

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Supplier catalog" />
        <SetupNotice />
      </>
    );
  }

  const { supplier: supplierFilter } = await searchParams;

  const [suppliersRes, productsRes] = await Promise.all([
    supabase.from("companies").select("id, name").eq("is_supplier", true).order("name"),
    supabase.from("products").select("id, name, sku").eq("is_active", true).order("name"),
  ]);
  const suppliers = suppliersRes.data ?? [];
  const products = productsRes.data ?? [];

  let query = supabase
    .from("supplier_catalog")
    .select("*, products(id, name, sku, unit), companies:supplier_id(id, name)")
    .order("created_at", { ascending: false });
  if (supplierFilter) query = query.eq("supplier_id", supplierFilter);
  const { data } = await query;
  const entries = (data ?? []) as SupplierCatalogEntry[];

  return (
    <>
      <PageHeader
        title="Supplier catalog"
        subtitle="What each supplier offers, at what price and lead time"
        action={
          <NewCatalogEntryButton
            suppliers={suppliers}
            products={products}
            defaultSupplierId={supplierFilter}
          />
        }
      />

      {suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers yet"
          hint="Mark a company as “supplier” in Companies, and add products, before building the catalog."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Link
              href="/catalog"
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium",
                !supplierFilter ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              )}
            >
              All suppliers
            </Link>
            {suppliers.map((s) => (
              <Link
                key={s.id}
                href={`/catalog?supplier=${s.id}`}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium",
                  supplierFilter === s.id
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                )}
              >
                {s.name}
              </Link>
            ))}
          </div>

          {entries.length === 0 ? (
            <EmptyState title="No catalog entries" hint="Add the first product this supplier sells you." />
          ) : (
            <Card>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-5 py-3 font-medium">Product</th>
                    {!supplierFilter && <th className="px-5 py-3 font-medium">Supplier</th>}
                    <th className="px-5 py-3 font-medium">Supplier ref</th>
                    <th className="px-5 py-3 font-medium">Unit price</th>
                    <th className="px-5 py-3 font-medium">Lead time</th>
                    <th className="px-5 py-3 font-medium">Min qty</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-zinc-50">
                      <td className="px-5 py-3 font-medium">
                        <span className="flex items-center gap-2">
                          {e.products?.name ?? "—"}
                          {e.is_preferred && <Badge tone="green">preferred</Badge>}
                        </span>
                      </td>
                      {!supplierFilter && <td className="px-5 py-3 text-zinc-600">{e.companies?.name ?? "—"}</td>}
                      <td className="px-5 py-3 text-zinc-600">{e.supplier_ref ?? "—"}</td>
                      <td className="px-5 py-3 text-zinc-800">
                        {e.unit_price != null ? (
                          <>
                            {fmtMoney(e.unit_price, e.currency)}
                            <span className="text-zinc-400"> / {e.products?.unit ?? "unit"}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-600">
                        {e.lead_time_days != null ? `${e.lead_time_days} d` : "—"}
                      </td>
                      <td className="px-5 py-3 text-zinc-600">{e.min_order_qty}</td>
                      <td className="px-5 py-3">
                        <CatalogRowActions entry={e} suppliers={suppliers} products={products} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </>
  );
}
