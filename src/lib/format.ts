// Money formatting for the Moroccan context (MAD / Dirham).
// Displays amounts with 2 decimals, a space thousands separator and a comma
// decimal separator (fr locale), suffixed with "Dhs" — e.g. 1234.5 -> "1 234,50 Dhs".
// Kept as a shared helper so every module (catalog, achats, ventes, stock)
// renders money identically.
const dhsFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatDhs(value: number | null | undefined): string {
  return `${dhsFormatter.format(typeof value === "number" ? value : 0)} Dhs`;
}

/** Currency-aware variant; MAD renders as "1 234,50 Dhs" via formatDhs. */
export const fmtMoney = (n: number, currency = "MAD") =>
  currency === "MAD"
    ? formatDhs(n)
    : new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(n);

export const fmtDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("fr-FR") : "—";

export const fmtQty = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n);

/** Tone used by the Badge component for each document status / state. */
export const statusTone = (status: string): "zinc" | "green" | "red" | "blue" | "amber" => {
  switch (status) {
    case "received":
    case "paid":
    case "done":
    case "livree":
    case "payee":
      return "green";
    case "rfq_sent":
    case "quote_received":
    case "confirmed":
    case "ordered":
    case "invoiced":
    case "confirmee":
    case "facturee":
      return "blue";
    case "en_preparation":
      return "amber";
    case "cancelled":
    case "annulee":
      return "red";
    default:
      return "zinc"; // draft / brouillon
  }
};
