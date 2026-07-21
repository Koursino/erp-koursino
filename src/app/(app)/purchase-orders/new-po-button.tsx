"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import type { Company } from "@/lib/types";
import { createPurchaseOrder } from "./actions";

type SupplierOption = Pick<Company, "id" | "name">;

export function NewPurchaseOrderButton({ suppliers }: { suppliers: SupplierOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={suppliers.length === 0}>
        + Nouvel achat
      </Button>
      {open && <NewPurchaseOrderOverlay suppliers={suppliers} onClose={() => setOpen(false)} />}
    </>
  );
}

function NewPurchaseOrderOverlay({
  suppliers,
  onClose,
}: {
  suppliers: SupplierOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = await createPurchaseOrder(fd);
      if (result.error || !result.id) setError(result.error ?? "Création impossible.");
      else router.push(`/purchase-orders/${result.id}`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-xl p-6">
        <h3 className="mb-4 text-base font-semibold">Nouvel achat</h3>
        <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="supplier_id">Fournisseur *</Label>
            <Select id="supplier_id" name="supplier_id" required defaultValue="">
              <option value="">— sélectionner —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="currency">Devise</Label>
            <Select id="currency" name="currency" defaultValue="MAD">
              {["MAD", "EUR", "USD", "GBP"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="order_date">Date</Label>
            <Input id="order_date" name="order_date" type="date" defaultValue={today} />
          </div>
          <div>
            <Label htmlFor="expected_date">Livraison attendue</Label>
            <Input id="expected_date" name="expected_date" type="date" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" />
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Création…" : "Créer et ajouter des lignes"}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
