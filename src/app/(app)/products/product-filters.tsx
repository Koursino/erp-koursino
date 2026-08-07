"use client";

import { useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui";

// Search + filters, driven by URL search params so the list stays server-rendered
// and the state is shareable/bookmarkable. `categories` comes from the CATEGORY
// attribute — the list is user-managed on /stock/attributes, not hard-coded.
export function ProductFilters({ categories }: { categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page"); // any filter change returns to page 1
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function onSearch(value: string) {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({ q: value }), 300);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Input
        placeholder="Rechercher par référence ou désignation…"
        defaultValue={searchParams.get("q") ?? ""}
        onChange={(e) => onSearch(e.target.value)}
        className="max-w-xs"
      />
      <Select
        aria-label="Filtrer par catégorie"
        value={searchParams.get("category") ?? ""}
        onChange={(e) => apply({ category: e.target.value })}
        className="max-w-[13rem]"
      >
        <option value="">Toutes les catégories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filtrer par statut"
        value={searchParams.get("status") ?? ""}
        onChange={(e) => apply({ status: e.target.value })}
        className="max-w-[11rem]"
      >
        <option value="">Tous les statuts</option>
        <option value="active">Actifs</option>
        <option value="inactive">Inactifs</option>
      </Select>
      {pending && <span className="text-xs text-zinc-400">Filtrage…</span>}
    </div>
  );
}
