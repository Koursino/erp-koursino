import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./signout-button";

const navSections = [
  {
    title: null,
    items: [{ href: "/", label: "Dashboard" }],
  },
  {
    title: "CRM",
    items: [
      { href: "/pipeline", label: "Pipeline" },
      { href: "/companies", label: "Companies" },
      { href: "/contacts", label: "Contacts" },
      { href: "/activities", label: "Activities" },
    ],
  },
  {
    title: "Produits & Achats",
    items: [
      { href: "/products", label: "Catalogue" },
      { href: "/catalog", label: "Catalogue fournisseur" },
      { href: "/purchase-orders", label: "Bons de commande" },
    ],
  },
];

const upcoming = [
  { label: "Stock", step: "3" },
  { label: "Supplier payments", step: "4" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 z-20 flex w-56 flex-col border-r border-zinc-200 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white">
            K
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Koursino ERP</p>
            <p className="text-xs text-zinc-500">CRM · MVP</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {navSections.map((section, i) => (
            <div key={section.title ?? "root"} className={i > 0 ? "pt-4" : ""}>
              {section.title && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          <div className="pt-4">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Coming next
            </p>
            {upcoming.map((item) => (
              <span
                key={item.label}
                className="block cursor-not-allowed rounded-lg px-3 py-2 text-sm text-zinc-400"
              >
                {item.label}
                <span className="ml-2 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium">
                  {item.step}
                </span>
              </span>
            ))}
          </div>
        </nav>
        <div className="border-t border-zinc-200 px-5 py-4">
          {user && <p className="mb-2 truncate text-xs text-zinc-500">{user.email}</p>}
          <SignOutButton />
        </div>
      </aside>
      <main className="ml-56 px-8 py-8">{children}</main>
    </div>
  );
}
