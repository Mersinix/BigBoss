import { useMemo, useState } from "react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { FileText, DollarSign, Clock, Search } from "lucide-react";
import { useMarketingProjects } from "@/hooks/use-marketing";
import { MARKETING_PROJECT_STATUS_META } from "@/lib/marketing-project-status";

// Marketing has no separate quotes/invoices tables (like every service-provider
// module in this app — see pages/printer/invoices.tsx, itself derived live from
// /api/print/orders) — "Devis" and "Factures" are both filtered views over the
// same /api/marketing/projects: a devis is any project with a quote amount set,
// a facture is any COMPLETED project (finalAmountInCents is the invoiced total).
const VIEWS = [
  { key: "devis", label: "Devis" },
  { key: "factures", label: "Factures" },
  { key: "all", label: "Tous" },
] as const;

export default function MarketingInvoices() {
  const fmt = useFormatCurrency();
  const { data: projects = [], isLoading } = useMarketingProjects();
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("devis");
  const [search, setSearch] = useState("");

  const devis = useMemo(() => projects.filter((p) => p.quoteAmountInCents != null), [projects]);
  const factures = useMemo(() => projects.filter((p) => p.status === "COMPLETED"), [projects]);
  const totalFactureCents = useMemo(() => factures.reduce((s, p) => s + (p.finalAmountInCents ?? 0), 0), [factures]);
  const pendingDevisCents = useMemo(() => devis.filter((p) => p.status === "QUOTED").reduce((s, p) => s + (p.quoteAmountInCents ?? 0), 0), [devis]);

  const rows = useMemo(() => {
    const base = view === "devis" ? devis : view === "factures" ? factures : projects;
    const q = search.trim().toLowerCase();
    return base
      .filter((p) => !q || (p.cafeOwner ?? "").toLowerCase().includes(q) || p.service.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [view, devis, factures, projects, search]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Devis & Factures</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Vos devis envoyés et factures générées à partir de vos projets.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><FileText className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Devis envoyés</p><p className="text-2xl font-bold">{devis.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><DollarSign className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">Facturé</p><p className="text-2xl font-bold text-green-600">{fmt(totalFactureCents)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground">Devis en attente</p><p className="text-2xl font-bold text-amber-600">{fmt(pendingDevisCents)}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 bg-secondary/40 rounded-2xl p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              data-testid={`tab-invoices-${v.key}`}
              className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                view === v.key ? "bg-background text-fuchsia-600 shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Rechercher un client ou un service…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState message="Aucun élément pour cette vue." icon={FileText} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const meta = MARKETING_PROJECT_STATUS_META[p.status];
                  return (
                    <TableRow key={p.id} data-testid={`row-invoice-${p.id}`}>
                      <TableCell className="font-medium text-sm">{p.cafeOwner}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.service}</TableCell>
                      <TableCell className="font-semibold text-sm">{fmt(p.finalAmountInCents ?? p.quoteAmountInCents ?? 0)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(p.updatedAt).toLocaleDateString("fr-FR")}</TableCell>
                      <TableCell><Badge variant="secondary" className={meta.className}>{meta.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
