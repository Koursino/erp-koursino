"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import {
  PURCHASE_ORDER_STATUSES,
  purchaseOrderStatusLabel,
  type Company,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type SupplierCatalogEntry,
} from "@/lib/types";
import {
  updatePurchaseOrder,
  movePurchaseOrder,
  deletePurchaseOrder,
  addLine,
  updateLine,
  deleteLine,
} from "../actions";

type SupplierOption = Pick<Company, "id" | "name">;

export function PurchaseOrderDetail({
  order,
  lines,
  catalog,
  suppliers,
}: {
  order: PurchaseOrder;
  lines: PurchaseOrderLine[];
  catalog: SupplierCatalogEntry[];
  suppliers: SupplierOption[];
}) {
  const router = useRouter();
  const [editingHeader, setEditingHeader] = useState(false);
  const [, startTransition] = useTransition();

  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: order.currency }).format(n);
  const total = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0);

  const statusKind = PURCHASE_ORDER_STATUSES.find((s) => s.key === order.status)?.kind;
  const statusTone = statusKind === "done" ? "green" : statusKind === "cancelled" ? "red" : "blue";

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-lg font-semibold text-zinc-900">
                {order.reference ?? "Bon de commande"}
              </h1>
              <Badge tone={statusTone}>{purchaseOrderStatusLabel(order.status)}</Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {order.companies?.name ?? "Sans fournisseur"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-zinc-500">Statut</label>
            <Select
              value={order.status}
              onChange={(e) => {
                const status = e.target.value;
                startTransition(async () => {
                  await movePurchaseOrder(order.id, status);
                });
              }}
              className="w-auto"
            >
              {PURCHASE_ORDER_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
            <a
              href={`/print/purchase-order/${order.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="secondary">Imprimer / PDF</Button>
            </a>
            <Button variant="secondary" onClick={() => setEditingHeader((v) => !v)}>
              {editingHeader ? "Fermer" : "Modifier"}
            </Button>
          </div>
        </div>

        {editingHeader ? (
          <HeaderForm
            order={order}
            suppliers={suppliers}
            onClose={() => setEditingHeader(false)}
          />
        ) : (
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">Date</dt>
              <dd className="mt-0.5 text-zinc-700">
                {order.order_date ? new Date(order.order_date).toLocaleDateString("fr-FR") : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">Livraison attendue</dt>
              <dd className="mt-0.5 text-zinc-700">
                {order.expected_date
                  ? new Date(order.expected_date).toLocaleDateString("fr-FR")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">Devise</dt>
              <dd className="mt-0.5 text-zinc-700">{order.currency}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">Notes</dt>
              <dd className="mt-0.5 text-zinc-700">{order.notes ?? "—"}</dd>
            </div>
          </dl>
        )}
      </Card>

      {/* Lines */}
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Lignes</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucune ligne. Ajoutez un produit ci-dessous.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3 font-medium">Désignation</th>
                <th className="py-2 px-3 text-right font-medium">Qté</th>
                <th className="py-2 px-3 text-right font-medium">Prix unitaire</th>
                <th className="py-2 px-3 text-right font-medium">Total</th>
                <th className="py-2 pl-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {lines.map((line) => (
                <LineRow key={line.id} line={line} poId={order.id} fmt={fmt} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200">
                <td colSpan={3} className="py-3 pr-3 text-right text-sm font-medium text-zinc-500">
                  Total
                </td>
                <td className="py-3 px-3 text-right text-base font-semibold text-zinc-900">
                  {fmt(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}

        <AddLineForm poId={order.id} catalog={catalog} />
      </Card>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          className="text-red-600"
          onClick={() => {
            if (confirm(`Supprimer le bon de commande ${order.reference ?? ""} ?`)) {
              startTransition(async () => {
                await deletePurchaseOrder(order.id);
                router.push("/purchase-orders");
              });
            }
          }}
        >
          Supprimer ce bon de commande
        </Button>
      </div>
    </div>
  );
}

function HeaderForm({
  order,
  suppliers,
  onClose,
}: {
  order: PurchaseOrder;
  suppliers: SupplierOption[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = await updatePurchaseOrder(order.id, fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <form action={submit} className="mt-4 grid grid-cols-1 gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="supplier_id">Fournisseur</Label>
        <Select id="supplier_id" name="supplier_id" defaultValue={order.supplier_id ?? ""}>
          <option value="">— aucun —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="currency">Devise</Label>
        <Select id="currency" name="currency" defaultValue={order.currency}>
          {["MAD", "EUR", "USD", "GBP"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="order_date">Date</Label>
        <Input id="order_date" name="order_date" type="date" defaultValue={order.order_date ?? ""} />
      </div>
      <div>
        <Label htmlFor="expected_date">Livraison attendue</Label>
        <Input
          id="expected_date"
          name="expected_date"
          type="date"
          defaultValue={order.expected_date ?? ""}
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={order.notes ?? ""} />
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
  );
}

function LineRow({
  line,
  poId,
  fmt,
}: {
  line: PurchaseOrderLine;
  poId: string;
  fmt: (n: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <tr>
        <td colSpan={5} className="py-2">
          <form
            action={(fd) => {
              startTransition(async () => {
                const result = await updateLine(line.id, poId, fd);
                if (result.error) setError(result.error);
                else setEditing(false);
              });
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="min-w-40 flex-1">
              <Label htmlFor={`desc-${line.id}`}>Désignation</Label>
              <Input id={`desc-${line.id}`} name="description" defaultValue={line.description} required />
            </div>
            <div className="w-24">
              <Label htmlFor={`qty-${line.id}`}>Qté</Label>
              <Input
                id={`qty-${line.id}`}
                name="quantity"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={line.quantity}
              />
            </div>
            <div className="w-32">
              <Label htmlFor={`price-${line.id}`}>Prix unitaire</Label>
              <Input
                id={`price-${line.id}`}
                name="unit_price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={line.unit_price}
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "…" : "OK"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Annuler
            </Button>
            {error && <p className="w-full text-sm text-red-600">{error}</p>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-zinc-50">
      <td className="py-2 pr-3 text-zinc-800">{line.description}</td>
      <td className="py-2 px-3 text-right tabular-nums text-zinc-600">{line.quantity}</td>
      <td className="py-2 px-3 text-right tabular-nums text-zinc-600">{fmt(Number(line.unit_price))}</td>
      <td className="py-2 px-3 text-right tabular-nums font-medium text-zinc-900">
        {fmt(Number(line.quantity) * Number(line.unit_price))}
      </td>
      <td className="py-2 pl-3">
        <div className="flex justify-end gap-1">
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
          >
            Éditer
          </button>
          <button
            onClick={() => {
              if (confirm("Supprimer cette ligne ?")) {
                startTransition(async () => {
                  await deleteLine(line.id, poId);
                });
              }
            }}
            className="ml-2 text-xs font-medium text-red-600 hover:underline"
          >
            Suppr.
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddLineForm({ poId, catalog }: { poId: string; catalog: SupplierCatalogEntry[] }) {
  const [productId, setProductId] = useState("");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPickProduct(id: string) {
    setProductId(id);
    const entry = catalog.find((c) => c.product_id === id);
    if (entry) {
      setDescription(entry.products?.name ?? "");
      setUnitPrice(entry.unit_price != null ? String(entry.unit_price) : "");
    }
  }

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = await addLine(poId, fd);
      if (result.error) {
        setError(result.error);
      } else {
        setProductId("");
        setDescription("");
        setUnitPrice("");
        setError(null);
      }
    });
  }

  return (
    <form action={submit} className="mt-5 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-4">
      <div className="min-w-48 flex-1">
        <Label htmlFor="add-product">Produit du catalogue</Label>
        <Select
          id="add-product"
          name="product_id"
          value={productId}
          onChange={(e) => onPickProduct(e.target.value)}
        >
          <option value="">— libre / hors catalogue —</option>
          {catalog.map((c) => (
            <option key={c.id} value={c.product_id}>
              {c.products?.name ?? "Produit"}
              {c.unit_price != null ? ` — ${c.unit_price} ${c.currency}` : ""}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-40 flex-1">
        <Label htmlFor="add-desc">Désignation</Label>
        <Input
          id="add-desc"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Désignation de la ligne"
          required
        />
      </div>
      <div className="w-24">
        <Label htmlFor="add-qty">Qté</Label>
        <Input id="add-qty" name="quantity" type="number" step="0.01" min="0.01" defaultValue="1" />
      </div>
      <div className="w-32">
        <Label htmlFor="add-price">Prix unitaire</Label>
        <Input
          id="add-price"
          name="unit_price"
          type="number"
          step="0.01"
          min="0"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Ajout…" : "+ Ajouter"}
      </Button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
