"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { COLOR_ATTRIBUTE_CODE, type Company, type Product, type ProductAttribute } from "@/lib/types";
import { formatDhs } from "@/lib/format";
import {
  createProduct,
  updateProduct,
  setProductActive,
  deleteProduct,
  saveReferenceColors,
} from "./actions";

// Common sales units suggested in the form (free text, so others are still allowed).
const UNIT_SUGGESTIONS = ["pièce", "kg", "m", "m²", "lot", "heure"];
const MAX_IMAGE_MB = 3;

export type SupplierOption = Pick<Company, "id" | "name" | "code">;

type FormProps = {
  suppliers: SupplierOption[];
  attributes: ProductAttribute[];
};

export function NewProductButton(props: FormProps) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ Nouvel article</Button>;
  return <ProductFormOverlay {...props} onClose={() => setOpen(false)} />;
}

export function ProductRowActions({
  product,
  suppliers,
  attributes,
}: FormProps & { product: Product }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
              const result = await setProductActive(product.id, !product.is_active);
              if (result.error) setError(result.error);
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

/**
 * "Pour telle référence, voici les couleurs qu'on commercialise." Ticking a
 * colour creates the matching article; unticking one deactivates it, so its
 * stock and its documents survive.
 */
export function ReferenceColorsButton({
  product,
  attributes,
  activeColorValueIds,
}: {
  product: Product;
  attributes: ProductAttribute[];
  activeColorValueIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const colorAttribute = attributes.find((a) => a.code === COLOR_ATTRIBUTE_CODE);
  if (!colorAttribute) return null;

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Couleurs
      </Button>
      {open && (
        <ReferenceColorsOverlay
          product={product}
          colorAttribute={colorAttribute}
          activeColorValueIds={activeColorValueIds}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ReferenceColorsOverlay({
  product,
  colorAttribute,
  activeColorValueIds,
  onClose,
}: {
  product: Product;
  colorAttribute: ProductAttribute;
  activeColorValueIds: string[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(activeColorValueIds);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const values = colorAttribute.product_attribute_values ?? [];

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
    );
  }

  return (
    <Overlay>
      <h3 className="text-base font-semibold">Couleurs commercialisées</h3>
      <p className="mb-4 mt-1 text-sm text-zinc-500">
        {product.name} — chaque couleur cochée devient un article à part entière, avec son SKU et
        son stock. Décocher une couleur désactive l&apos;article sans effacer son historique.
      </p>
      <ul className="space-y-2">
        {values.map((value) => (
          <li key={value.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(value.id)}
                onChange={() => toggle(value.id)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              {value.label}
              <span className="font-mono text-xs text-zinc-400">{value.code}</span>
            </label>
          </li>
        ))}
      </ul>
      {values.length === 0 && (
        <p className="text-sm text-zinc-500">
          Aucune couleur définie — ajoutez-en dans Stock → Attributs.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveReferenceColors(product.id, selected);
              if (result.error) setError(result.error);
              else onClose();
            })
          }
        >
          {pending ? "Application…" : "Appliquer"}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </Overlay>
  );
}

function ProductFormOverlay(props: FormProps & { product?: Product; onClose: () => void }) {
  return (
    <Overlay wide>
      <ProductForm {...props} />
    </Overlay>
  );
}

function ProductForm({
  product,
  suppliers,
  attributes,
  onClose,
}: FormProps & { product?: Product; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // HT and VAT are controlled so the TTC preview updates in real time.
  const [ht, setHt] = useState(product ? String(product.unit_price_ht) : "");
  const [vat, setVat] = useState(product ? String(product.vat_rate) : "20");
  // Thumbnail preview: the existing photo, replaced live when a new file is chosen.
  const [preview, setPreview] = useState<string | null>(product?.photo_url ?? null);

  // Live preview of the SKU the database will generate — the database always
  // has the final word.
  const [supplierId, setSupplierId] = useState(product?.supplier_id ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [model, setModel] = useState(product?.model ?? "");

  // attribute id → chosen value ids. A bicolour article holds two.
  const [chosen, setChosen] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const value of product?.product_values ?? []) {
      initial[value.attribute_id] = [...(initial[value.attribute_id] ?? []), value.value_id];
    }
    return initial;
  });

  const htNum = parseFloat(ht);
  const vatNum = parseFloat(vat);
  // Display-only mirror of the backend generated column (source of truth stays in the DB).
  const ttc = Number.isFinite(htNum) && Number.isFinite(vatNum) ? htNum * (1 + vatNum / 100) : null;

  const supplier = suppliers.find((s) => s.id === supplierId);
  const skuPreview = supplierId
    ? [
        fragment(supplier?.code) ?? fragment(supplier?.name)?.slice(0, 6) ?? "?",
        fragment(model) ?? fragment(name) ?? "?",
        attributes
          .filter((a) => a.in_sku)
          .map((a) =>
            (chosen[a.id] ?? [])
              .map((id) => a.product_attribute_values?.find((v) => v.id === id)?.code)
              .filter(Boolean)
              .join("-")
          )
          .filter(Boolean)
          .join("/") || "NA",
        product?.seq ? String(product.seq).padStart(4, "0") : "…",
      ].join("/")
    : null;

  function setSlot(attributeId: string, slot: number, valueId: string) {
    setChosen((current) => {
      const values = [...(current[attributeId] ?? [])];
      values[slot] = valueId;
      return { ...current, [attributeId]: values.filter(Boolean) };
    });
  }

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
    <Card className="w-full max-w-3xl p-6">
      <h3 className="mb-1 text-base font-semibold">
        {product ? "Modifier l'article" : "Nouvel article"}
      </h3>
      <p className="mb-4 font-mono text-sm text-zinc-500">
        {skuPreview ?? product?.sku ?? "code manuel, ou généré via le fournisseur"}
      </p>
      <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Désignation *</Label>
          <Input
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
          <p className="mt-1 text-xs text-zinc-500">
            Il s&apos;agit du fournisseur qui code la référence. Les prix d&apos;achat par
            fournisseur restent dans le catalogue fournisseur.
          </p>
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
            <Label htmlFor="sku">Référence (SKU) *</Label>
            <Input id="sku" name="sku" placeholder="AR-1" defaultValue={product?.sku} />
          </div>
        )}

        {attributes.length > 0 && (
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Catégorie et attributs
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {attributes.map((attribute) =>
                Array.from({ length: attribute.max_values }, (_, slot) => (
                  <div key={`${attribute.id}-${slot}`}>
                    <Label htmlFor={`attr_${attribute.id}_${slot}`}>
                      {slot === 0 ? attribute.name : `${attribute.name} 2 (bicolore)`}
                      {attribute.is_required && slot === 0 && " *"}
                      {attribute.in_sku && (
                        <span className="ml-1 font-normal normal-case tracking-normal text-zinc-400">
                          (dans le SKU)
                        </span>
                      )}
                    </Label>
                    <Select
                      id={`attr_${attribute.id}_${slot}`}
                      name={`attr_${attribute.id}`}
                      required={attribute.is_required && slot === 0}
                      value={chosen[attribute.id]?.[slot] ?? ""}
                      onChange={(e) => setSlot(attribute.id, slot, e.target.value)}
                    >
                      <option value="">— aucune —</option>
                      {(attribute.product_attribute_values ?? []).map((v) => (
                        <option key={v.id} value={v.id}>
                          {attribute.in_sku ? `${v.label} (${v.code})` : v.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="unit_price_ht">Prix de vente HT * (Dhs)</Label>
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

        <div>
          <Label htmlFor="purchase_price">Prix d&apos;achat indicatif</Label>
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
          <Label htmlFor="unit">Unité de vente</Label>
          <Input
            id="unit"
            name="unit"
            list="unit-suggestions"
            defaultValue={product?.unit ?? "pièce"}
          />
          <datalist id="unit-suggestions">
            {UNIT_SUGGESTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="barcode">Code-barres</Label>
          <Input id="barcode" name="barcode" defaultValue={product?.barcode ?? ""} />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" defaultValue={product?.description ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notes internes</Label>
          <Textarea id="notes" name="notes" defaultValue={product?.notes ?? ""} />
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

        <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={product ? product.is_active : true}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Actif
        </label>

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

function Overlay({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      {wide ? children : <Card className="w-full max-w-lg p-6">{children}</Card>}
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
