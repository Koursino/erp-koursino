import { redirect } from "next/navigation";

// The "Articles" screen and the "Catalogue Produits" screen both edited the
// `products` table, each exposing half of it — the catalogue could not set a
// colour, the stock screen could not set a price or a photo. They are now one
// screen; this route keeps old links and bookmarks working.
export default function StockProductsPage() {
  redirect("/products");
}
