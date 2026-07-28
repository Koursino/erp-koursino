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
  if (!open) return <Button onClick={() => setOpen(true)}>+ New attribute</Button>;
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
          <div className="mt-1 flex gap-1">
            {attribute.in_sku ? <Badge tone="blue">in SKU</Badge> : <Badge>descriptive</Badge>}
            {attribute.is_required && <Badge tone="amber">required</Badge>}
            {!attribute.is_active && <Badge tone="red">inactive</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            className="text-red-600"
            onClick={() => {
              if (
                confirm(
                  `Delete attribute "${attribute.name}"? It is removed from every article and the SKUs are rebuilt.`
                )
              ) {
                startTransition(async () => {
                  const result = await deleteAttribute(attribute.id);
                  if (result.error) setError(result.error);
                });
              }
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4">
        {values.length === 0 ? (
          <p className="text-sm text-zinc-500">No values yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {values.map((value) => (
              <ValueChip key={value.id} value={value} inSku={attribute.in_sku} />
            ))}
          </ul>
        )}
        <Button variant="secondary" className="mt-3" onClick={() => setAddingValue(true)}>
          + Add value
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
        {attribute ? "Edit attribute" : "New attribute"}
      </h3>
      <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name *</Label>
          <Input id="name" name="name" required placeholder="Size" defaultValue={attribute?.name} />
        </div>
        <div>
          <Label htmlFor="code">Code *</Label>
          <Input id="code" name="code" required placeholder="SIZE" defaultValue={attribute?.code} />
        </div>
        <div>
          <Label htmlFor="position">Order</Label>
          <Input
            id="position"
            name="position"
            type="number"
            step="1"
            defaultValue={attribute?.position ?? 0}
          />
          <p className="mt-1 text-xs text-zinc-500">Order in forms and inside the SKU.</p>
        </div>
        <div className="flex flex-col justify-end gap-2 pb-2 text-sm text-zinc-700">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="in_sku"
              defaultChecked={attribute?.in_sku}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Include in the SKU
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="is_required"
              defaultChecked={attribute?.is_required}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Required on every article
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={attribute ? attribute.is_active : true}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Active
          </label>
        </div>
        <p className="text-xs text-zinc-500 sm:col-span-2">
          Changing the order or the SKU flag rebuilds the code of every affected article.
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
      <h3 className="mb-4 text-base font-semibold">{value ? "Edit value" : "New value"}</h3>
      <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="label">Label *</Label>
          <Input id="label" name="label" required placeholder="Black" defaultValue={value?.label} />
        </div>
        <div>
          <Label htmlFor="code">SKU code</Label>
          <Input id="code" name="code" placeholder="BLK" defaultValue={value?.code} />
          <p className="mt-1 text-xs text-zinc-500">Derived from the label when left empty.</p>
        </div>
        <div>
          <Label htmlFor="position">Order</Label>
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
        if (confirm(`Delete value "${label}"? Articles already using it keep it — remove it there first.`)) {
          startTransition(async () => {
            const result = await deleteAttributeValue(id);
            if (result.error) onError(result.error);
            else onDone();
          });
        }
      }}
    >
      Delete
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
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      {extra && <span className="ml-auto">{extra}</span>}
    </div>
  );
}
