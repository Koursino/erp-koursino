"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { ACTIVITY_TYPES, type Activity } from "@/lib/types";
import { createActivity, toggleActivityDone, deleteActivity } from "./actions";

type Option = { id: string; label: string };

export function NewActivityButton({ companies, deals }: { companies: Option[]; deals: Option[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return <Button onClick={() => setOpen(true)}>+ Log activity</Button>;

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = await createActivity(fd);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <Card className="w-full max-w-2xl p-6">
        <h3 className="mb-4 text-base font-semibold">Log activity</h3>
        <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="type">Type</Label>
            <Select id="type" name="type" defaultValue="note">
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="due_date">Due date (for tasks)</Label>
            <Input id="due_date" name="due_date" type="datetime-local" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="subject">Subject *</Label>
            <Input id="subject" name="subject" required />
          </div>
          <div>
            <Label htmlFor="company_id">Company</Label>
            <Select id="company_id" name="company_id" defaultValue="">
              <option value="">— none —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="deal_id">Deal</Label>
            <Select id="deal_id" name="deal_id" defaultValue="">
              <option value="">— none —</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="content">Details</Label>
            <Textarea id="content" name="content" />
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function ActivityRowControls({ activity }: { activity: Activity }) {
  const [, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-end gap-3">
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
        <input
          type="checkbox"
          checked={activity.done}
          onChange={(e) => {
            const done = e.target.checked;
            startTransition(async () => {
              await toggleActivityDone(activity.id, done);
            });
          }}
          className="h-4 w-4 rounded border-zinc-300"
        />
        done
      </label>
      <button
        onClick={() => {
          if (confirm(`Delete activity "${activity.subject}"?`)) {
            startTransition(async () => {
              await deleteActivity(activity.id);
            });
          }
        }}
        className="text-xs font-medium text-red-600 hover:underline"
      >
        Delete
      </button>
    </div>
  );
}
