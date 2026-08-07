"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui";
import type { DealStage } from "@/lib/types";

type CompanyOption = { id: string; name: string };

// Filters for the pipeline list, driven by URL search params like the other
// boards. The kanban keeps showing every deal — its columns *are* the stages.
export function DealFilters({
  stages,
  companies,
}: {
  stages: DealStage[];
  companies: CompanyOption[];
}) {
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
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Input
        placeholder="Rechercher une opportunité…"
        defaultValue={searchParams.get("q") ?? ""}
        onChange={(e) => apply({ q: e.target.value })}
        className="max-w-xs"
      />
      <Select
        aria-label="Filtrer par étape"
        value={searchParams.get("stage") ?? ""}
        onChange={(e) => apply({ stage: e.target.value })}
        className="max-w-[14rem]"
      >
        <option value="">Toutes les étapes</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filtrer par société"
        value={searchParams.get("company") ?? ""}
        onChange={(e) => apply({ company: e.target.value })}
        className="max-w-[14rem]"
      >
        <option value="">Toutes les sociétés</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {pending && <span className="text-xs text-zinc-400">Filtrage…</span>}
    </div>
  );
}
