"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { formatDhs } from "@/lib/format";
import type { Order, OrderLine } from "@/lib/types";
import { addOrderLine, removeOrderLine, updateOrderLine } from "../actions";

type ProductOption = { id: string; name: string; unit_price_ht: number; vat_rate: number };

// Lines editable in Brouillon and Confirmée (mirrors LINE_EDITABLE_STATES in actions.ts).
const LINE_EDITABLE_STATES = ["brouillon", "confirmee"];

function lineTtc(unitPrice: number, quantity: number, discount: number, vatRate: number) {
  const ht = quantity * unitPrice * (1 - discount / 100);
  return ht * (1 + vatRate / 100);
}

export function OrderLinesEditor({
  order,
  lines,
  products,
}: {
  order: Order;
  lines: OrderLine[];
  products: ProductOption[];
}) {
  const editable = LINE_EDITABLE_STATES.includes(order.state);

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between px-5 py-4">
        <h3 className="text-sm font-semibold text-zinc-700">Lignes de commande</h3>
        <span className="text-xs text-zinc-400">
          {lines.length} ligne{lines.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-y border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-5 py-2 font-medium">Produit</th>
              <th className="px-3 py-2 text-right font-medium">PU HT</th>
              <th className="px-3 py-2 text-right font-medium">Qté</th>
              <th className="px-3 py-2 text-right font-medium">Remise</th>
              <th className="px-3 py-2 text-right font-medium">Sous-total HT</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-sm text-zinc-400">
                  Aucune ligne pour l’instant.
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <LineRow key={line.id} line={line} editable={editable} />
            ))}
          </tbody>
        </table>
      </div>
      {editable ? (
        <AddLineForm orderId={order.id} products={products} />
      ) : (
        <p className="px-5 py-3 text-xs text-zinc-400">
          Les lignes ne sont modifiables qu’en Brouillon ou Confirmée.
        </p>
      )}
    </Card>
  );
}

function LineRow({ line, editable }: { line: OrderLine; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <tr className="hover:bg-zinc-50">
      <td className="px-5 py-2 font-medium text-zinc-900">{line.description}</td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{formatDhs(line.unit_price_ht)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
        {line.discount_percent > 0 ? `${line.discount_percent} %` : "—"}
      </td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatDhs(line.subtotal_ht)}</td>
      <td className="px-5 py-2 text-right">
        {editable && (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Modifier
            </Button>
            <Button
              variant="ghost"
              className="text-red-600"
              disabled={pending}
              onClick={() => {
                if (confirm(`Retirer « ${line.description} » ?`)) {
                  startTransition(async () => {
                    await removeOrderLine(line.id);
                  });
                }
              }}
            >
              Retirer
            </Button>
          </div>
        )}
        {editing && <LineEditModal line={line} onClose={() => setEditing(false)} />}
      </td>
    </tr>
  );
}

function LineEditModal({ line, onClose }: { line: OrderLine; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [price, setPrice] = useState(String(line.unit_price_ht));
  const [qty, setQty] = useState(String(line.quantity));
  const [discount, setDiscount] = useState(String(line.discount_percent));

  const p = parseFloat(price);
  const q = parseFloat(qty);
  const d = parseFloat(discount);
  const ttc = [p, q, d].every(Number.isFinite) ? lineTtc(p, q, d, line.vat_rate) : null;

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateOrderLine(line.id, fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16 text-left">
      <Card className="w-full max-w-md p-6">
        <h3 className="mb-4 text-base font-semibold">{line.description}</h3>
        <form action={submit} className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="unit_price_ht">PU HT (Dhs)</Label>
            <Input
              id="unit_price_ht"
              name="unit_price_ht"
              type="number"
              step="0.01"
              min="0"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="quantity">Quantité</Label>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              step="0.001"
              min="0"
              required
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="discount_percent">Remise %</Label>
            <Input
              id="discount_percent"
              name="discount_percent"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
          <div>
            <Label>TTC ligne (TVA {line.vat_rate}%)</Label>
            <Input readOnly tabIndex={-1} value={ttc !== null ? formatDhs(ttc) : "—"} className="bg-zinc-50 text-zinc-500" />
          </div>
          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
          <div className="col-span-2 flex gap-2">
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

function AddLineForm({ orderId, products }: { orderId: string; products: ProductOption[] }) {
  const [productId, setProductId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = products.find((p) => p.id === productId);

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addOrderLine(orderId, fd);
      if (result.error) setError(result.error);
      else setProductId(""); // uncontrolled fields reset with the form action
    });
  }

  return (
    <form action={submit} className="border-t border-zinc-200 px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <Label htmlFor="product_id">Ajouter un produit</Label>
          <Select
            id="product_id"
            name="product_id"
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="" disabled>
              — choisir dans le catalogue —
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatDhs(p.unit_price_ht)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-28">
          <Label htmlFor="add_price">PU HT</Label>
          <Input
            id="add_price"
            name="unit_price_ht"
            type="number"
            step="0.01"
            min="0"
            placeholder={selected ? String(selected.unit_price_ht) : "catalogue"}
          />
        </div>
        <div className="w-24">
          <Label htmlFor="add_qty">Qté</Label>
          <Input id="add_qty" name="quantity" type="number" step="0.001" min="0" defaultValue="1" />
        </div>
        <div className="w-24">
          <Label htmlFor="add_discount">Remise %</Label>
          <Input id="add_discount" name="discount_percent" type="number" step="0.01" min="0" max="100" defaultValue="0" />
        </div>
        <Button type="submit" disabled={pending || !productId}>
          {pending ? "…" : "Ajouter"}
        </Button>
      </div>
      {selected && (
        <p className="mt-2 text-xs text-zinc-400">
          Prix catalogue : {formatDhs(selected.unit_price_ht)} · TVA {selected.vat_rate}%. Laissez « PU HT »
          vide pour reprendre le prix catalogue.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
