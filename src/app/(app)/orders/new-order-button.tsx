"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Label, Select } from "@/components/ui";
import { createOrder } from "./actions";

type CompanyOption = { id: string; name: string };

export function NewOrderButton({ companies }: { companies: CompanyOption[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ Nouvelle commande</Button>;
  return <NewOrderModal companies={companies} onClose={() => setOpen(false)} />;
}

function NewOrderModal({ companies, onClose }: { companies: CompanyOption[]; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createOrder(fd);
      if (result.error) setError(result.error);
      else if (result.id) router.push(`/orders/${result.id}`); // land on the draft fiche
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-md p-6">
        <h3 className="mb-4 text-base font-semibold">Nouvelle commande</h3>
        {companies.length === 0 ? (
          <>
            <p className="text-sm text-zinc-600">
              Aucun revendeur enregistré. Créez d’abord une fiche société (client) avant de saisir une
              commande.
            </p>
            <div className="mt-4">
              <Button type="button" variant="secondary" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </>
        ) : (
          <form action={submit} className="space-y-4">
            <div>
              <Label htmlFor="company_id">Revendeur *</Label>
              <Select id="company_id" name="company_id" required defaultValue="">
                <option value="" disabled>
                  — choisir un revendeur —
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-zinc-400">
              La commande est créée en Brouillon ; vous ajouterez les lignes ensuite.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Création…" : "Créer"}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Annuler
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
