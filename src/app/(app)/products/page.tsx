import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";
import { formatDhs, fmtQty } from "@/lib/format";
import { loadColorLabels } from "@/lib/product-colors";
import { REPORT_ROW_LIMIT } from "@/lib/reports";
import {
  CATEGORY_ATTRIBUTE_CODE,
  COLOR_ATTRIBUTE_CODE,
  type Company,
  type Product,
  type ProductAttribute,
  type StockLevel,
} from "@/lib/types";
import { NewProductButton, ProductRowActions, ReferenceColorsButton } from "./product-form";
import { ProductFilters } from "./product-filters";

export const dynamic = "force-dynamic";

// References per page. A colour variant is grouped under its reference, so the
// unit of pagination is the reference and never a half-shown family.
const PAGE_SIZE = 20;

export default async function ProductsPage({
  searchParams,
}: {
  // In Next.js 16, searchParams is a Promise and must be awaited.
  searchParams: Promise<{ q?: string; category?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Catalogue" />
        <SetupNotice />
      </>
    );
  }

  const q = (sp.q ?? "").trim();
  const category = sp.category ?? "";
  const status = sp.status ?? ""; // "" | "active" | "inactive"
  const page = Math.max(1, Number(sp.page) || 1);

  // Neutralize characters that would break PostgREST's .or() filter string.
  const safeQ = q.replace(/[%,()*]/g, " ").trim();

  let query = supabase
    .from("products")
    .select("*, companies(id, name, code), product_values(product_id, attribute_id, value_id)");
  if (safeQ) query = query.or(`sku.ilike.%${safeQ}%,name.ilike.%${safeQ}%`);
  if (category) query = query.eq("category", category);
  if (status === "active") query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);

  // The filtered catalogue is loaded in full so variants can be grouped before
  // paging; the ceiling is the one the reports already use.
  const [productsRes, suppliersRes, attributesRes, levelsRes] = await Promise.all([
    query.order("name").order("sku").range(0, REPORT_ROW_LIMIT - 1),
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
  const colorById = await loadColorLabels(
    supabase,
    products.map((p) => p.id)
  );

  const stockByProduct = new Map<string, number>();
  for (const level of levels) {
    stockByProduct.set(
      level.product_id,
      (stockByProduct.get(level.product_id) ?? 0) + level.quantity
    );
  }

  const colorAttribute = attributes.find((a) => a.code === COLOR_ATTRIBUTE_CODE);
  const categoryAttribute = attributes.find((a) => a.code === CATEGORY_ATTRIBUTE_CODE);
  // Managed categories first, plus any legacy value still carried by an article.
  const categories = Array.from(
    new Set([
      ...(categoryAttribute?.product_attribute_values ?? []).map((v) => v.label),
      ...products.map((p) => p.category).filter((c): c is string => Boolean(c)),
    ])
  ).sort((a, b) => a.localeCompare(b, "fr"));

  // One entry per commercial reference; its colour variants follow inside.
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const key = product.variant_group_id ?? product.id;
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  const references = [...groups.values()].sort((a, b) => a[0].name.localeCompare(b[0].name, "fr"));

  const totalPages = Math.max(1, Math.ceil(references.length / PAGE_SIZE));
  const visible = references.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = Boolean(q || category || status);

  // Builds a pagination URL preserving the current filters.
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/products?${qs}` : "/products";
  };

  return (
    <>
      <PageHeader
        title="Catalogue"
        subtitle="Une couleur commercialisée est un article : son SKU, son prix et son stock lui appartiennent"
        action={<NewProductButton suppliers={suppliers} attributes={attributes} />}
      />

      <ProductFilters categories={categories} />

      {references.length === 0 ? (
        <EmptyState
          title={hasFilters ? "Aucun article ne correspond" : "Aucun article"}
          hint={
            hasFilters
              ? "Modifiez ou effacez les filtres."
              : "Créez-en un avec « Nouvel article »."
          }
        />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">Photo</th>
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Désignation</th>
                <th className="px-5 py-3 font-medium">Couleur</th>
                <th className="px-5 py-3 font-medium">Catégorie</th>
                <th className="px-5 py-3 font-medium">Fournisseur</th>
                <th className="px-5 py-3 text-right font-medium">En stock</th>
                <th className="px-5 py-3 text-right font-medium">Prix HT</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visible.flatMap((variants) => {
                const reference = variants[0];
                // What the "couleurs commercialisées" dialog opens with: the
                // colours the family currently sells.
                const activeColorValueIds = variants
                  .filter((v) => v.is_active)
                  .flatMap((v) =>
                    (v.product_values ?? [])
                      .filter((pv) => pv.attribute_id === colorAttribute?.id)
                      .map((pv) => pv.value_id)
                  );

                return variants.map((p, index) => {
                  const stock = stockByProduct.get(p.id) ?? 0;
                  const low = p.min_stock > 0 && stock <= p.min_stock;
                  return (
                    <tr
                      key={p.id}
                      className={p.is_active ? "hover:bg-zinc-50" : "bg-zinc-50/60 hover:bg-zinc-50"}
                    >
                      <td className="px-5 py-3">
                        {p.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.photo_url}
                            alt=""
                            loading="lazy"
                            className="h-10 w-10 rounded-md border border-zinc-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-zinc-300 text-[10px] text-zinc-400">
                            —
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-zinc-600">{p.sku}</td>
                      <td className="px-5 py-3 font-medium text-zinc-900">
                        {index > 0 && <span className="mr-1 text-zinc-300">↳</span>}
                        <span className={index > 0 ? "font-normal text-zinc-600" : undefined}>
                          {p.name}
                        </span>
                        {!p.is_active && (
                          <span className="ml-2">
                            <Badge tone="zinc">Inactif</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-600">{colorById.get(p.id) ?? "—"}</td>
                      <td className="px-5 py-3 text-zinc-600">{p.category ?? "—"}</td>
                      <td className="px-5 py-3 text-zinc-600">{p.companies?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-zinc-600">
                        {fmtQty(stock)}
                        {low && (
                          <span className="ml-2">
                            <Badge tone="amber">bas</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-zinc-600">
                        {formatDhs(p.unit_price_ht)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          {index === 0 && (
                            <ReferenceColorsButton
                              product={reference}
                              attributes={attributes}
                              activeColorValueIds={activeColorValueIds}
                            />
                          )}
                          <ProductRowActions
                            product={p}
                            suppliers={suppliers}
                            attributes={attributes}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
          <span>
            {references.length} référence{references.length > 1 ? "s" : ""} · page {page}/
            {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Précédent
              </Link>
            ) : (
              <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-300">
                Précédent
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={pageHref(page + 1)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Suivant
              </Link>
            ) : (
              <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-300">
                Suivant
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
