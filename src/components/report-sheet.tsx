import { type ReactNode } from "react";
import { PrintButton } from "@/components/print-button";
import { REPORT_ROW_LIMIT } from "@/lib/reports";

// A4 sheet shared by the three printable "états". Same shell as the delivery
// note and the purchase order — the browser's "Print → Save as PDF" makes the file.

const PAGE_RULES = {
  portrait:
    "@page { size: A4 portrait; margin: 12mm } thead { display: table-header-group } tr { break-inside: avoid }",
  landscape:
    "@page { size: A4 landscape; margin: 10mm } thead { display: table-header-group } tr { break-inside: avoid }",
};

export function ReportSheet({
  title,
  criteria,
  meta,
  orientation = "portrait",
  truncated = false,
  children,
}: {
  title: string;
  /** Applied filters, printed so the document describes itself. */
  criteria: string[];
  /** Right-hand facts: row counts, totals… */
  meta?: { label: string; value: ReactNode }[];
  orientation?: "portrait" | "landscape";
  truncated?: boolean;
  children: ReactNode;
}) {
  const width = orientation === "landscape" ? "max-w-[297mm]" : "max-w-[210mm]";

  return (
    <div className="min-h-screen bg-zinc-100 py-8 print:bg-white print:py-0">
      <style>{PAGE_RULES[orientation]}</style>
      <div className={`mx-auto mb-4 flex ${width} justify-end print:hidden`}>
        <PrintButton />
      </div>
      <div
        className={`mx-auto ${width} bg-white p-[18mm] text-sm text-zinc-800 shadow print:max-w-none print:p-0 print:shadow-none`}
      >
        <div className="flex items-start justify-between border-b border-zinc-300 pb-6">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">
              K
            </div>
            <p className="mt-2 text-lg font-semibold text-zinc-900">Koursino</p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{title}</h1>
            <p className="mt-1 text-xs text-zinc-500">
              Édité le {new Date().toLocaleDateString("fr-FR")}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Critères appliqués
            </p>
            {criteria.map((line) => (
              <p key={line} className="mt-1 text-zinc-700">
                {line}
              </p>
            ))}
          </div>
          {meta && meta.length > 0 && (
            <div className="text-right">
              <div className="inline-block text-left">
                {meta.map((m) => (
                  <div key={m.label} className="mt-1 first:mt-0">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      {m.label}
                    </span>
                    <p className="text-zinc-900">{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {children}

        {truncated && (
          <p className="mt-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Export limité aux {new Intl.NumberFormat("fr-FR").format(REPORT_ROW_LIMIT)} premières lignes —
            affinez les filtres pour un document complet.
          </p>
        )}

        <p className="mt-10 text-center text-[11px] text-zinc-400">
          {title} généré par Koursino ERP
        </p>
      </div>
    </div>
  );
}
