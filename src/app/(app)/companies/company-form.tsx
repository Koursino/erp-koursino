"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import type { Company } from "@/lib/types";
import { createCompany, updateCompany, deleteCompany } from "./actions";

export function NewCompanyButton() {
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ New company</Button>;
  return <CompanyForm onClose={() => setOpen(false)} />;
}

export function CompanyRowActions({ company }: { company: Company }) {
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          variant="ghost"
          className="text-red-600"
          onClick={() => {
            if (confirm(`Delete company "${company.name}"? Its contacts and deals keep existing but lose the link.`)) {
              startTransition(async () => {
                await deleteCompany(company.id);
              });
            }
          }}
        >
          Delete
        </Button>
      </div>
      {editing && <CompanyFormOverlay company={company} onClose={() => setEditing(false)} />}
    </>
  );
}

function CompanyFormOverlay(props: { company?: Company; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
      <CompanyForm {...props} />
    </div>
  );
}

function CompanyForm({ company, onClose }: { company?: Company; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = company ? await updateCompany(company.id, fd) : await createCompany(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Card className="w-full max-w-2xl p-6">
      <h3 className="mb-4 text-base font-semibold">{company ? "Edit company" : "New company"}</h3>
      <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name *</Label>
          <Input id="name" name="name" required defaultValue={company?.name} />
        </div>
        <div>
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            name="code"
            placeholder="SAMS"
            maxLength={12}
            defaultValue={company?.code ?? ""}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Supplier abbreviation opening every article SKU. Defaults to the first 6 letters of the name.
          </p>
        </div>
        <div>
          <Label htmlFor="industry">Industry</Label>
          <Input id="industry" name="industry" defaultValue={company?.industry ?? ""} />
        </div>
        <div>
          <Label htmlFor="website">Website</Label>
          <Input id="website" name="website" defaultValue={company?.website ?? ""} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={company?.email ?? ""} />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={company?.phone ?? ""} />
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" defaultValue={company?.city ?? ""} />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" defaultValue={company?.country ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" defaultValue={company?.notes ?? ""} />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
          <input
            type="checkbox"
            name="is_supplier"
            defaultChecked={company?.is_supplier}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Also a supplier (used by the supplier-payments module)
        </label>
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
  );
}
