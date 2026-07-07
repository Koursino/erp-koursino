"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import type { Company, Contact } from "@/lib/types";
import { createContact, updateContact, deleteContact } from "./actions";

type CompanyOption = Pick<Company, "id" | "name">;

export function NewContactButton({ companies }: { companies: CompanyOption[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ New contact</Button>;
  return <ContactForm companies={companies} onClose={() => setOpen(false)} />;
}

export function ContactRowActions({ contact, companies }: { contact: Contact; companies: CompanyOption[] }) {
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
            if (confirm(`Delete contact "${contact.first_name} ${contact.last_name}"?`)) {
              startTransition(async () => {
                await deleteContact(contact.id);
              });
            }
          }}
        >
          Delete
        </Button>
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-6 pt-16">
          <ContactForm contact={contact} companies={companies} onClose={() => setEditing(false)} />
        </div>
      )}
    </>
  );
}

function ContactForm({
  contact,
  companies,
  onClose,
}: {
  contact?: Contact;
  companies: CompanyOption[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    startTransition(async () => {
      const result = contact ? await updateContact(contact.id, fd) : await createContact(fd);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Card className="w-full max-w-2xl p-6">
      <h3 className="mb-4 text-base font-semibold">{contact ? "Edit contact" : "New contact"}</h3>
      <form action={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="first_name">First name *</Label>
          <Input id="first_name" name="first_name" required defaultValue={contact?.first_name} />
        </div>
        <div>
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" name="last_name" defaultValue={contact?.last_name} />
        </div>
        <div>
          <Label htmlFor="company_id">Company</Label>
          <Select id="company_id" name="company_id" defaultValue={contact?.company_id ?? ""}>
            <option value="">— none —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="role">Role</Label>
          <Input id="role" name="role" defaultValue={contact?.role ?? ""} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={contact?.email ?? ""} />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={contact?.phone ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" defaultValue={contact?.notes ?? ""} />
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
  );
}
