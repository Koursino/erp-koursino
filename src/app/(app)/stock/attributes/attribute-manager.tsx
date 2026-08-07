"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import type { ProductAttribute, ProductAttributeValue } from "@/lib/types";
import {
  createAttribute,
  updateAttribute,
  deleteAttribute,
  createAttributeValue,
  updateAttributeValue,
  deleteAttributeValue,
} from "./actions";

export function NewAttributeButton() {
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ Nouvel attribut</Button>;
  return <AttributeFormOverlay onClose={() => setOpen(false)} />;
}

export function AttributeCard({ attribute }: { attribute: ProductAttribute }) {
  const [editing, setEditing] = useState(false);
  const [addingValue, setAddingValue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const values = attribute.product_attribute_values ?? [];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            {attribute.name}
            <span className="font-mono text-xs font-normal text-zinc-400">{attribute.code}</span>
          </h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {attribute.in_sku ? <Badge tone="blue">dans le SKU</Badge> : <Badge>descriptif</Badge>}
            {attribute.max_values > 1 && (
              <Badge tone="blue">jusqu&apos;à {attribute.max_values} valeurs</Badge>
            )}
            {attribute.is_required && <Badge tone="amber">obligatoire</Badge>}
            {!attribute.is_active && <Badge tone="red">inactif</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Modifier
          </Button>
          <Button
            variant="ghost"
            className="text-red-600"
            onClick={() => {
              if (
                confirm(
                  `Supprimer l'attribut « ${attribute.name} » ? Il est retiré de tous les articles et les SKU sont reconstruits.`
                )
              ) {
                startTransition(async () => {
                  const result = await deleteAttribute(attribute.id);
                  if (result.error) setError(result.error);
                });
              }
            }}
          >
            Supprimer
          </Button>
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4">
        {values.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucune valeur pour le moment.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {values.map((value) => (
              <ValueChip key={value.id} value={value} inSku={attribute.in_sku} />
            ))}
          </ul>
        )}
        <Button variant="secondary" className="mt-3" onClick={() => setAddingValue(true)}>
          + Ajouter une valeur
        </Button>
      </div>

      {editing && <AttributeFormOverlay attribute={attribute} onClose={() => setEditing(false)} />}
      {addingValue && (
        <ValueFormOverlay attributeId={attribute.id} onClose={() => setAddingValue(false)} />
      )}
    </Card>
  );
}

function ValueChip({ value, inSku }: { value: ProductAttributeValue; inSku: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm hover:border-zinc-400"
      >
        {value.label}
        {inSku && <span className="ml-1.5 font-mono text-xs text-zinc-400">{value.code}</span>}
      </button>
      {editing && (
        <ValueFormOverlay
          attributeId={value.attribute_id}
          value={value}
          onClose={() => setEditing(false)}
        />
      )}
    </li>
  );
}

function AttributeFormOverlay({
  attribute,
  onClose,
}: {
  attribute?: ProductAttribute;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = attribute ? await updateAttribute(attribute.id, fd) : await createAttribute(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Overlay>
      <h3 className="mb-4 text-base font-semibold">
        {attribute ? "Modifier l'attribut" : "Nouvel attribut"}
      </h3>
      <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Nom *</Label>
          <Input id="name" name="name" required placeholder="Taille" defaultValue={attribute?.name} />
        </div>
        <div>
          <Label htmlFor="code">Code *</Label>
          <Input id="code" name="code" required placeholder="SIZE" defaultValue={attribute?.code} />
        </div>
        <div>
          <Label htmlFor="position">Ordre</Label>
          <Input
            id="position"
            name="position"
            type="number"
            step="1"
            defaultValue={attribute?.position ?? 0}
          />
          <p className="mt-1 text-xs text-zinc-500">Ordre dans les formulaires et dans le SKU.</p>
        </div>
        <div>
          <Label htmlFor="max_values">Valeurs par article</Label>
          <Input
            id="max_values"
            name="max_values"
            type="number"
            min={1}
            max={5}
            step="1"
            defaultValue={attribute?.max_values ?? 1}
          />
          <p className="mt-1 text-xs text-zinc-500">
            1 = valeur unique. 2 pour la couleur : une valeur = couleur unique, deux = bicolore.
          </p>
        </div>
        <div className="flex flex-col gap-2 pb-2 text-sm text-zinc-700 sm:col-span-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="in_sku"
              defaultChecked={attribute?.in_sku}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Inclure dans le SKU
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="in_summary"
              defaultChecked={attribute ? attribute.in_summary : true}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Afficher dans le libellé de variante
            <span className="text-xs text-zinc-500">
              (« Chaise Aura · Noir/Blanc ») — à décocher pour un attribut de classement
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="is_required"
              defaultChecked={attribute?.is_required}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Obligatoire sur chaque article
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={attribute ? attribute.is_active : true}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Actif
          </label>
        </div>
        <p className="text-xs text-zinc-500 sm:col-span-2">
          Modifier l&apos;ordre ou l&apos;option SKU reconstruit le code de tous les articles concernés.
        </p>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <FormActions pending={pending} onClose={onClose} />
      </form>
    </Overlay>
  );
}

function ValueFormOverlay({
  attributeId,
  value,
  onClose,
}: {
  attributeId: string;
  value?: ProductAttributeValue;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = value
        ? await updateAttributeValue(value.id, fd)
        : await createAttributeValue(attributeId, fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Overlay>
      <h3 className="mb-4 text-base font-semibold">
        {value ? "Modifier la valeur" : "Nouvelle valeur"}
      </h3>
      <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="label">Libellé *</Label>
          <Input id="label" name="label" required placeholder="Noir" defaultValue={value?.label} />
        </div>
        <div>
          <Label htmlFor="code">Code SKU</Label>
          <Input id="code" name="code" placeholder="NOIR" defaultValue={value?.code} />
          <p className="mt-1 text-xs text-zinc-500">Déduit du libellé s&apos;il est laissé vide.</p>
        </div>
        <div>
          <Label htmlFor="position">Ordre</Label>
          <Input
            id="position"
            name="position"
            type="number"
            step="1"
            defaultValue={value?.position ?? 0}
          />
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <FormActions
          pending={pending}
          onClose={onClose}
          extra={
            value && (
              <DeleteValueButton id={value.id} label={value.label} onDone={onClose} onError={setError} />
            )
          }
        />
      </form>
    </Overlay>
  );
}

function DeleteValueButton({
  id,
  label,
  onDone,
  onError,
}: {
  id: string;
  label: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      className="text-red-600"
      onClick={() => {
        if (
          confirm(
            `Supprimer la valeur « ${label} » ? Les articles qui l'utilisent la conservent — retirez-la d'abord chez eux.`
          )
        ) {
          startTransition(async () => {
            const result = await deleteAttributeValue(id);
            if (result.error) onError(result.error);
            else onDone();
          });
        }
      }}
    >
      Supprimer
    </Button>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-xl p-6">{children}</Card>
    </div>
  );
}

function FormActions({
  pending,
  onClose,
  extra,
}: {
  pending: boolean;
  onClose: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 sm:col-span-2">
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
      <Button type="button" variant="secondary" onClick={onClose}>
        Annuler
      </Button>
      {extra && <span className="ml-auto">{extra}</span>}
    </div>
  );
}
