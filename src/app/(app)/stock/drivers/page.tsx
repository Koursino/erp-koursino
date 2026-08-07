import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";
import type { Driver } from "@/lib/types";
import { NewDriverButton, DriverRowActions } from "./driver-form";

export const dynamic = "force-dynamic";

export default async function DriversPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Livreurs" />
        <SetupNotice />
      </>
    );
  }

  const [driversRes, countsRes] = await Promise.all([
    supabase.from("drivers").select("*").order("name"),
    supabase.from("delivery_notes").select("driver_id"),
  ]);

  const drivers = (driversRes.data ?? []) as Driver[];
  const counts = new Map<string, number>();
  for (const row of (countsRes.data ?? []) as { driver_id: string }[]) {
    counts.set(row.driver_id, (counts.get(row.driver_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title="Livreurs"
        subtitle="Chaque bon de livraison porte le nom d'un livreur — client ou transfert entre entrepôts"
        action={<NewDriverButton />}
      />

      {drivers.length === 0 ? (
        <EmptyState
          title="Aucun livreur"
          hint="Créez-en un avant la première livraison : elle en exige un."
        />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">Livreur</th>
                <th className="px-5 py-3 font-medium">Téléphone</th>
                <th className="px-5 py-3 text-right font-medium">Livraisons</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {drivers.map((driver) => (
                <tr key={driver.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-3 font-medium">
                    {driver.name}
                    {!driver.is_active && (
                      <span className="ml-2">
                        <Badge tone="zinc">inactif</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{driver.phone ?? "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-600">
                    {counts.get(driver.id) ?? 0}
                  </td>
                  <td className="px-5 py-3">
                    <DriverRowActions driver={driver} />
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
