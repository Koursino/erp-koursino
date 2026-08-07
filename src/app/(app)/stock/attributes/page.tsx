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
        <PageHeader title="Attributs des articles" />
        <SetupNotice />
      </>
    );
  }

  const { data } = await supabase
    .from("product_attributes")
    .select("*, product_attribute_values!product_attribute_values_attribute_id_fkey(*)")
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
        title="Attributs des articles"
        subtitle="Ce qui décrit un article — catégorie, couleur et matière au départ, à vous de les étendre"
        action={<NewAttributeButton />}
      />

      <Card className="mb-6 space-y-2 p-4 text-sm text-zinc-600">
        <p>
          Les attributs marqués <strong>dans le SKU</strong> ajoutent un segment au code de chaque
          article :{" "}
          <code className="rounded bg-zinc-100 px-1 font-mono text-xs">
            FOURNISSEUR/MODELE/COULEUR/0001
          </code>
          . Renommer un code de valeur, réordonner les attributs ou changer l&apos;option reconstruit
          automatiquement les codes concernés.
        </p>
        <p>
          <strong>Catégorie</strong> est un attribut comme les autres : ajoutez-y « Tables »,
          « Pieds »… et la valeur remonte aussitôt dans le catalogue et ses filtres.{" "}
          <strong>Couleur</strong> accepte deux valeurs : une seule pour une couleur unique, deux
          pour un article bicolore.
        </p>
      </Card>

      {attributes.length === 0 ? (
        <EmptyState title="Aucun attribut" hint="Ajoutez-en un avec « Nouvel attribut »." />
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
