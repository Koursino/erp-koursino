import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";
import type { Company } from "@/lib/types";
import { NewCompanyButton, CompanyRowActions } from "./company-form";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Companies" />
        <SetupNotice />
      </>
    );
  }

  const { data } = await supabase.from("companies").select("*").order("name");
  const companies = (data ?? []) as Company[];

  return (
    <>
      <PageHeader
        title="Companies"
        subtitle="Customers and (future) suppliers — the shared foundation of the ERP"
        action={<NewCompanyButton />}
      />
      {companies.length === 0 ? (
        <EmptyState title="No companies yet" hint="Add your first customer with “New company”." />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Industry</th>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3 text-zinc-600">{c.industry ?? "—"}</td>
                  <td className="px-5 py-3 text-zinc-600">
                    {[c.city, c.country].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{c.email ?? c.phone ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className="flex gap-1">
                      {c.is_customer && <Badge tone="blue">customer</Badge>}
                      {c.is_supplier && <Badge tone="amber">supplier</Badge>}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <CompanyRowActions company={c} />
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
