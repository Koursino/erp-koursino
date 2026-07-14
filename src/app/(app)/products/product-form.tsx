"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { PRODUCT_CATEGORIES, type Product } from "@/lib/types";
import { formatDhs } from "@/lib/format";
import { createProduct, updateProduct, setProductActive, deleteProduct } from "./actions";

// Common sales units suggested in the form (free text, so others are still allowed).
const UNIT_SUGGESTIONS = ["pièce", "kg", "m", "m²", "lot", "heure"];
const MAX_IMAGE_MB = 3;

export function NewProductButton() {
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ Nouveau produit</Button>;
  return <ProductFormOverlay onClose={() => setOpen(false)} />;
}

export function ProductRowActions({ product }: { product: Product }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="flex justify-end gap-1">
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Modifier
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setProductActive(product.id, !product.is_active);
            })
          }
        >
          {product.is_active ? "Désactiver" : "Réactiver"}
        </Button>
        <Button
          variant="ghost"
          className="text-red-600"
          disabled={pending}
          onClick={() => {
            if (
              confirm(
                `Supprimer définitivement « ${product.name} » (${product.sku}) ? Cette action est irréversible — préférez la désactivation pour conserver l'historique.`
              )
            ) {
              startTransition(async () => {
                await deleteProduct(product.id);
              });
            }
          }}
        >
          Supprimer
        </Button>
      </div>
      {editing && <ProductFormOverlay product={product} onClose={() => setEditing(false)} />}
    </>
  );
}

function ProductFormOverlay(props: { product?: Product; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <ProductForm {...props} />
    </div>
  );
}

function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // HT and VAT are controlled so the TTC preview updates in real time.
  const [ht, setHt] = useState(product ? String(product.unit_price_ht) : "");
  const [vat, setVat] = useState(product ? String(product.vat_rate) : "20");
  // Thumbnail preview: the existing photo, replaced live when a new file is chosen.
  const [preview, setPreview] = useState<string | null>(product?.photo_url ?? null);

  const htNum = parseFloat(ht);
  const vatNum = parseFloat(vat);
  // Display-only mirror of the backend generated column (source of truth stays in the DB).
  const ttc = Number.isFinite(htNum) && Number.isFinite(vatNum) ? htNum * (1 + vatNum / 100) : null;

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPreview(product?.photo_url ?? null);
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`L'image dépasse la taille maximale de ${MAX_IMAGE_MB} Mo.`);
      e.target.value = "";
      setPreview(product?.photo_url ?? null);
      return;
    }
    setError(null);
    setPreview(URL.createObjectURL(file));
  }

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = product ? await updateProduct(product.id, fd) : await createProduct(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Card className="w-full max-w-2xl p-6">
      <h3 className="mb-4 text-base font-semibold">
        {product ? "Modifier le produit" : "Nouveau produit"}
      </h3>
      <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="sku">Référence (SKU) *</Label>
          <Input id="sku" name="sku" required defaultValue={product?.sku} />
        </div>
        <div>
          <Label htmlFor="name">Désignation *</Label>
          <Input id="name" name="name" required defaultValue={product?.name} />
        </div>
        <div>
          <Label htmlFor="category">Catégorie</Label>
          <Select id="category" name="category" defaultValue={product?.category ?? ""}>
            <option value="">— aucune —</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="unit">Unité de vente</Label>
          <Input id="unit" name="unit" list="unit-suggestions" defaultValue={product?.unit ?? "pièce"} />
          <datalist id="unit-suggestions">
            {UNIT_SUGGESTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="unit_price_ht">Prix HT * (Dhs)</Label>
          <Input
            id="unit_price_ht"
            name="unit_price_ht"
            type="number"
            step="0.01"
            min="0"
            required
            value={ht}
            onChange={(e) => setHt(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="vat_rate">TVA (%)</Label>
          <Input
            id="vat_rate"
            name="vat_rate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={vat}
            onChange={(e) => setVat(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Prix TTC (calculé automatiquement)</Label>
          {/* Read-only, not submitted: the database computes and stores the real TTC. */}
          <Input
            readOnly
            tabIndex={-1}
            value={ttc !== null ? formatDhs(ttc) : "—"}
            className="bg-zinc-50 text-zinc-500"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" defaultValue={product?.description ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="photo">Photo</Label>
          <div className="flex items-center gap-4">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt=""
                className="h-16 w-16 rounded-lg border border-zinc-200 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400">
                —
              </div>
            )}
            <Input
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPhotoChange}
              className="cursor-pointer"
            />
          </div>
          <p className="mt-1 text-xs text-zinc-400">JPEG, PNG ou WebP — 3 Mo maximum.</p>
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
  );
}
