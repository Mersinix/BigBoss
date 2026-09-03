import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { Briefcase, Calendar, Phone, DollarSign } from "lucide-react";
import { useMarketingProjects, useUpdateMarketingProjectStatus, type MarketingProjectWithParties } from "@/hooks/use-marketing";
import { MARKETING_PROJECT_STATUS_META, MARKETING_PROJECT_NEXT_ACTIONS } from "@/lib/marketing-project-status";

// ── Projets tab — real marketingProjects for the authenticated provider.
// Covers the request → quote → active project → completion lifecycle in one
// list (no separate "requests" page — a PENDING project IS the request). ──────

function ProjectCard({ project, onQuote, onAction, onProgress }: {
  project: MarketingProjectWithParties;
  onQuote: (p: MarketingProjectWithParties) => void;
  onAction: (id: number, status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") => void;
  onProgress: (id: number, progress: number) => void;
}) {
  const fmt = useFormatCurrency();
  const meta = MARKETING_PROJECT_STATUS_META[project.status];
  const actions = MARKETING_PROJECT_NEXT_ACTIONS[project.status] ?? [];

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-sm">{project.cafeOwner ?? "Client"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{project.service}{project.title ? ` · ${project.title}` : ""}</p>
        </div>
        <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
      </div>
      {project.description && <p className="text-xs text-muted-foreground bg-secondary/30 rounded-xl px-3 py-2 leading-relaxed">{project.description}</p>}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {project.ownerPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{project.ownerPhone}</span>}
        {(project.quoteAmountInCents != null || project.finalAmountInCents != null) && (
          <span className="flex items-center gap-1 font-medium text-foreground"><DollarSign className="w-3 h-3" />{fmt(project.finalAmountInCents ?? project.quoteAmountInCents ?? 0)}</span>
        )}
        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(project.createdAt).toLocaleDateString("fr-FR")}</span>
      </div>
      {project.status === "IN_PROGRESS" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progression</span><span>{project.progress}%</span>
          </div>
          <Slider value={[project.progress]} max={100} step={5} onValueChange={([v]) => onProgress(project.id, v)} data-testid={`slider-progress-${project.id}`} />
        </div>
      )}
      {(project.status === "PENDING" || actions.length > 0) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {project.status === "PENDING" && (
            <Button size="sm" className="h-8 text-xs bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl" onClick={() => onQuote(project)} data-testid={`button-quote-${project.id}`}>
              Envoyer un devis
            </Button>
          )}
          {actions.map((a) => (
            <Button
              key={a.status}
              size="sm"
              variant={a.variant === "destructive" ? "outline" : "default"}
              className={`h-8 text-xs rounded-xl ${a.variant === "destructive" ? "border-red-200 text-red-600 hover:bg-red-50" : "bg-fuchsia-600 hover:bg-fuchsia-700 text-white"}`}
              onClick={() => onAction(project.id, a.status as "IN_PROGRESS" | "COMPLETED" | "CANCELLED")}
              data-testid={`button-${a.status.toLowerCase()}-${project.id}`}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

const FILTERS = [
  { key: "active", label: "Actifs" },
  { key: "all", label: "Tous" },
  { key: "completed", label: "Terminés" },
] as const;

export default function MarketingProjects() {
  const { toast } = useToast();
  const { data: projects = [], isLoading } = useMarketingProjects();
  const updateStatus = useUpdateMarketingProjectStatus();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("active");
  const [quoteTarget, setQuoteTarget] = useState<MarketingProjectWithParties | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("");

  const filtered = projects.filter((p) => {
    if (filter === "active") return !["COMPLETED", "CANCELLED", "REJECTED"].includes(p.status);
    if (filter === "completed") return p.status === "COMPLETED";
    return true;
  });

  const sendQuote = () => {
    if (!quoteTarget || !quoteAmount) return;
    updateStatus.mutate(
      { id: quoteTarget.id, status: "QUOTED", quoteAmountInCents: Math.round((parseFloat(quoteAmount) || 0) * 100) },
      {
        onSuccess: () => { setQuoteTarget(null); setQuoteAmount(""); toast({ title: "Devis envoyé" }); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      },
    );
  };

  const handleAction = (id: number, status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") => {
    const extra = status === "COMPLETED" ? { finalAmountInCents: projects.find((p) => p.id === id)?.quoteAmountInCents ?? undefined } : {};
    updateStatus.mutate({ id, status, ...extra }, {
      onSuccess: () => toast({ title: "Projet mis à jour" }),
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  const handleProgress = (id: number, progress: number) => {
    updateStatus.mutate({ id, progress });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Projets</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez vos demandes et projets clients.</p>
      </div>

      <div className="flex gap-2 bg-secondary/40 rounded-2xl p-1 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            data-testid={`tab-projects-${f.key}`}
            className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              filter === f.key ? "bg-background text-fuchsia-600 shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? null : filtered.length === 0 ? (
        <EmptyState message="Aucun projet pour cette vue." icon={Briefcase} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} onQuote={(proj) => { setQuoteTarget(proj); setQuoteAmount(""); }} onAction={handleAction} onProgress={handleProgress} />
          ))}
        </div>
      )}

      <Dialog open={quoteTarget !== null} onOpenChange={(open) => { if (!open) setQuoteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Envoyer un devis</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Proposez un montant à {quoteTarget?.cafeOwner} pour "{quoteTarget?.service}".
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="marketing-quote-amount">Montant</Label>
            <Input id="marketing-quote-amount" type="number" min="0" value={quoteAmount} onChange={(e) => setQuoteAmount(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteTarget(null)}>Annuler</Button>
            <Button disabled={!quoteAmount || updateStatus.isPending} onClick={sendQuote} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white">
              {updateStatus.isPending ? "Envoi…" : "Envoyer le devis"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
