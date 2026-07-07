"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Button, Card, Input, Label, Select, Textarea, cn } from "@/components/ui";
import type { Company, Contact, Deal, DealStage } from "@/lib/types";
import { createDeal, updateDeal, moveDeal, deleteDeal } from "./actions";

type CompanyOption = Pick<Company, "id" | "name">;
type ContactOption = Pick<Contact, "id" | "first_name" | "last_name" | "company_id">;

const fmtMoney = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

export function Kanban({
  stages,
  deals,
  companies,
  contacts,
}: {
  stages: DealStage[];
  deals: Deal[];
  companies: CompanyOption[];
  contacts: ContactOption[];
}) {
  const [, startTransition] = useTransition();
  const [optimisticDeals, applyMove] = useOptimistic(
    deals,
    (state, move: { dealId: string; stageId: string }) =>
      state.map((d) => (d.id === move.dealId ? { ...d, stage_id: move.stageId } : d))
  );
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [creating, setCreating] = useState(false);

  function onDrop(e: React.DragEvent, stageId: string) {
    e.preventDefault();
    setDragOverStage(null);
    const dealId = e.dataTransfer.getData("text/deal-id");
    if (!dealId) return;
    const deal = optimisticDeals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === stageId) return;
    startTransition(async () => {
      applyMove({ dealId, stageId });
      await moveDeal(dealId, stageId);
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)}>+ New deal</Button>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageDeals = optimisticDeals.filter((d) => d.stage_id === stage.id);
          const total = stageDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage.id);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => onDrop(e, stage.id)}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl border bg-zinc-100/70 transition-colors",
                dragOverStage === stage.id ? "border-zinc-500 bg-zinc-200/70" : "border-zinc-200"
              )}
            >
              <div className="flex items-center justify-between px-4 pb-2 pt-3">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      stage.is_won ? "bg-emerald-500" : stage.is_lost ? "bg-red-400" : "bg-blue-400"
                    )}
                  />
                  <span className="text-sm font-semibold text-zinc-700">{stage.name}</span>
                  <span className="text-xs text-zinc-400">{stageDeals.length}</span>
                </span>
                <span className="text-xs font-medium text-zinc-500">{total > 0 && fmtMoney(total)}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
                {stageDeals.map((deal) => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/deal-id", deal.id)}
                    onClick={() => setEditingDeal(deal)}
                    className="cursor-grab rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                  >
                    <p className="text-sm font-medium text-zinc-900">{deal.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{deal.companies?.name ?? "No company"}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-zinc-800">
                        {deal.value != null ? fmtMoney(deal.value, deal.currency) : "—"}
                      </span>
                      {deal.expected_close_date && (
                        <span className="text-[11px] text-zinc-400">
                          {new Date(deal.expected_close_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {stageDeals.length === 0 && (
                  <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-400">
                    Drop deals here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(creating || editingDeal) && (
        <DealFormOverlay
          deal={editingDeal ?? undefined}
          stages={stages}
          companies={companies}
          contacts={contacts}
          onClose={() => {
            setCreating(false);
            setEditingDeal(null);
          }}
        />
      )}
    </>
  );
}

function DealFormOverlay({
  deal,
  stages,
  companies,
  contacts,
  onClose,
}: {
  deal?: Deal;
  stages: DealStage[];
  companies: CompanyOption[];
  contacts: ContactOption[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = deal ? await updateDeal(deal.id, fd) : await createDeal(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-2xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{deal ? "Edit deal" : "New deal"}</h3>
          {deal && (
            <Button
              variant="ghost"
              className="text-red-600"
              onClick={() => {
                if (confirm(`Delete deal "${deal.title}"?`)) {
                  startTransition(async () => {
                    await deleteDeal(deal.id);
                    onClose();
                  });
                }
              }}
            >
              Delete
            </Button>
          )}
        </div>
        <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" name="title" required defaultValue={deal?.title} />
          </div>
          <div>
            <Label htmlFor="stage_id">Stage</Label>
            <Select id="stage_id" name="stage_id" defaultValue={deal?.stage_id ?? stages[0]?.id}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="value">Value (EUR)</Label>
            <Input id="value" name="value" type="number" step="0.01" min="0" defaultValue={deal?.value ?? ""} />
          </div>
          <div>
            <Label htmlFor="company_id">Company</Label>
            <Select id="company_id" name="company_id" defaultValue={deal?.company_id ?? ""}>
              <option value="">— none —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="contact_id">Contact</Label>
            <Select id="contact_id" name="contact_id" defaultValue={deal?.contact_id ?? ""}>
              <option value="">— none —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="expected_close_date">Expected close date</Label>
            <Input
              id="expected_close_date"
              name="expected_close_date"
              type="date"
              defaultValue={deal?.expected_close_date ?? ""}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={deal?.notes ?? ""} />
          </div>
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
