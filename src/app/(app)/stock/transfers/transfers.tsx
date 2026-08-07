"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, EmptyState, Input, Label, Select, Textarea } from "@/components/ui";
import { LineEditor, type ProductOption } from "@/components/line-editor";
import { fmtDate, statusTone } from "@/lib/format";
import {
  productLabel,
  type Driver,
  type StockLevel,
  type StockTransfer,
  type Warehouse,
} from "@/lib/types";
import { createTransfer, updateTransfer, executeTransfer, cancelTransfer, deleteTransfer } from "./actions";

type WarehouseOption = Pick<Warehouse, "id" | "code" | "name">;
type DriverOption = Pick<Driver, "id" | "name">;
export type LevelRow = Pick<StockLevel, "product_id" | "warehouse_id" | "quantity">;

export function TransferList({
  transfers,
  warehouses,
  drivers,
  products,
  levels,
}: {
  transfers: StockTransfer[];
  warehouses: WarehouseOption[];
  drivers: DriverOption[];
  products: ProductOption[];
  levels: LevelRow[];
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StockTransfer | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const canCreate = warehouses.length >= 2 && products.length > 0;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          + New transfer
        </Button>
      </div>

      {transfers.length === 0 ? (
        <EmptyState
          title="No transfers yet"
          hint="A transfer moves articles between two warehouses in a single operation."
        />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">Reference</th>
                <th className="px-5 py-3 font-medium">From</th>
                <th className="px-5 py-3 font-medium">To</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Lines</th>
                <th className="px-5 py-3 font-medium">Units</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {transfers.map((transfer) => {
                const lines = transfer.stock_transfer_lines ?? [];
                const isOpen = expanded === transfer.id;
                return (
                  <Fragment key={transfer.id}>
                    <tr
                      className="cursor-pointer hover:bg-zinc-50"
                      onClick={() => setExpanded(isOpen ? null : transfer.id)}
                    >
                      <td className="px-5 py-3 font-mono text-xs font-medium">{transfer.reference}</td>
                      <td className="px-5 py-3 font-medium">{transfer.from_warehouse?.name ?? "—"}</td>
                      <td className="px-5 py-3 font-medium">{transfer.to_warehouse?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-zinc-600">{fmtDate(transfer.transfer_date)}</td>
                      <td className="px-5 py-3 text-zinc-600">{lines.length}</td>
                      <td className="px-5 py-3">{lines.reduce((s, l) => s + l.quantity, 0)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone(transfer.status)}>{transfer.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-zinc-400">
                        {isOpen ? "▲" : "▼"}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="bg-zinc-50 px-5 py-4">
                          <TransferDetail
                            transfer={transfer}
                            drivers={drivers}
                            onEdit={() => setEditing(transfer)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {(creating || editing) && (
        <TransferForm
          transfer={editing ?? undefined}
          warehouses={warehouses}
          products={products}
          levels={levels}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function TransferDetail({
  transfer,
  drivers,
  onEdit,
}: {
  transfer: StockTransfer;
  drivers: DriverOption[];
  onEdit: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A transfer is a delivery between warehouses, so it carries a driver too.
  const [driverId, setDriverId] = useState(drivers[0]?.id ?? "");
  const lines = transfer.stock_transfer_lines ?? [];
  const locked = transfer.status !== "draft";

  const run = (action: () => Promise<{ error: string | null }>) => () => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {lines.length === 0 ? (
        <p className="text-sm text-zinc-500">No lines yet — edit the transfer to add articles.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-1 font-medium">Article</th>
              <th className="py-1 font-medium">SKU</th>
              <th className="w-20 py-1 font-medium">Qty</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="py-1">{line.products ? productLabel(line.products) : "—"}</td>
                <td className="py-1 font-mono text-xs text-zinc-500">{line.products?.sku}</td>
                <td className="py-1">{line.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {transfer.notes && <p className="mt-3 text-sm text-zinc-600">{transfer.notes}</p>}
      {transfer.executed_at && (
        <p className="mt-3 text-sm text-emerald-700">
          Executed on {fmtDate(transfer.executed_at)} — {transfer.from_warehouse?.name} decremented,{" "}
          {transfer.to_warehouse?.name} incremented.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {!locked && (
          <>
            <div>
              <Label htmlFor={`dr-${transfer.id}`}>Livreur</Label>
              <Select
                id={`dr-${transfer.id}`}
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-56"
              >
                <option value="">— sélectionner —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              disabled={pending || lines.length === 0 || !driverId}
              onClick={run(() => executeTransfer(transfer.id, driverId))}
            >
              {pending ? "Working…" : "Execute transfer"}
            </Button>
            <Button variant="secondary" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="ghost" disabled={pending} onClick={run(() => cancelTransfer(transfer.id))}>
              Cancel transfer
            </Button>
          </>
        )}
        {transfer.status !== "done" && (
          <Button
            variant="ghost"
            className="ml-auto text-red-600"
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete transfer ${transfer.reference}?`)) {
                run(() => deleteTransfer(transfer.id))();
              }
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

function TransferForm({
  transfer,
  warehouses,
  products,
  levels,
  onClose,
}: {
  transfer?: StockTransfer;
  warehouses: WarehouseOption[];
  products: ProductOption[];
  levels: LevelRow[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [fromId, setFromId] = useState(transfer?.from_warehouse_id ?? warehouses[0]?.id ?? "");
  const [toId, setToId] = useState(
    transfer?.to_warehouse_id ?? warehouses.find((w) => w.id !== warehouses[0]?.id)?.id ?? ""
  );

  // What the source warehouse actually holds, so a shortage is visible upfront.
  const available = useMemo(() => {
    const map: Record<string, number> = {};
    for (const level of levels) {
      if (level.warehouse_id === fromId) map[level.product_id] = level.quantity;
    }
    for (const product of products) map[product.id] ??= 0;
    return map;
  }, [levels, fromId, products]);

  function submit(fd: FormData) {
    if (fromId === toId) {
      setError("Source and destination must be different warehouses");
      return;
    }
    startTransition(async () => {
      const result = transfer ? await updateTransfer(transfer.id, fd) : await createTransfer(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-3xl p-6">
        <h3 className="mb-4 text-base font-semibold">
          {transfer ? `Edit ${transfer.reference}` : "New transfer"}
        </h3>
        <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="from_warehouse_id">From *</Label>
            <Select
              id="from_warehouse_id"
              name="from_warehouse_id"
              required
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="to_warehouse_id">To *</Label>
            <Select
              id="to_warehouse_id"
              name="to_warehouse_id"
              required
              value={toId}
              onChange={(e) => setToId(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="transfer_date">Date</Label>
            <Input
              id="transfer_date"
              name="transfer_date"
              type="date"
              defaultValue={transfer?.transfer_date ?? today}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Articles to move</Label>
            <LineEditor
              products={products}
              defaultLines={transfer?.stock_transfer_lines ?? []}
              withPrice={false}
              available={available}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={transfer?.notes ?? ""} />
          </div>
          <p className="text-sm text-zinc-500 sm:col-span-2">
            Saving does not move anything. Use <strong>Execute transfer</strong> when the goods
            actually change warehouse.
          </p>
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
