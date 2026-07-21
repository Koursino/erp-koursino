"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Input, Label, Select, Textarea, cn } from "@/components/ui";
import {
  PURCHASE_ORDER_STATUSES,
  type Company,
  type PurchaseOrder,
} from "@/lib/types";
import { createPurchaseOrder, movePurchaseOrder } from "./actions";

type SupplierOption = Pick<Company, "id" | "name">;

const fmtMoney = (n: number, currency = "MAD") =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(n);

const columnAccent: Record<string, string> = {
  open: "bg-blue-400",
  done: "bg-emerald-500",
  cancelled: "bg-red-400",
};

export function PurchaseOrderKanban({
  orders,
  suppliers,
}: {
  orders: (PurchaseOrder & { total: number })[];
  suppliers: SupplierOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimisticOrders, applyMove] = useOptimistic(
    orders,
    (state, move: { id: string; status: string }) =>
      state.map((o) => (o.id === move.id ? { ...o, status: move.status as never } : o))
  );
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function onDrop(e: React.DragEvent, status: string) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/po-id");
    if (!id) return;
    const order = optimisticOrders.find((o) => o.id === id);
    if (!order || order.status === status) return;
    startTransition(async () => {
      applyMove({ id, status });
      await movePurchaseOrder(id, status);
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)} disabled={suppliers.length === 0}>
          + Nouveau bon de commande
        </Button>
      </div>
      {suppliers.length === 0 && (
        <p className="mb-4 text-sm text-amber-700">
          Marquez d&apos;abord au moins une entreprise comme « supplier » dans Companies.
        </p>
      )}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PURCHASE_ORDER_STATUSES.map((stage) => {
          const stageOrders = optimisticOrders.filter((o) => o.status === stage.key);
          const total = stageOrders.reduce((sum, o) => sum + o.total, 0);
          return (
            <div
              key={stage.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(stage.key);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => onDrop(e, stage.key)}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-xl border bg-zinc-100/70 transition-colors",
                dragOver === stage.key ? "border-zinc-500 bg-zinc-200/70" : "border-zinc-200"
              )}
            >
              <div className="flex items-center justify-between px-4 pb-2 pt-3">
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", columnAccent[stage.kind])} />
                  <span className="text-sm font-semibold text-zinc-700">{stage.label}</span>
                  <span className="text-xs text-zinc-400">{stageOrders.length}</span>
                </span>
                <span className="text-xs font-medium text-zinc-500">{total > 0 && fmtMoney(total)}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
                {stageOrders.map((o) => (
                  <Link
                    key={o.id}
                    href={`/purchase-orders/${o.id}`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/po-id", o.id)}
                    className="block cursor-grab rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                  >
                    <p className="font-mono text-xs text-zinc-500">{o.reference ?? "—"}</p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-900">
                      {o.companies?.name ?? "Sans fournisseur"}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-zinc-800">
                        {fmtMoney(o.total, o.currency)}
                      </span>
                      {o.expected_date && (
                        <span className="text-[11px] text-zinc-400">
                          {new Date(o.expected_date).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
                {stageOrders.length === 0 && (
                  <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-400">
                    —
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {creating && (
        <NewPurchaseOrderOverlay
          suppliers={suppliers}
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(`/purchase-orders/${id}`)}
        />
      )}
    </>
  );
}

function NewPurchaseOrderOverlay({
  suppliers,
  onClose,
  onCreated,
}: {
  suppliers: SupplierOption[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = await createPurchaseOrder(fd);
      if (result.error || !result.id) setError(result.error ?? "Création impossible.");
      else onCreated(result.id);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-xl p-6">
        <h3 className="mb-4 text-base font-semibold">Nouveau bon de commande</h3>
        <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="supplier_id">Fournisseur *</Label>
            <Select id="supplier_id" name="supplier_id" required defaultValue="">
              <option value="">— sélectionner —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="currency">Devise</Label>
            <Select id="currency" name="currency" defaultValue="MAD">
              {["MAD", "EUR", "USD", "GBP"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="order_date">Date</Label>
            <Input id="order_date" name="order_date" type="date" defaultValue={today} />
          </div>
          <div>
            <Label htmlFor="expected_date">Livraison attendue</Label>
            <Input id="expected_date" name="expected_date" type="date" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" />
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Création…" : "Créer et ajouter des lignes"}
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
