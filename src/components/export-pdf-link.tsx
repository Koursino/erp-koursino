import Link from "next/link";

/**
 * Opens a printable A4 report in a new tab, where the browser's
 * "Print → Save as PDF" produces the file. Same convention as the delivery note
 * and the purchase order — no PDF library involved.
 */
export function ExportPdfLink({ href, label = "Export PDF" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
    >
      {label}
    </Link>
  );
}
