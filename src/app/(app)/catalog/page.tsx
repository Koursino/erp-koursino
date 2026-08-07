import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, SetupNotice, cn } from "@/components/ui";
import { loadColorLabels } from "@/lib/product-colors";
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
        <PageHeader title="Catalogue fournisseur" />
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
  const products = (productsRes.data ?? []) as { id: string; name: string; sku: string }[];

  let query = supabase
    .from("supplier_catalog")
    .select("*, products(id, name, sku, unit), companies:supplier_id(id, name)")
    .order("created_at", { ascending: false });
  if (supplierFilter) query = query.eq("supplier_id", supplierFilter);
  const { data } = await query;
  const entries = (data ?? []) as SupplierCatalogEntry[];

  // A colour is an article of its own, so pricing a supplier line means picking
  // the coloured article — show which one, here and in the form. Deactivated
  // articles still appear on existing lines, hence the union.
  const colorById = await loadColorLabels(supabase, [
    ...new Set([...products.map((p) => p.id), ...entries.map((e) => e.product_id)]),
  ]);
  const productOptions = products.map((p) => ({ ...p, color: colorById.get(p.id) ?? null }));

  return (
    <>
      <PageHeader
        title="Catalogue fournisseur"
        subtitle="Ce que chaque fournisseur nous propose, à quel prix d'achat et sous quel délai"
        action={
          <NewCatalogEntryButton
            suppliers={suppliers}
            products={productOptions}
            defaultSupplierId={supplierFilter}
          />
        }
      />

      {suppliers.length === 0 ? (
        <EmptyState
          title="Aucun fournisseur"
          hint="Cochez « fournisseur » sur une société, et créez des articles, avant de bâtir le catalogue."
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
              Tous les fournisseurs
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
            <EmptyState
              title="Aucune ligne de catalogue"
              hint="Ajoutez le premier article que ce fournisseur nous vend."
            />
          ) : (
            <Card>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-5 py-3 font-medium">Article</th>
                    <th className="px-5 py-3 font-medium">Couleur</th>
                    {!supplierFilter && <th className="px-5 py-3 font-medium">Fournisseur</th>}
                    <th className="px-5 py-3 font-medium">Réf. fournisseur</th>
                    <th className="px-5 py-3 font-medium">Prix d&apos;achat</th>
                    <th className="px-5 py-3 font-medium">Délai</th>
                    <th className="px-5 py-3 font-medium">Qté mini</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-zinc-50">
                      <td className="px-5 py-3 font-medium">
                        <span className="flex items-center gap-2">
                          {e.products?.name ?? "—"}
                          {e.is_preferred && <Badge tone="green">préféré</Badge>}
                        </span>
                        <span className="font-mono text-xs text-zinc-400">
                          {e.products?.sku ?? ""}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-600">
                        {(e.product_id && colorById.get(e.product_id)) || "—"}
                      </td>
                      {!supplierFilter && <td className="px-5 py-3 text-zinc-600">{e.companies?.name ?? "—"}</td>}
                      <td className="px-5 py-3 text-zinc-600">{e.supplier_ref ?? "—"}</td>
                      <td className="px-5 py-3 text-zinc-800">
                        {e.unit_price != null ? (
                          <>
                            {fmtMoney(e.unit_price, e.currency)}
                            <span className="text-zinc-400"> / {e.products?.unit ?? "unité"}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-600">
                        {e.lead_time_days != null ? `${e.lead_time_days} j` : "—"}
                      </td>
                      <td className="px-5 py-3 text-zinc-600">{e.min_order_qty}</td>
                      <td className="px-5 py-3">
                        <CatalogRowActions entry={e} suppliers={suppliers} products={productOptions} />
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
