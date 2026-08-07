"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, EmptyState, Input, Label, Select, Textarea } from "@/components/ui";
import { LineEditor, type ProductOption } from "@/components/line-editor";
import { fmtDate, fmtMoney, fmtQty, statusTone } from "@/lib/format";
import {
  ORDER_STATE_LABEL,
  isOrderEditable,
  productLabel,
  type Company,
  type Deal,
  type Driver,
  type Order,
  type StockLevel,
  type Warehouse,
} from "@/lib/types";
import {
  confirmOrder,
  createOrder,
  deleteOrder,
  deliverOrder,
  returnOrderDelivery,
  setOrderState,
  updateOrder,
} from "./actions";

type CustomerOption = Pick<Company, "id" | "name">;
type DriverOption = Pick<Driver, "id" | "name">;
type WarehouseOption = Pick<Warehouse, "id" | "code" | "name">;
type DealOption = Pick<Deal, "id" | "title">;
export type LevelRow = Pick<StockLevel, "product_id" | "warehouse_id" | "quantity">;

export function OrderList({
  orders,
  customers,
  warehouses,
  drivers,
  products,
  deals,
  levels,
}: {
  orders: Order[];
  customers: CustomerOption[];
  warehouses: WarehouseOption[];
  drivers: DriverOption[];
  products: ProductOption[];
  deals: DealOption[];
  levels: LevelRow[];
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const canCreate = customers.length > 0 && products.length > 0;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          + Nouvelle commande client
        </Button>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="Aucune commande client"
          hint="Le stock sort uniquement quand une commande est livrée."
        />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">Référence</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Lignes</th>
                <th className="px-5 py-3 font-medium">Livraison</th>
                <th className="px-5 py-3 text-right font-medium">Total TTC</th>
                <th className="px-5 py-3 font-medium">État</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders.map((order) => {
                const lines = order.order_lines ?? [];
                const ordered = lines.reduce((s, l) => s + l.quantity, 0);
                const delivered = lines.reduce((s, l) => s + l.qty_delivered, 0);
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
                      <td className="px-5 py-3 text-zinc-600">{fmtDate(order.order_date)}</td>
                      <td className="px-5 py-3 text-zinc-600">{lines.length}</td>
                      <td className="px-5 py-3 text-zinc-600">
                        {delivered > 0 ? `${fmtQty(delivered)} / ${fmtQty(ordered)}` : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {fmtMoney(order.total_ttc, order.currency)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone(order.state)}>{ORDER_STATE_LABEL[order.state]}</Badge>
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
                            drivers={drivers}
                            levels={levels}
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
        <OrderForm
          order={editing ?? undefined}
          customers={customers}
          warehouses={warehouses}
          products={products}
          deals={deals}
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
  drivers,
  levels,
  onEdit,
}: {
  order: Order;
  warehouses: WarehouseOption[];
  drivers: DriverOption[];
  levels: LevelRow[];
  onEdit: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [warehouseId, setWarehouseId] = useState(order.warehouse_id ?? warehouses[0]?.id ?? "");
  // Every delivery carries a driver — the database refuses one without.
  const [driverId, setDriverId] = useState(drivers[0]?.id ?? "");
  // Per-line quantities for a partial delivery; blank means "all still owed".
  const [partial, setPartial] = useState<Record<string, string>>({});

  const lines = order.order_lines ?? [];
  const editable = isOrderEditable(order);
  const deliverable = ["confirmee", "en_preparation"].includes(order.state);
  const owed = lines.reduce((s, l) => s + (l.quantity - l.qty_delivered), 0);
  const delivered = lines.reduce((s, l) => s + l.qty_delivered, 0);

  const available = useMemo(() => {
    const map: Record<string, number> = {};
    for (const level of levels) {
      if (level.warehouse_id === warehouseId) map[level.product_id] = level.quantity;
    }
    return map;
  }, [levels, warehouseId]);

  const run = (action: () => Promise<{ error: string | null }>) => () => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  };

  function deliver() {
    // Filled inputs restrict the delivery to those quantities; all blank
    // delivers everything still owed on every line.
    const entries = Object.entries(partial)
      .map(([lineId, value]) => ({ line_id: lineId, quantity: Number(value) }))
      .filter((e) => Number.isFinite(e.quantity) && e.quantity > 0);
    run(() => deliverOrder(order.id, warehouseId, entries.length > 0 ? entries : null, driverId))();
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {lines.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucune ligne — modifiez la commande pour en ajouter.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-1 font-medium">Article</th>
              <th className="w-24 py-1 text-right font-medium">Qté</th>
              <th className="w-24 py-1 text-right font-medium">Livrée</th>
              {deliverable && <th className="w-28 py-1 text-right font-medium">En stock</th>}
              {deliverable && <th className="w-28 py-1 text-right font-medium">À livrer</th>}
              <th className="w-28 py-1 text-right font-medium">PU HT</th>
              <th className="w-28 py-1 text-right font-medium">Sous-total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const remaining = line.quantity - line.qty_delivered;
              const stock = available[line.product_id] ?? 0;
              return (
                <tr key={line.id}>
                  <td className="py-1">
                    {line.products ? productLabel(line.products) : line.description}
                    <span className="ml-2 font-mono text-xs text-zinc-400">{line.products?.sku}</span>
                  </td>
                  <td className="py-1 text-right">{fmtQty(line.quantity)}</td>
                  <td className="py-1 text-right text-zinc-600">
                    {line.qty_delivered > 0 ? fmtQty(line.qty_delivered) : "—"}
                  </td>
                  {deliverable && (
                    <td
                      className={
                        stock < remaining
                          ? "py-1 text-right text-red-600"
                          : "py-1 text-right text-zinc-600"
                      }
                    >
                      {fmtQty(stock)}
                    </td>
                  )}
                  {deliverable && (
                    <td className="py-1 text-right">
                      {remaining > 0 ? (
                        <Input
                          type="number"
                          min="0"
                          max={remaining}
                          step="1"
                          placeholder={fmtQty(remaining)}
                          className="h-8 w-24 py-1 text-right text-xs"
                          value={partial[line.id] ?? ""}
                          onChange={(e) => setPartial((c) => ({ ...c, [line.id]: e.target.value }))}
                        />
                      ) : (
                        <span className="text-emerald-700">✓</span>
                      )}
                    </td>
                  )}
                  <td className="py-1 text-right">{fmtMoney(line.unit_price_ht, order.currency)}</td>
                  <td className="py-1 text-right">{fmtMoney(line.subtotal_ht ?? 0, order.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="mt-2 text-right text-sm text-zinc-600">
        HT {fmtMoney(order.total_ht, order.currency)} · TVA {fmtMoney(order.total_tva, order.currency)} ·{" "}
        <span className="font-semibold text-zinc-900">
          TTC {fmtMoney(order.total_ttc, order.currency)}
        </span>
      </div>

      {order.notes && <p className="mt-3 text-sm text-zinc-600">{order.notes}</p>}
      {order.delivered_at && (
        <p className="mt-3 text-sm text-emerald-700">
          Livrée le {fmtDate(order.delivered_at)} depuis {order.warehouses?.name ?? "l'entrepôt"} —
          stock décrémenté.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        {editable && (
          <>
            <Button disabled={pending || lines.length === 0} onClick={run(() => confirmOrder(order.id))}>
              Confirmer la commande
            </Button>
            <Button variant="secondary" onClick={onEdit}>
              Modifier
            </Button>
          </>
        )}

        {deliverable && owed > 0 && (
          <>
            <div>
              <Label htmlFor={`wh-${order.id}`}>Entrepôt source</Label>
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
            <div>
              <Label htmlFor={`dr-${order.id}`}>Livreur</Label>
              <Select
                id={`dr-${order.id}`}
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
            <Button disabled={pending || !warehouseId || !driverId} onClick={deliver}>
              {pending ? "En cours…" : "Livrer (− stock)"}
            </Button>
            {drivers.length === 0 && (
              <p className="w-full text-sm text-amber-700">
                Aucun livreur enregistré — créez-en un dans Stock → Livreurs avant de livrer.
              </p>
            )}
          </>
        )}

        {order.state === "livree" && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={run(() => setOrderState(order.id, "facturee"))}
          >
            Marquer facturée
          </Button>
        )}
        {order.state === "facturee" && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={run(() => setOrderState(order.id, "payee"))}
          >
            Marquer payée
          </Button>
        )}

        {delivered > 0 && order.state !== "annulee" && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const note = prompt(
                "Motif du retour en stock (obligatoire) — les articles livrés reviennent dans leur entrepôt :"
              );
              if (note && note.trim()) run(() => returnOrderDelivery(order.id, note.trim()))();
            }}
          >
            Retour en stock
          </Button>
        )}

        {!["annulee", "payee"].includes(order.state) && !editable && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={run(() => setOrderState(order.id, "annulee"))}
          >
            Annuler
          </Button>
        )}
        {editable && (
          <Button
            variant="ghost"
            className="ml-auto text-red-600"
            disabled={pending}
            onClick={() => {
              if (confirm(`Supprimer la commande ${order.reference ?? ""} ?`)) {
                run(() => deleteOrder(order.id))();
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

function OrderForm({
  order,
  customers,
  warehouses,
  products,
  deals,
  onClose,
}: {
  order?: Order;
  customers: CustomerOption[];
  warehouses: WarehouseOption[];
  products: ProductOption[];
  deals: DealOption[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = order ? await updateOrder(order.id, fd) : await createOrder(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-3xl p-6">
        <h3 className="mb-4 text-base font-semibold">
          {order ? `Modifier ${order.reference ?? "la commande"}` : "Nouvelle commande client"}
        </h3>
        <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="company_id">Client *</Label>
            <Select id="company_id" name="company_id" required defaultValue={order?.company_id ?? ""}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="warehouse_id">Entrepôt source (par défaut)</Label>
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
            <Label htmlFor="order_date">Date</Label>
            <Input
              id="order_date"
              name="order_date"
              type="date"
              defaultValue={order?.order_date ?? today}
            />
          </div>
          <div>
            <Label htmlFor="deal_id">Deal lié (CRM)</Label>
            <Select id="deal_id" name="deal_id" defaultValue={order?.deal_id ?? ""}>
              <option value="">— aucun —</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Articles vendus</Label>
            <LineEditor
              products={products}
              defaultLines={(order?.order_lines ?? []).map((l) => ({
                product_id: l.product_id,
                quantity: l.quantity,
                unit_price: l.unit_price_ht,
              }))}
              priceLabel="PU vente HT"
            />
            <p className="mt-1 text-xs text-zinc-500">
              PU laissé vide = prix catalogue de l&apos;article. TVA reprise de l&apos;article.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={order?.notes ?? ""} />
          </div>
          <p className="text-sm text-zinc-500 sm:col-span-2">
            L&apos;enregistrement ne change pas le stock. Confirmez, puis <strong>Livrer</strong> quand
            la marchandise part.
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
