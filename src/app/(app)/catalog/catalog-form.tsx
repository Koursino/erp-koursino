"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import type { Company, Product, SupplierCatalogEntry } from "@/lib/types";
import { createCatalogEntry, updateCatalogEntry, deleteCatalogEntry } from "./actions";

type SupplierOption = Pick<Company, "id" | "name">;
// The colour comes from the article's attributes, resolved server-side.
type ProductOption = Pick<Product, "id" | "name" | "sku"> & { color?: string | null };

export function NewCatalogEntryButton({
  suppliers,
  products,
  defaultSupplierId,
}: {
  suppliers: SupplierOption[];
  products: ProductOption[];
  defaultSupplierId?: string;
}) {
  const [open, setOpen] = useState(false);
  const disabled = suppliers.length === 0 || products.length === 0;

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        + Nouvelle ligne
      </Button>
    );
  }
  return (
    <CatalogFormOverlay
      suppliers={suppliers}
      products={products}
      defaultSupplierId={defaultSupplierId}
      onClose={() => setOpen(false)}
    />
  );
}

export function CatalogRowActions({
  entry,
  suppliers,
  products,
}: {
  entry: SupplierCatalogEntry;
  suppliers: SupplierOption[];
  products: ProductOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Modifier
        </Button>
        <Button
          variant="ghost"
          className="text-red-600"
          onClick={() => {
            if (confirm("Supprimer cette ligne de catalogue ?")) {
              startTransition(async () => {
                await deleteCatalogEntry(entry.id);
              });
            }
          }}
        >
          Supprimer
        </Button>
      </div>
      {editing && (
        <CatalogFormOverlay
          entry={entry}
          suppliers={suppliers}
          products={products}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

function CatalogFormOverlay({
  entry,
  suppliers,
  products,
  defaultSupplierId,
  onClose,
}: {
  entry?: SupplierCatalogEntry;
  suppliers: SupplierOption[];
  products: ProductOption[];
  defaultSupplierId?: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = entry ? await updateCatalogEntry(entry.id, fd) : await createCatalogEntry(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-2xl p-6">
        <h3 className="mb-4 text-base font-semibold">{entry ? "Modifier la ligne" : "Nouvelle ligne de catalogue"}</h3>
        <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="supplier_id">Fournisseur *</Label>
            <Select id="supplier_id" name="supplier_id" required defaultValue={entry?.supplier_id ?? defaultSupplierId ?? ""}>
              <option value="">— sélectionner —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="product_id">Article *</Label>
            <Select id="product_id" name="product_id" required defaultValue={entry?.product_id ?? ""}>
              <option value="">— sélectionner —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {[p.name, p.color].filter(Boolean).join(" · ")}
                  {p.sku ? ` (${p.sku})` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="supplier_ref">Référence fournisseur</Label>
            <Input id="supplier_ref" name="supplier_ref" defaultValue={entry?.supplier_ref ?? ""} />
          </div>
          <div>
            <Label htmlFor="unit_price">Prix d&apos;achat</Label>
            <Input
              id="unit_price"
              name="unit_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={entry?.unit_price ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="currency">Devise</Label>
            <Select id="currency" name="currency" defaultValue={entry?.currency ?? "MAD"}>
              {["MAD", "EUR", "USD", "GBP"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="lead_time_days">Délai (jours)</Label>
            <Input
              id="lead_time_days"
              name="lead_time_days"
              type="number"
              min="0"
              defaultValue={entry?.lead_time_days ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="min_order_qty">Quantité minimum</Label>
            <Input
              id="min_order_qty"
              name="min_order_qty"
              type="number"
              step="0.01"
              min="0"
              defaultValue={entry?.min_order_qty ?? 1}
            />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="is_preferred"
              defaultChecked={entry?.is_preferred}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Fournisseur préféré pour cet article
          </label>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={entry?.notes ?? ""} />
          </div>
          {error && (
            <p className="text-sm text-red-600 sm:col-span-2">
              {error.includes("duplicate") || error.includes("unique")
                ? "Ce fournisseur a déjà une ligne pour cet article — modifiez la ligne existante."
                : error}
            </p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
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
