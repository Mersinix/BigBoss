import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useFormatCurrency } from "@/hooks/use-currency";
import type { PrintCatalogItem } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { Package, Clock, Layers, Settings, Printer } from "lucide-react";

// Read-oriented, image-forward presentation of the same /api/print/catalog data as
// /printer/services (there is only one printCatalogItems table — no separate "catalog"
// data model in this backend). This page previews "how this catalog looks to Coffee
// Owners" grouped by category; /printer/services is the form-oriented CRUD page (edits
// happen there — this page links out to it via "Gérer").
export default function PrinterCatalog() {
  const fmt = useFormatCurrency();
  const { data: catalog = [], isLoading } = useQuery<PrintCatalogItem[]>({ queryKey: ["/api/print/catalog"] });

  const grouped = useMemo(() => {
    const map = new Map<string, PrintCatalogItem[]>();
    for (const item of catalog) {
      const key = item.category || "Autres";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Catalogue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Aperçu visuel de votre catalogue tel qu'il apparaît aux Coffee Owners.</p>
        </div>
        <Link href="/printer/services">
          <Button variant="outline" className="gap-2" data-testid="button-manage-catalog">
            <Settings className="w-4 h-4" /> Gérer
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-2xl" />)}
        </div>
      ) : catalog.length === 0 ? (
        <EmptyState message="Aucun produit dans le catalogue. Ajoutez vos services depuis la page Services." icon={Package} />
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map(([category, items]) => (
            <div key={category} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" /> {category}
                <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                  <Card key={item.id} className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
                    <div className="h-32 bg-secondary/40 flex items-center justify-center overflow-hidden">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <Printer className="w-8 h-8 text-muted-foreground/40" />
                      )}
                    </div>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm text-foreground truncate">{item.name}</p>
                        {!item.isActive && <Badge variant="outline" className="bg-muted text-muted-foreground shrink-0 text-[10px]">Inactif</Badge>}
                      </div>
                      {item.description && <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>}
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-bold text-primary text-sm">{fmt(item.priceInCents)} <span className="text-xs font-normal text-muted-foreground">/ {item.unit}</span></span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1">
                        <span className="flex items-center gap-1"><Package className="w-3 h-3" /> min. {item.minQuantity}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {item.productionTimeDays} j</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
