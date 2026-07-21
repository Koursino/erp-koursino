# ADR-002: Module Achats (Purchasing)

- **Statut :** Accepté
- **Date :** 2026-07-21
- **Décideur :** CEO, Koursino

## Contexte

Le module « Achats » couvre le cycle d'approvisionnement fournisseur. Il fait le
pont entre le module Stock (réception de marchandise → entrée en stock) et le
module Paiements fournisseurs (réception de facture → échéance de paiement).

Le flux initialement proposé par le CEO plaçait le bon de commande *avant* le
devis. Le flux a été corrigé : le devis (négociation) précède le bon de commande
(engagement ferme).

## Décision : un document « Achat » unique piloté par statuts

Plutôt que des documents séparés (demande de devis, bon de commande, réception),
on modélise **un seul document `purchase_orders`** qui traverse une machine à
états. Cela couvre les deux parcours réels sans dupliquer les données :

- **Achat direct (catalogue)** : les prix sont connus → on saute les étapes devis.
- **Achat négocié (RFQ)** : pas de prix connu → demande de devis d'abord.

### Machine à états

```
draft ──▶ rfq_sent ──▶ quote_received ──▶ confirmed ──▶ ordered ──▶ received ──▶ invoiced ──▶ paid
  │           (parcours négocié uniquement)        ▲                                          
  └──────────────── achat direct catalogue ────────┘                                          
                                                                          
  Statut terminal alternatif : cancelled (depuis n'importe quel état non payé)
```

| Statut | Signification | Étape CEO |
|---|---|---|
| `draft` | Brouillon en cours de constitution | — |
| `rfq_sent` | Demande de devis envoyée au fournisseur | 5 |
| `quote_received` | Devis reçu, en attente de décision | 6 |
| `confirmed` | Devis accepté / achat validé (bon de commande généré) | 7, 8 |
| `ordered` | Bon de commande envoyé au fournisseur | 4 |
| `received` | Marchandise réceptionnée → **incrémente le stock** (phase C) | (manquait) |
| `invoiced` | Facture reçue → **crée l'échéance de paiement** (phase C) | 9 |
| `paid` | Payé (piloté par le module Paiements fournisseurs) | — |
| `cancelled` | Annulé | — |

Ce document à statuts se pilote en **kanban**, comme le pipeline commercial du CRM.

## Modèle de données

### Phase A — Fournisseurs, produits, catalogue

- **`companies`** (existant, 0001) : un fournisseur est une company avec `is_supplier = true`.
- **`products`** (existant, `0002_products_catalog.sql`) : la table produit est **déjà
  construite** par le module « Catalogue Produits » (base du futur module Ventes).
  Elle est **partagée** : un produit est vendu aux clients (prix HT/TTC de la table)
  *et* acheté aux fournisseurs (prix d'achat dans `supplier_catalog`). On la réutilise
  telle quelle plutôt que d'en créer une seconde.
- **`supplier_catalog`** (`0003_supplier_catalog.sql`) : ce qu'un fournisseur nous
  propose, à quel prix d'achat. `id, supplier_id → companies, product_id → products,
  supplier_ref, unit_price, currency, lead_time_days, min_order_qty, is_preferred,
  notes, timestamps`. Contrainte d'unicité `(supplier_id, product_id)`.
  Note : `products.unit_price_ht` est le prix de **vente** ; `supplier_catalog.unit_price`
  est le prix d'**achat** — deux nombres distincts, d'où une colonne dédiée ici.

### Phase B — Document Achat + lignes

- **`purchase_orders`** : `id, reference (auto), supplier_id → companies, status,
  currency, order_date, expected_date, notes, created_at, updated_at`.
- **`purchase_order_lines`** : `id, purchase_order_id → purchase_orders,
  product_id → products, description, quantity, unit_price, created_at`.
- Génération du bon de commande PDF + envoi email (Brevo, déjà connecté).

### Phase C — Ponts vers Stock et Paiements

- Passage à `received` → écrit un mouvement de stock (module Stock).
- Passage à `invoiced` → crée une facture / échéance (module Paiements fournisseurs).

## Feuille de route

| Phase | Contenu | Livrable |
|---|---|---|
| **A** | Fournisseurs + produits + catalogue fournisseur | CRUD produits, écran catalogue par fournisseur |
| **B** | Document Achat (statuts + kanban) + bon de commande PDF + email | Créer/suivre un achat de bout en bout |
| **C** | Réception marchandise → stock ; facture → paiements | Intégration inter-modules |

## Alternatives écartées

- **Documents séparés (RFQ / PO / réception distincts) :** rejeté — duplication
  des lignes et des données, et l'utilisateur doit re-saisir. Le document unique
  à statuts est plus simple et reflète mieux la réalité d'une PME.
- **Suivre le flux original (bon de commande avant devis) :** rejeté — non
  conforme au processus achat standard ; aurait cassé le schéma à l'ajout du
  parcours négocié.
