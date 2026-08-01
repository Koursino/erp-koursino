"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { PURCHASE_ORDER_STATUSES, type PurchaseOrder } from "@/lib/types";
import { cn } from "@/components/ui";
import { movePurchaseOrder } from "./actions";

const fmtMoney = (n: number, currency = "MAD") =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(n);

const columnAccent: Record<string, string> = {
  open: "bg-blue-400",
  done: "bg-emerald-500",
  cancelled: "bg-red-400",
};

/** Colours are resolved server-side (the helper is server-only) and passed as plain strings. */
export type KanbanOrder = PurchaseOrder & { total: number; colors: string[] };

export function PurchaseOrderKanban({ orders }: { orders: KanbanOrder[] }) {
  const [, startTransition] = useTransition();
  const [optimisticOrders, applyMove] = useOptimistic(
    orders,
    (state, move: { id: string; status: string }) =>
      state.map((o) => (o.id === move.id ? { ...o, status: move.status as never } : o))
  );
  const [dragOver, setDragOver] = useState<string | null>(null);

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
                    {o.colors.length > 0 && (
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {o.colors.slice(0, 3).join(" · ")}
                        {o.colors.length > 3 && ` +${o.colors.length - 3}`}
                      </p>
                    )}
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
  );
}
