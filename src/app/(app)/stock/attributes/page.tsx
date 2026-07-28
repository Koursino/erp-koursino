import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";
import type { ProductAttribute } from "@/lib/types";
import { AttributeCard, NewAttributeButton } from "./attribute-manager";

export const dynamic = "force-dynamic";

export default async function AttributesPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Article attributes" />
        <SetupNotice />
      </>
    );
  }

  const { data } = await supabase
    .from("product_attributes")
    .select("*, product_attribute_values(*)")
    .order("position");

  const attributes = ((data ?? []) as ProductAttribute[]).map((a) => ({
    ...a,
    product_attribute_values: [...(a.product_attribute_values ?? [])].sort(
      (x, y) => x.position - y.position || x.label.localeCompare(y.label)
    ),
  }));

  return (
    <>
      <PageHeader
        title="Article attributes"
        subtitle="What describes an article — colour and material to start with, yours to extend"
        action={<NewAttributeButton />}
      />

      <Card className="mb-6 p-4 text-sm text-zinc-600">
        Attributes flagged <strong>in SKU</strong> contribute a segment to every article code:{" "}
        <code className="rounded bg-zinc-100 px-1 font-mono text-xs">
          SUPPLIER/MODEL/COLOUR/0001
        </code>
        . Renaming a value code, reordering attributes or toggling the flag rebuilds the affected
        codes automatically.
      </Card>

      {attributes.length === 0 ? (
        <EmptyState title="No attributes yet" hint="Add one with “New attribute”." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {attributes.map((attribute) => (
            <AttributeCard key={attribute.id} attribute={attribute} />
          ))}
        </div>
      )}
    </>
  );
}
