"use client";

import { useState } from "react";
import { Button, Input, Select } from "./ui";
import {
  productLabel,
  type OrderLineInput,
  type Product,
  type Warehouse,
} from "@/lib/types";

export type ProductOption = Pick<Product, "id" | "sku" | "name" | "attributes_summary">;
export type WarehouseOption = Pick<Warehouse, "id" | "code" | "name">;

type Alloc = { warehouse_id: string; quantity: string };
type Row = { product_id: string; quantity: string; unit_price: string; allocations: Alloc[] };

const emptyRow = (warehouseId?: string): Row => ({
  product_id: "",
  quantity: "1",
  unit_price: "",
  allocations: warehouseId !== undefined ? [{ warehouse_id: warehouseId, quantity: "1" }] : [],
});

const sum = (allocations: Alloc[]) =>
  allocations.reduce((total, a) => total + (Number(a.quantity) || 0), 0);

/**
 * Editable article lines shared by purchase orders, sales orders, delivery
 * notes and transfers. The rows are serialised into a single hidden field so
 * the whole document is submitted with one server action.
 *
 * Pass `warehouses` for a document whose units can come from several places:
 * each article line then owns one sub-row per warehouse, and its quantity is
 * the sum of those rows — it is never typed on its own.
 */
export function LineEditor({
  products,
  defaultLines = [],
  withPrice = true,
  priceLabel = "Unit price",
  name = "lines",
  /** Quantity available per article, used to warn before the server refuses. */
  available,
  /** Turns on the per-warehouse split. */
  warehouses,
  /** Warehouse proposed on a new sub-row. */
  defaultWarehouseId,
  /** Available quantity per article and per warehouse: product → warehouse → qty. */
  availableByWarehouse,
}: {
  products: ProductOption[];
  defaultLines?: OrderLineInput[];
  withPrice?: boolean;
  priceLabel?: string;
  name?: string;
  available?: Record<string, number>;
  warehouses?: WarehouseOption[];
  defaultWarehouseId?: string;
  availableByWarehouse?: Record<string, Record<string, number>>;
}) {
  const split = warehouses !== undefined && warehouses.length > 0;
  const fallbackWarehouse = defaultWarehouseId ?? warehouses?.[0]?.id ?? "";

  const [rows, setRows] = useState<Row[]>(
    defaultLines.length > 0
      ? defaultLines.map((l) => ({
          product_id: l.product_id,
          quantity: String(l.quantity),
          unit_price: l.unit_price != null ? String(l.unit_price) : "",
          allocations:
            l.allocations?.map((a) => ({
              warehouse_id: a.warehouse_id,
              quantity: String(a.quantity),
            })) ??
            (split ? [{ warehouse_id: fallbackWarehouse, quantity: String(l.quantity) }] : []),
        }))
      : [emptyRow(split ? fallbackWarehouse : undefined)]
  );

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const updateAlloc = (index: number, allocIndex: number, patch: Partial<Alloc>) =>
    setRows((current) =>
      current.map((row, i) =>
        i === index
          ? {
              ...row,
              allocations: row.allocations.map((a, j) =>
                j === allocIndex ? { ...a, ...patch } : a
              ),
            }
          : row
      )
    );

  const payload = JSON.stringify(
    rows
      .filter((r) => r.product_id && (split ? sum(r.allocations) > 0 : Number(r.quantity) > 0))
      .map((r) => ({
        product_id: r.product_id,
        quantity: split ? sum(r.allocations) : Number(r.quantity),
        unit_price: r.unit_price === "" ? null : Number(r.unit_price),
        allocations: split
          ? r.allocations
              .filter((a) => a.warehouse_id && Number(a.quantity) > 0)
              .map((a) => ({ warehouse_id: a.warehouse_id, quantity: Number(a.quantity) }))
          : undefined,
      }))
  );

  return (
    <div>
      <input type="hidden" name={name} value={payload} />
      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2 font-medium">Article</th>
              <th className="w-28 px-3 py-2 font-medium">Qty</th>
              {withPrice && <th className="w-32 px-3 py-2 font-medium">{priceLabel}</th>}
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row, i) => {
              const total = sum(row.allocations);
              const stock = available?.[row.product_id];
              const short = stock != null && Number(row.quantity) > stock;
              const perWarehouse = availableByWarehouse?.[row.product_id];

              return (
                <tr key={i} className="align-top">
                  <td className="px-3 py-2">
                    <Select
                      value={row.product_id}
                      onChange={(e) => update(i, { product_id: e.target.value })}
                    >
                      <option value="">— select an article —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {productLabel(p)}
                        </option>
                      ))}
                    </Select>

                    {stock != null && !split && (
                      <p className={short ? "mt-1 text-xs text-red-600" : "mt-1 text-xs text-zinc-500"}>
                        {stock} in stock
                        {short && " — not enough"}
                      </p>
                    )}

                    {/* The warehouse detail: one small row per warehouse. */}
                    {split && warehouses && (
                      <div className="mt-2 border-l-2 border-zinc-200 pl-3">
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                          Taken from
                        </p>
                        {row.allocations.map((alloc, j) => {
                          const inStock = perWarehouse?.[alloc.warehouse_id];
                          const missing = inStock != null && Number(alloc.quantity) > inStock;
                          return (
                            <div key={j} className="mb-1 flex items-center gap-2">
                              <Select
                                className="h-8 w-40 py-1 text-xs"
                                value={alloc.warehouse_id}
                                onChange={(e) => updateAlloc(i, j, { warehouse_id: e.target.value })}
                              >
                                <option value="">— warehouse —</option>
                                {warehouses.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.code} — {w.name}
                                  </option>
                                ))}
                              </Select>
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                className="h-8 w-20 py-1 text-xs"
                                value={alloc.quantity}
                                onChange={(e) => updateAlloc(i, j, { quantity: e.target.value })}
                              />
                              <span
                                className={
                                  missing ? "text-[11px] text-red-600" : "text-[11px] text-zinc-500"
                                }
                              >
                                {inStock == null
                                  ? ""
                                  : missing
                                    ? `${inStock} in stock — not enough`
                                    : `${inStock} in stock`}
                              </span>
                              <button
                                type="button"
                                className="ml-auto px-1 text-xs text-zinc-400 hover:text-red-600"
                                onClick={() =>
                                  setRows((c) =>
                                    c.map((r, k) =>
                                      k === i
                                        ? { ...r, allocations: r.allocations.filter((_, m) => m !== j) }
                                        : r
                                    )
                                  )
                                }
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                          onClick={() =>
                            setRows((c) =>
                              c.map((r, k) =>
                                k === i
                                  ? {
                                      ...r,
                                      allocations: [
                                        ...r.allocations,
                                        {
                                          warehouse_id:
                                            warehouses.find(
                                              (w) =>
                                                !r.allocations.some((a) => a.warehouse_id === w.id)
                                            )?.id ?? "",
                                          quantity: "1",
                                        },
                                      ],
                                    }
                                  : r
                              )
                            )
                          }
                        >
                          + warehouse
                        </button>
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-2">
                    {split ? (
                      // Never typed: a line quantity is what its warehouses add up to.
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-900">
                        {total}
                      </div>
                    ) : (
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={row.quantity}
                        onChange={(e) => update(i, { quantity: e.target.value })}
                      />
                    )}
                  </td>

                  {withPrice && (
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.unit_price}
                        onChange={(e) => update(i, { unit_price: e.target.value })}
                      />
                    </td>
                  )}

                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-zinc-400"
                      onClick={() =>
                        setRows((c) =>
                          c.length === 1
                            ? [emptyRow(split ? fallbackWarehouse : undefined)]
                            : c.filter((_, j) => j !== i)
                        )
                      }
                    >
                      ×
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="mt-2"
        onClick={() => setRows((c) => [...c, emptyRow(split ? fallbackWarehouse : undefined)])}
      >
        + Add line
      </Button>
    </div>
  );
}
