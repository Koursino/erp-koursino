import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";
import { fmtMoney, fmtQty } from "@/lib/format";
import type { Company, Product, ProductAttribute, StockLevel } from "@/lib/types";
import { NewProductButton, ProductRowActions } from "./product-form";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Articles" />
        <SetupNotice />
      </>
    );
  }

  const [productsRes, suppliersRes, attributesRes, levelsRes] = await Promise.all([
    supabase
      .from("products")
      .select("*, companies(id, name, code), product_values(product_id, attribute_id, value_id)")
      .order("sku"),
    supabase.from("companies").select("id, name, code").eq("is_supplier", true).order("name"),
    supabase
      .from("product_attributes")
      .select("*, product_attribute_values(*)")
      .eq("is_active", true)
      .order("position"),
    supabase.from("stock_levels").select("product_id, quantity"),
  ]);

  const products = (productsRes.data ?? []) as Product[];
  const suppliers = (suppliersRes.data ?? []) as Pick<Company, "id" | "name" | "code">[];
  const attributes = ((attributesRes.data ?? []) as ProductAttribute[]).map((a) => ({
    ...a,
    product_attribute_values: [...(a.product_attribute_values ?? [])].sort(
      (x, y) => x.position - y.position || x.label.localeCompare(y.label)
    ),
  }));
  const levels = (levelsRes.data ?? []) as Pick<StockLevel, "product_id" | "quantity">[];

  const totals = new Map<string, number>();
  for (const level of levels) {
    totals.set(level.product_id, (totals.get(level.product_id) ?? 0) + level.quantity);
  }

  return (
    <>
      <PageHeader
        title="Articles"
        subtitle="Catalogue — assignez un fournisseur à un article pour activer son SKU structuré"
        action={<NewProductButton suppliers={suppliers} attributes={attributes} />}
      />

      {products.length === 0 ? (
        <EmptyState title="Aucun article" hint="Créez-en un avec « Nouvel article »." />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Article</th>
                <th className="px-5 py-3 font-medium">Attributs</th>
                <th className="px-5 py-3 font-medium">Fournisseur</th>
                <th className="px-5 py-3 text-right font-medium">En stock</th>
                <th className="px-5 py-3 text-right font-medium">Prix HT</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {products.map((p) => {
                const total = totals.get(p.id) ?? 0;
                const low = p.min_stock > 0 && total <= p.min_stock;
                return (
                  <tr key={p.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-3 font-mono text-xs font-medium">{p.sku}</td>
                    <td className="px-5 py-3 font-medium">
                      {p.name}
                      {!p.is_active && (
                        <span className="ml-2">
                          <Badge tone="zinc">inactif</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{p.attributes_summary ?? "—"}</td>
                    <td className="px-5 py-3 text-zinc-600">{p.companies?.name ?? "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={low ? "font-medium text-amber-700" : "font-medium"}>
                        {fmtQty(total)}
                      </span>
                      {p.min_stock > 0 && (
                        <span className="ml-1 text-xs text-zinc-400">/ min {fmtQty(p.min_stock)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-600">
                      {fmtMoney(p.unit_price_ht, p.currency)}
                    </td>
                    <td className="px-5 py-3">
                      <ProductRowActions product={p} suppliers={suppliers} attributes={attributes} />
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
