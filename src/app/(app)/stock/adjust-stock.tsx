"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { productLabel, type Product, type Warehouse } from "@/lib/types";
import { adjustStock } from "./actions";

type ProductOption = Pick<Product, "id" | "sku" | "name" | "attributes_summary">;
type WarehouseOption = Pick<Warehouse, "id" | "code" | "name">;

export function ManualEntryButton({
  products,
  warehouses,
  /** Pre-selected pair when the button is opened from a stock row. */
  productId,
  warehouseId,
  label = "Manual entry",
  variant = "primary",
}: {
  products: ProductOption[];
  warehouses: WarehouseOption[];
  productId?: string;
  warehouseId?: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        onClick={() => setOpen(true)}
        disabled={products.length === 0 || warehouses.length === 0}
      >
        {label}
      </Button>
      {open && (
        <ManualEntryForm
          products={products}
          warehouses={warehouses}
          productId={productId}
          warehouseId={warehouseId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ManualEntryForm({
  products,
  warehouses,
  productId,
  warehouseId,
  onClose,
}: {
  products: ProductOption[];
  warehouses: WarehouseOption[];
  productId?: string;
  warehouseId?: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = await adjustStock(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-xl p-6">
        <h3 className="mb-1 text-base font-semibold">Manual stock entry</h3>
        <p className="mb-4 text-sm text-zinc-500">
          Use this for a physical count, an opening balance, breakage or loss — anything without a
          purchase order or transfer behind it.
        </p>
        <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="product_id">Article *</Label>
            <Select id="product_id" name="product_id" required defaultValue={productId}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {productLabel(p)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="warehouse_id">Warehouse *</Label>
            <Select id="warehouse_id" name="warehouse_id" required defaultValue={warehouseId}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="mode">Direction</Label>
            <Select id="mode" name="mode" defaultValue="add">
              <option value="add">Add to stock</option>
              <option value="remove">Remove from stock</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="quantity">Quantity *</Label>
            <Input id="quantity" name="quantity" type="number" min="1" step="1" required defaultValue={1} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="note">Note *</Label>
            <Textarea
              id="note"
              name="note"
              required
              placeholder="Physical count 28/07 — 3 units found in the back room"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Mandatory: it is the only record of why this quantity changed.
            </p>
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Post entry"}
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
