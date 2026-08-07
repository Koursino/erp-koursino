import Link from "next/link";
import { cn } from "@/components/ui";

export type BoardView = "kanban" | "list";

/** Reads `?view=` — kanban stays the default, so existing links are unaffected. */
export const parseView = (value: string | undefined): BoardView =>
  value === "list" ? "list" : "kanban";

/**
 * Kanban / Liste switch for a status board. Server-rendered like the rest of
 * the page: the view lives in the URL, so it survives a reload and can be
 * bookmarked or shared. Filters already in the query string are preserved.
 */
export function ViewToggle({
  view,
  basePath,
  query = "",
}: {
  view: BoardView;
  basePath: string;
  /** Current filters as a query string, without `view`. */
  query?: string;
}) {
  const href = (target: BoardView) => {
    const params = new URLSearchParams(query);
    if (target === "list") params.set("view", "list");
    else params.delete("view");
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const options: { value: BoardView; label: string }[] = [
    { value: "kanban", label: "Kanban" },
    { value: "list", label: "Liste" },
  ];

  return (
    <div className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5">
      {options.map((option) => (
        <Link
          key={option.value}
          href={href(option.value)}
          aria-current={view === option.value ? "true" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            view === option.value
              ? "bg-zinc-900 text-white"
              : "text-zinc-600 hover:bg-zinc-100"
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
