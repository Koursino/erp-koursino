"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 print:hidden"
    >
      Imprimer / Enregistrer en PDF
    </button>
  );
}
