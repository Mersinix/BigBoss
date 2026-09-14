import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Single reusable pagination control — used by Admin/Supplier Invoices and Payments (and any
// future card-grid page) instead of four duplicated implementations. Purely a presentation +
// page/pageSize controller: the caller owns the actual data slicing (see buildPageWindow
// below), so this component has no knowledge of what kind of records it's paginating.

const PAGE_SIZE_PRESETS = [10, 25, 50, 100] as const;

export type PageSize = number;

export function usePagination(totalItems: number, initialPageSize: PageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(initialPageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, totalItems);

  return {
    page: safePage,
    pageSize,
    totalPages,
    start,
    end,
    setPage,
    setPageSize: (size: PageSize) => { setPageSize(size); setPage(1); },
    /** Call whenever the upstream filtered dataset changes so pagination never points past
     *  the end of a now-smaller result set. */
    resetPage: () => setPage(1),
  };
}

// Builds a compact page-number window with ellipses (1 … 4 5 [6] 7 8 … 20) instead of
// rendering every page button for large datasets.
function buildPageWindow(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const window = new Set([1, total, current, current - 1, current + 1]);
  const pages = Array.from(window).filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const withEllipses: (number | "ellipsis")[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) withEllipses.push("ellipsis");
    withEllipses.push(pages[i]);
  }
  return withEllipses;
}

export function DataPagination({
  page, pageSize, totalItems, totalPages, start, end,
  onPageChange, onPageSizeChange,
  itemLabel = "résultats",
}: {
  page: number;
  pageSize: PageSize;
  totalItems: number;
  totalPages: number;
  start: number;
  end: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  itemLabel?: string;
}) {
  const isCustom = !(PAGE_SIZE_PRESETS as readonly number[]).includes(pageSize);
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState(String(pageSize));

  if (totalItems === 0) return null;

  const applyCustom = () => {
    const n = Math.max(1, Math.min(1000, Math.round(Number(customInput)) || pageSize));
    onPageSizeChange(n);
    setCustomOpen(false);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
      <p className="text-xs text-muted-foreground order-2 sm:order-1">
        {start + 1}–{end} sur {totalItems} {itemLabel}
      </p>

      <div className="flex items-center gap-3 flex-wrap order-1 sm:order-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Par page</span>
          <Select
            value={isCustom ? "CUSTOM" : String(pageSize)}
            onValueChange={(v) => {
              if (v === "CUSTOM") { setCustomInput(String(pageSize)); setCustomOpen(true); return; }
              onPageSizeChange(Number(v));
            }}
          >
            <SelectTrigger className="w-[4.75rem] h-8 text-xs" data-testid="select-page-size"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_PRESETS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              <SelectItem value="CUSTOM">{isCustom ? `${pageSize} (custom)` : "Custom…"}</SelectItem>
            </SelectContent>
          </Select>
          {customOpen && (
            <div className="flex items-center gap-1">
              <Input
                type="number" min={1} max={1000} value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); }}
                className="w-16 h-8 text-xs"
                autoFocus
                data-testid="input-custom-page-size"
              />
              <Button size="sm" className="h-8 text-xs px-2" onClick={applyCustom} data-testid="button-apply-custom-page-size">OK</Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon" variant="outline" className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Page précédente"
            data-testid="button-page-prev"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-1">
            {buildPageWindow(page, totalPages).map((p, i) =>
              p === "ellipsis" ? (
                <span key={`e-${i}`} className="px-1.5 text-xs text-muted-foreground">…</span>
              ) : (
                <Button
                  key={p}
                  size="sm"
                  variant={p === page ? "default" : "ghost"}
                  className="h-8 w-8 p-0 text-xs"
                  onClick={() => onPageChange(p)}
                  data-testid={`button-page-${p}`}
                >
                  {p}
                </Button>
              )
            )}
          </div>

          <Button
            size="icon" variant="outline" className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Page suivante"
            data-testid="button-page-next"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <span className="text-xs text-muted-foreground hidden md:inline">Page {page} / {totalPages}</span>
      </div>
    </div>
  );
}
