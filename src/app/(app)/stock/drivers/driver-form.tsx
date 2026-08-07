"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import type { Driver } from "@/lib/types";
import { createDriver, updateDriver, deleteDriver } from "./actions";

export function NewDriverButton() {
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ Nouveau livreur</Button>;
  return <DriverFormOverlay onClose={() => setOpen(false)} />;
}

export function DriverRowActions({ driver }: { driver: Driver }) {
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
            if (confirm(`Supprimer le livreur « ${driver.name} » ?`)) {
              startTransition(async () => {
                const result = await deleteDriver(driver.id);
                if (result.error) setError(result.error);
              });
            }
          }}
        >
          Supprimer
        </Button>
      </div>
      {error && <p className="mt-1 text-right text-xs text-red-600">{error}</p>}
      {editing && <DriverFormOverlay driver={driver} onClose={() => setEditing(false)} />}
    </>
  );
}

function DriverFormOverlay({ driver, onClose }: { driver?: Driver; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = driver ? await updateDriver(driver.id, fd) : await createDriver(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-lg p-6">
        <h3 className="mb-4 text-base font-semibold">
          {driver ? "Modifier le livreur" : "Nouveau livreur"}
        </h3>
        <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name">Nom *</Label>
            <Input id="name" name="name" required defaultValue={driver?.name} />
          </div>
          <div>
            <Label htmlFor="phone">Téléphone</Label>
            <Input id="phone" name="phone" defaultValue={driver?.phone ?? ""} />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={driver ? driver.is_active : true}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Actif
          </label>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={driver?.notes ?? ""} />
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
