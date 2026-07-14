// Money formatting for the Moroccan context (MAD / Dirham).
// Displays amounts with 2 decimals, a space thousands separator and a comma
// decimal separator (fr locale), suffixed with "Dhs" — e.g. 1234.5 -> "1 234,50 Dhs".
// Kept as a shared helper so every module (catalog now, sales later) renders money
// identically.
const dhsFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatDhs(value: number | null | undefined): string {
  return `${dhsFormatter.format(typeof value === "number" ? value : 0)} Dhs`;
}
