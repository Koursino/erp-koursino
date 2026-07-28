"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import type { Warehouse } from "@/lib/types";
import { createWarehouse, updateWarehouse, deleteWarehouse } from "./actions";

export function NewWarehouseButton() {
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ New warehouse</Button>;
  return <WarehouseFormOverlay onClose={() => setOpen(false)} />;
}

export function WarehouseRowActions({ warehouse }: { warehouse: Warehouse }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          variant="ghost"
          className="text-red-600"
          onClick={() => {
            if (confirm(`Delete warehouse "${warehouse.name}"? Its stock levels are deleted with it.`)) {
              startTransition(async () => {
                const result = await deleteWarehouse(warehouse.id);
                if (result.error) setError(result.error);
              });
            }
          }}
        >
          Delete
        </Button>
      </div>
      {error && <p className="mt-1 text-right text-xs text-red-600">{error}</p>}
      {editing && <WarehouseFormOverlay warehouse={warehouse} onClose={() => setEditing(false)} />}
    </>
  );
}

function WarehouseFormOverlay({ warehouse, onClose }: { warehouse?: Warehouse; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = warehouse ? await updateWarehouse(warehouse.id, fd) : await createWarehouse(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-2xl p-6">
        <h3 className="mb-4 text-base font-semibold">
          {warehouse ? "Edit warehouse" : "New warehouse"}
        </h3>
        <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="code">Code *</Label>
            <Input id="code" name="code" required placeholder="MAIN" defaultValue={warehouse?.code} />
            <p className="mt-1 text-xs text-zinc-500">Short handle, uppercased automatically.</p>
          </div>
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input id="name" name="name" required defaultValue={warehouse?.name} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" name="address" defaultValue={warehouse?.address ?? ""} />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" defaultValue={warehouse?.city ?? ""} />
          </div>
          <div>
            <Label htmlFor="country">Country</Label>
            <Input id="country" name="country" defaultValue={warehouse?.country ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={warehouse?.notes ?? ""} />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="is_default"
              defaultChecked={warehouse?.is_default}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Default warehouse
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={warehouse ? warehouse.is_active : true}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Active
          </label>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
