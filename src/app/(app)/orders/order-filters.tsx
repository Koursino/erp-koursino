"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui";
import { ORDER_STATES } from "@/lib/types";

type CompanyOption = { id: string; name: string };

// Filters (statut / revendeur / période) driven by URL search params — server-rendered list.
export function OrderFilters({ companies }: { companies: CompanyOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function apply(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page"); // any filter change returns to page 1
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Select
        aria-label="Filtrer par statut"
        value={searchParams.get("state") ?? ""}
        onChange={(e) => apply({ state: e.target.value })}
        className="max-w-[13rem]"
      >
        <option value="">Tous les statuts</option>
        {ORDER_STATES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filtrer par revendeur"
        value={searchParams.get("company") ?? ""}
        onChange={(e) => apply({ company: e.target.value })}
        className="max-w-[15rem]"
      >
        <option value="">Tous les revendeurs</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
        Du
        <Input
          type="date"
          aria-label="Date de début"
          defaultValue={searchParams.get("from") ?? ""}
          onChange={(e) => apply({ from: e.target.value })}
          className="max-w-[10rem]"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
        au
        <Input
          type="date"
          aria-label="Date de fin"
          defaultValue={searchParams.get("to") ?? ""}
          onChange={(e) => apply({ to: e.target.value })}
          className="max-w-[10rem]"
        />
      </label>
      {pending && <span className="text-xs text-zinc-400">Filtrage…</span>}
    </div>
  );
}
