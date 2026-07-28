"use client";

import { Fragment, useState, useTransition } from "react";
import { Badge, Button, Card, EmptyState, Input, Label, Select, Textarea } from "@/components/ui";
import { LineEditor, type ProductOption } from "@/components/line-editor";
import { fmtDate, fmtMoney, fmtQty, statusTone } from "@/lib/format";
import {
  PO_RECEIVABLE_STATUSES,
  purchaseOrderStatusLabel,
  productLabel,
  type Company,
  type PurchaseOrder,
  type Warehouse,
} from "@/lib/types";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  receivePurchaseOrder,
  setPurchaseOrderStatus,
  deletePurchaseOrder,
} from "./actions";

type SupplierOption = Pick<Company, "id" | "name">;
type WarehouseOption = Pick<Warehouse, "id" | "code" | "name">;

const orderTotal = (order: PurchaseOrder) =>
  (order.purchase_order_lines ?? []).reduce((sum, l) => sum + l.quantity * (l.unit_price ?? 0), 0);

export function PurchaseOrderList({
  orders,
  suppliers,
  warehouses,
  products,
}: {
  orders: PurchaseOrder[];
  suppliers: SupplierOption[];
  warehouses: WarehouseOption[];
  products: ProductOption[];
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const canCreate = suppliers.length > 0 && warehouses.length > 0 && products.length > 0;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          + Nouvelle commande fournisseur
        </Button>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="Aucune commande fournisseur"
          hint="Créer une commande ne change pas le stock — il bouge à la réception."
        />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">Référence</th>
                <th className="px-5 py-3 font-medium">Fournisseur</th>
                <th className="px-5 py-3 font-medium">Destination</th>
                <th className="px-5 py-3 font-medium">Prévue le</th>
                <th className="px-5 py-3 font-medium">Lignes</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders.map((order) => {
                const lines = order.purchase_order_lines ?? [];
                const isOpen = expanded === order.id;
                return (
                  <Fragment key={order.id}>
                    <tr
                      className="cursor-pointer hover:bg-zinc-50"
                      onClick={() => setExpanded(isOpen ? null : order.id)}
                    >
                      <td className="px-5 py-3 font-mono text-xs font-medium">
                        {order.reference ?? "—"}
                      </td>
                      <td className="px-5 py-3 font-medium">{order.companies?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-zinc-600">{order.warehouses?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-zinc-600">{fmtDate(order.expected_date)}</td>
                      <td className="px-5 py-3 text-zinc-600">{lines.length}</td>
                      <td className="px-5 py-3">{fmtMoney(orderTotal(order), order.currency)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone(order.status)}>
                          {purchaseOrderStatusLabel(order.status)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-zinc-400">
                        {isOpen ? "▲" : "▼"}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="bg-zinc-50 px-5 py-4">
                          <OrderDetail
                            order={order}
                            warehouses={warehouses}
                            onEdit={() => setEditing(order)}
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
        <PurchaseOrderForm
          order={editing ?? undefined}
          suppliers={suppliers}
          warehouses={warehouses}
          products={products}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function OrderDetail({
  order,
  warehouses,
  onEdit,
}: {
  order: PurchaseOrder;
  warehouses: WarehouseOption[];
  onEdit: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [warehouseId, setWarehouseId] = useState(order.warehouse_id ?? warehouses[0]?.id ?? "");

  const lines = order.purchase_order_lines ?? [];
  const receivable = PO_RECEIVABLE_STATUSES.includes(order.status);
  const productLines = lines.filter((l) => l.product_id);

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
        <p className="text-sm text-zinc-500">Aucune ligne — modifiez la commande pour en ajouter.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-1 font-medium">Article</th>
              <th className="py-1 font-medium">SKU</th>
              <th className="w-24 py-1 text-right font-medium">Qté</th>
              <th className="w-28 py-1 text-right font-medium">PU</th>
              <th className="w-28 py-1 text-right font-medium">Total ligne</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="py-1">
                  {line.products ? productLabel(line.products) : line.description || "—"}
                </td>
                <td className="py-1 font-mono text-xs text-zinc-500">{line.products?.sku}</td>
                <td className="py-1 text-right">{fmtQty(line.quantity)}</td>
                <td className="py-1 text-right">{fmtMoney(line.unit_price, order.currency)}</td>
                <td className="py-1 text-right">
                  {fmtMoney(line.quantity * line.unit_price, order.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {order.notes && <p className="mt-3 text-sm text-zinc-600">{order.notes}</p>}
      {order.received_at && (
        <p className="mt-3 text-sm text-emerald-700">
          Réceptionnée le {fmtDate(order.received_at)} dans {order.warehouses?.name} — stock
          incrémenté.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        {receivable && (
          <>
            <div>
              <Label htmlFor={`wh-${order.id}`}>Entrepôt de réception</Label>
              <Select
                id={`wh-${order.id}`}
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="w-56"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              disabled={pending || productLines.length === 0 || !warehouseId}
              onClick={run(() => receivePurchaseOrder(order.id, warehouseId))}
            >
              {pending ? "En cours…" : "Réceptionner (+ stock)"}
            </Button>
            {order.status === "draft" && (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={run(() => setPurchaseOrderStatus(order.id, "ordered"))}
              >
                Marquer commandée
              </Button>
            )}
            <Button variant="secondary" onClick={onEdit}>
              Modifier
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={run(() => setPurchaseOrderStatus(order.id, "cancelled"))}
            >
              Annuler la commande
            </Button>
          </>
        )}
        {order.status === "received" && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={run(() => setPurchaseOrderStatus(order.id, "invoiced"))}
          >
            Marquer facturée
          </Button>
        )}
        {order.status === "invoiced" && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={run(() => setPurchaseOrderStatus(order.id, "paid"))}
          >
            Marquer payée
          </Button>
        )}
        {!["received", "invoiced", "paid"].includes(order.status) && (
          <Button
            variant="ghost"
            className="ml-auto text-red-600"
            disabled={pending}
            onClick={() => {
              if (confirm(`Supprimer la commande ${order.reference ?? ""} ?`)) {
                run(() => deletePurchaseOrder(order.id))();
              }
            }}
          >
            Supprimer
          </Button>
        )}
      </div>
    </div>
  );
}

function PurchaseOrderForm({
  order,
  suppliers,
  warehouses,
  products,
  onClose,
}: {
  order?: PurchaseOrder;
  suppliers: SupplierOption[];
  warehouses: WarehouseOption[];
  products: ProductOption[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = order ? await updatePurchaseOrder(order.id, fd) : await createPurchaseOrder(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-3xl p-6">
        <h3 className="mb-4 text-base font-semibold">
          {order ? `Modifier ${order.reference ?? "la commande"}` : "Nouvelle commande fournisseur"}
        </h3>
        <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="supplier_id">Fournisseur *</Label>
            <Select
              id="supplier_id"
              name="supplier_id"
              required
              defaultValue={order?.supplier_id ?? ""}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="warehouse_id">Entrepôt de destination</Label>
            <Select
              id="warehouse_id"
              name="warehouse_id"
              defaultValue={order?.warehouse_id ?? warehouses[0]?.id}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="order_date">Date de commande</Label>
            <Input
              id="order_date"
              name="order_date"
              type="date"
              defaultValue={order?.order_date ?? today}
            />
          </div>
          <div>
            <Label htmlFor="expected_date">Livraison prévue</Label>
            <Input
              id="expected_date"
              name="expected_date"
              type="date"
              defaultValue={order?.expected_date ?? ""}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Articles commandés</Label>
            <LineEditor
              products={products}
              defaultLines={(order?.purchase_order_lines ?? [])
                .filter((l) => l.product_id)
                .map((l) => ({
                  product_id: l.product_id!,
                  quantity: l.quantity,
                  unit_price: l.unit_price,
                }))}
              priceLabel="PU achat"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={order?.notes ?? ""} />
          </div>
          <p className="text-sm text-zinc-500 sm:col-span-2">
            L&apos;enregistrement ne change pas le stock. Utilisez <strong>Réceptionner</strong> à
            l&apos;arrivée de la marchandise.
          </p>
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
