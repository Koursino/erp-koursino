"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui";
import { PURCHASE_ORDER_STATUSES } from "@/lib/types";

type SupplierOption = { id: string; name: string };

// Filters (statut / fournisseur / période) driven by URL search params, so the
// kanban and the list share the same state and the printed report can reuse it.
export function PurchaseOrderFilters({ suppliers }: { suppliers: SupplierOption[] }) {
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
      <Select
        aria-label="Filtrer par statut"
        value={searchParams.get("status") ?? ""}
        onChange={(e) => apply({ status: e.target.value })}
        className="max-w-[14rem]"
      >
        <option value="">Tous les statuts</option>
        {PURCHASE_ORDER_STATUSES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filtrer par fournisseur"
        value={searchParams.get("supplier") ?? ""}
        onChange={(e) => apply({ supplier: e.target.value })}
        className="max-w-[14rem]"
      >
        <option value="">Tous les fournisseurs</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Input
        type="date"
        aria-label="Depuis"
        value={searchParams.get("from") ?? ""}
        onChange={(e) => apply({ from: e.target.value })}
        className="max-w-[10rem]"
      />
      <Input
        type="date"
        aria-label="Jusqu'au"
        value={searchParams.get("to") ?? ""}
        onChange={(e) => apply({ to: e.target.value })}
        className="max-w-[10rem]"
      />
      {pending && <span className="text-xs text-zinc-400">Filtrage…</span>}
    </div>
  );
}
