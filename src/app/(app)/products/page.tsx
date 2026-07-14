import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";
import { formatDhs } from "@/lib/format";
import type { Product } from "@/lib/types";
import { NewProductButton, ProductRowActions } from "./product-form";
import { ProductFilters } from "./product-filters";

export const dynamic = "force-dynamic";

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
        <PageHeader title="Catalogue Produits" />
        <SetupNotice />
      </>
    );
  }

  const q = (sp.q ?? "").trim();
  const category = sp.category ?? "";
  const status = sp.status ?? ""; // "" | "active" | "inactive"
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Neutralize characters that would break PostgREST's .or() filter string.
  const safeQ = q.replace(/[%,()*]/g, " ").trim();

  let query = supabase.from("products").select("*", { count: "exact" });
  if (safeQ) query = query.or(`sku.ilike.%${safeQ}%,name.ilike.%${safeQ}%`);
  if (category) query = query.eq("category", category);
  if (status === "active") query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);

  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
  const products = (data ?? []) as Product[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Distinct categories already used, to enrich the filter dropdown (deduped in JS).
  const { data: catRows } = await supabase
    .from("products")
    .select("category")
    .not("category", "is", null);
  const categories = Array.from(
    new Set((catRows ?? []).map((r) => (r as { category: string }).category))
  );

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
        title="Catalogue Produits"
        subtitle="Produits vendus par Koursino — base du futur module Ventes"
        action={<NewProductButton />}
      />

      <ProductFilters categories={categories} />

      {products.length === 0 ? (
        <EmptyState
          title="Aucun produit"
          hint={
            hasFilters
              ? "Aucun résultat pour ces critères."
              : "Ajoutez votre premier produit avec « Nouveau produit »."
          }
        />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">Photo</th>
                <th className="px-5 py-3 font-medium">Référence</th>
                <th className="px-5 py-3 font-medium">Désignation</th>
                <th className="px-5 py-3 font-medium">Catégorie</th>
                <th className="px-5 py-3 text-right font-medium">Prix HT</th>
                <th className="px-5 py-3 text-right font-medium">Prix TTC</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {products.map((p) => (
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
                  <td className="px-5 py-3 font-medium text-zinc-900">{p.name}</td>
                  <td className="px-5 py-3 text-zinc-600">{p.category ?? "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-600">
                    {formatDhs(p.unit_price_ht)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums">
                    {formatDhs(p.unit_price_ttc)}
                  </td>
                  <td className="px-5 py-3">
                    {p.is_active ? (
                      <Badge tone="green">Actif</Badge>
                    ) : (
                      <Badge tone="zinc">Inactif</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <ProductRowActions product={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
          <span>
            {total} produit{total > 1 ? "s" : ""} · page {page}/{totalPages}
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
