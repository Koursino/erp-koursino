"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import type { Company, Product, ProductAttribute } from "@/lib/types";
import { createProduct, updateProduct, deleteProduct } from "./actions";

type SupplierOption = Pick<Company, "id" | "name" | "code">;

export function NewProductButton({
  suppliers,
  attributes,
}: {
  suppliers: SupplierOption[];
  attributes: ProductAttribute[];
}) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ Nouvel article</Button>;
  return (
    <ProductFormOverlay suppliers={suppliers} attributes={attributes} onClose={() => setOpen(false)} />
  );
}

export function ProductRowActions({
  product,
  suppliers,
  attributes,
}: {
  product: Product;
  suppliers: SupplierOption[];
  attributes: ProductAttribute[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
            if (confirm(`Supprimer l'article ${product.sku} ? Refusé s'il figure sur un document.`)) {
              startTransition(async () => {
                const result = await deleteProduct(product.id);
                if (result.error) setError(result.error);
              });
            }
          }}
        >
          Supprimer
        </Button>
      </div>
      {error && <p className="mt-1 text-right text-xs text-red-600">{error}</p>}
      {editing && (
        <ProductFormOverlay
          product={product}
          suppliers={suppliers}
          attributes={attributes}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

function ProductFormOverlay({
  product,
  suppliers,
  attributes,
  onClose,
}: {
  product?: Product;
  suppliers: SupplierOption[];
  attributes: ProductAttribute[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Live preview of the SKU the database will generate. The database always
  // has the final word.
  const [supplierId, setSupplierId] = useState(product?.supplier_id ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [model, setModel] = useState(product?.model ?? "");
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries((product?.product_values ?? []).map((v) => [v.attribute_id, v.value_id]))
  );

  const supplier = suppliers.find((s) => s.id === supplierId);
  const skuPreview = supplierId
    ? [
        fragment(supplier?.code) ?? fragment(supplier?.name)?.slice(0, 6) ?? "?",
        fragment(model) ?? fragment(name) ?? "?",
        attributes
          .filter((a) => a.in_sku)
          .map((a) => a.product_attribute_values?.find((v) => v.id === chosen[a.id])?.code)
          .filter(Boolean)
          .join("/") || "NA",
        product?.seq ? String(product.seq).padStart(4, "0") : "…",
      ].join("/")
    : null;

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = product ? await updateProduct(product.id, fd) : await createProduct(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-3xl p-6">
        <h3 className="mb-1 text-base font-semibold">
          {product ? "Modifier l'article" : "Nouvel article"}
        </h3>
        <p className="mb-4 font-mono text-sm text-zinc-500">
          {skuPreview ?? product?.sku ?? "code manuel, ou généré via fournisseur"}
        </p>
        <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name">Nom *</Label>
            <Input id="name" name="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="supplier_id">Fournisseur (active le SKU généré)</Label>
            <Select
              id="supplier_id"
              name="supplier_id"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">— aucun (code manuel) —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.code} — ${s.name}` : s.name}
                </option>
              ))}
            </Select>
          </div>
          {supplierId ? (
            <div>
              <Label htmlFor="model">Modèle (segment du SKU)</Label>
              <Input
                id="model"
                name="model"
                placeholder="dérivé du nom si vide"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="sku">Code SKU{product ? "" : " *"}</Label>
              <Input id="sku" name="sku" placeholder="AR-1" defaultValue={product?.sku} />
            </div>
          )}

          {attributes.length > 0 && (
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Attributs
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {attributes.map((attribute) => (
                  <div key={attribute.id}>
                    <Label htmlFor={`attr_${attribute.id}`}>
                      {attribute.name}
                      {attribute.is_required && " *"}
                      {attribute.in_sku && (
                        <span className="ml-1 font-normal normal-case tracking-normal text-zinc-400">
                          (dans le SKU)
                        </span>
                      )}
                    </Label>
                    <Select
                      id={`attr_${attribute.id}`}
                      name={`attr_${attribute.id}`}
                      required={attribute.is_required}
                      value={chosen[attribute.id] ?? ""}
                      onChange={(e) => setChosen((c) => ({ ...c, [attribute.id]: e.target.value }))}
                    >
                      <option value="">— aucune —</option>
                      {(attribute.product_attribute_values ?? []).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label} ({v.code})
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="unit_price_ht">Prix de vente HT *</Label>
            <Input
              id="unit_price_ht"
              name="unit_price_ht"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={product?.unit_price_ht ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="vat_rate">TVA %</Label>
            <Input
              id="vat_rate"
              name="vat_rate"
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={product?.vat_rate ?? 20}
            />
          </div>
          <div>
            <Label htmlFor="purchase_price">Prix d&apos;achat</Label>
            <Input
              id="purchase_price"
              name="purchase_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={product?.purchase_price ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="min_stock">Seuil d&apos;alerte stock</Label>
            <Input
              id="min_stock"
              name="min_stock"
              type="number"
              min="0"
              step="1"
              defaultValue={product?.min_stock ?? 0}
            />
          </div>
          <div>
            <Label htmlFor="category">Catégorie</Label>
            <Input id="category" name="category" defaultValue={product?.category ?? "Chaises"} />
          </div>
          <div>
            <Label htmlFor="unit">Unité</Label>
            <Input id="unit" name="unit" defaultValue={product?.unit ?? "pièce"} />
          </div>
          <div>
            <Label htmlFor="barcode">Code-barres</Label>
            <Input id="barcode" name="barcode" defaultValue={product?.barcode ?? ""} />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={product ? product.is_active : true}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Actif
          </label>
          <div className="sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" defaultValue={product?.description ?? ""} />
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
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

/** Mirrors public.stock_code_fragment for the preview only. */
function fragment(input: string | null | undefined) {
  if (!input) return null;
  const normalized = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized === "" ? null : normalized;
}
