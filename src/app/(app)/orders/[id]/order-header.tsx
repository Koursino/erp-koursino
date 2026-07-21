"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { ORDER_STATES, TRANSITIONS, type Order, type OrderState } from "@/lib/types";
import { cancelOrder, confirmOrder, deleteOrder, setOrderState, updateOrder } from "../actions";

type CompanyOption = { id: string; name: string };
type DealOption = { id: string; title: string };

const stateLabel = (s: OrderState) => ORDER_STATES.find((x) => x.value === s)?.label ?? s;

// State-transition buttons (only the moves allowed from the current state) + draft delete.
export function OrderActions({ order, hasLines }: { order: Order; hasLines: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nexts = TRANSITIONS[order.state];

  function run(fn: () => Promise<{ error: string | null }>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {nexts.map((next) => {
          if (next === "confirmee") {
            return (
              <Button key={next} disabled={pending || !hasLines} onClick={() => run(() => confirmOrder(order.id))}>
                Confirmer
              </Button>
            );
          }
          if (next === "annulee") {
            return (
              <Button
                key={next}
                variant="secondary"
                disabled={pending}
                onClick={() => run(() => cancelOrder(order.id), "Annuler cette commande ?")}
              >
                Annuler
              </Button>
            );
          }
          return (
            <Button key={next} disabled={pending} onClick={() => run(() => setOrderState(order.id, next))}>
              Passer à « {stateLabel(next)} »
            </Button>
          );
        })}
        {order.state === "brouillon" && (
          <Button
            variant="ghost"
            className="text-red-600"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await deleteOrder(order.id);
                if (!result.error) router.push("/orders");
                return result;
              }, "Supprimer définitivement ce brouillon ?")
            }
          >
            Supprimer
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// Header info — editable only while Brouillon, read-only otherwise.
export function OrderHeaderCard({
  order,
  companies,
  deals,
}: {
  order: Order;
  companies: CompanyOption[];
  deals: DealOption[];
}) {
  const editable = order.state === "brouillon";
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateOrder(order.id, fd);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  if (!editable) {
    return (
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">Informations</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-zinc-400">Revendeur</dt>
            <dd className="font-medium">{order.companies?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-400">Opportunité</dt>
            <dd>{order.deals?.title ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-400">Date de commande</dt>
            <dd>{new Date(order.order_date).toLocaleDateString("fr-FR")}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-zinc-400">Notes internes</dt>
            <dd className="whitespace-pre-wrap">{order.notes ?? "—"}</dd>
          </div>
        </dl>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-zinc-700">Informations</h3>
      <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="company_id">Revendeur *</Label>
          <Select id="company_id" name="company_id" required defaultValue={order.company_id}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="deal_id">Opportunité (optionnel)</Label>
          <Select id="deal_id" name="deal_id" defaultValue={order.deal_id ?? ""}>
            <option value="">— aucune —</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="order_date">Date de commande</Label>
          <Input id="order_date" name="order_date" type="date" defaultValue={order.order_date} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notes internes</Label>
          <Textarea id="notes" name="notes" defaultValue={order.notes ?? ""} />
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {saved && <span className="text-xs text-emerald-600">Enregistré</span>}
        </div>
      </form>
    </Card>
  );
}
