import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";
import type { Contact } from "@/lib/types";
import { NewContactButton, ContactRowActions } from "./contact-form";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Contacts" />
        <SetupNotice />
      </>
    );
  }

  const [contactsRes, companiesRes] = await Promise.all([
    supabase.from("contacts").select("*, companies(id, name)").order("last_name"),
    supabase.from("companies").select("id, name").order("name"),
  ]);
  const contacts = (contactsRes.data ?? []) as Contact[];
  const companies = companiesRes.data ?? [];

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle="People at your customers and partners"
        action={<NewContactButton companies={companies} />}
      />
      {contacts.length === 0 ? (
        <EmptyState title="No contacts yet" hint="Add people and link them to their company." />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-3 font-medium">
                    {c.first_name} {c.last_name}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{c.companies?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-zinc-600">{c.role ?? "—"}</td>
                  <td className="px-5 py-3 text-zinc-600">{c.email ?? "—"}</td>
                  <td className="px-5 py-3 text-zinc-600">{c.phone ?? "—"}</td>
                  <td className="px-5 py-3">
                    <ContactRowActions contact={c} companies={companies} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
