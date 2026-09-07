import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { Printer, Globe, Eye, Package } from "lucide-react";
import { usePrintCompanyDetail, useUpdatePrinterProfile } from "@/hooks/use-print-marketplace";
import { PrintCompanyDetailModal } from "@/components/print/print-company-detail-modal";
import { PrintServiceDetailModal } from "@/components/print/print-service-detail-modal";
import type { PrintCatalogItem } from "@shared/schema";

// Business → Profil — the printing COMPANY itself (description/website/
// visibility), distinct from Business → Services (per-service category/price/
// min-qty/delay/description/image). Editing one must never touch the other —
// this page only ever writes to PATCH /api/print/profile (printerProfiles),
// never printCatalogItems. "Services proposés" below is a read-only summary
// (real active catalog, same /api/print/catalog query Business → Services
// uses) — manage them there, not here.
export default function PrinterProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = usePrintCompanyDetail(user?.id ?? null);
  const { data: catalog = [] } = useQuery<PrintCatalogItem[]>({ queryKey: ["/api/print/catalog"] });
  const updateProfile = useUpdatePrinterProfile();

  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [marketplaceVisible, setMarketplaceVisible] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewServiceId, setPreviewServiceId] = useState<number | null>(null);

  useEffect(() => {
    if (!data?.profile) return;
    setDescription(data.profile.description ?? "");
    setWebsiteUrl(data.profile.websiteUrl ?? "");
    setMarketplaceVisible(data.profile.marketplaceVisible);
  }, [data?.profile?.updatedAt]);

  const saveProfile = () => {
    let url: string | undefined;
    if (websiteUrl.trim()) {
      try { url = new URL(websiteUrl.trim()).toString(); } catch {
        toast({ title: "URL de site web invalide", description: "Utilisez un lien complet, ex. https://votre-site.com", variant: "destructive" });
        return;
      }
    }
    updateProfile.mutate(
      { description, websiteUrl: url ?? "", marketplaceVisible },
      {
        onSuccess: () => toast({ title: "Profil mis à jour" }),
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      },
    );
  };

  if (isLoading) {
    return <div className="flex flex-col gap-4"><Skeleton className="h-40 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Profil</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gérez la présentation publique de votre imprimerie.</p>
        </div>
        {/* Aperçu — opens the same PRINT Company Details Modal a Coffee Owner sees
            (readOnly here: Message/Signaler/Avis stay inert, only real saved data is shown). */}
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setPreviewOpen(true)} data-testid="button-preview-company">
          <Eye className="w-3.5 h-3.5" /> Aperçu
        </Button>
      </div>

      <SectionCard title={`Services proposés (${catalog.length})`} icon={Package}>
        {catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun service créé pour le moment — ajoutez-en depuis Business → Services.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {catalog.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPreviewServiceId(s.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${s.isActive ? "bg-blue-600 text-white border-blue-600" : "bg-background text-muted-foreground border-border"}`}
                data-testid={`chip-service-${s.id}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">Créer, modifier ou activer un service se fait depuis Business → Services.</p>
      </SectionCard>

      <SectionCard title="Description de l'imprimerie" icon={Printer}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Décrivez votre imprimerie, votre équipement, votre expérience…" data-testid="input-company-description" />
      </SectionCard>

      <SectionCard title="Site web" icon={Globe}>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Lien vers votre site (facultatif)</Label>
          <Input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://votre-site.com" data-testid="input-website-url" />
        </div>
      </SectionCard>

      <SectionCard title="Visibilité" icon={Eye}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Afficher mon imprimerie sur /print</p>
            <p className="text-xs text-muted-foreground mt-0.5">Lorsque désactivé, vos services actifs ne sont plus visibles par les Coffee Owners.</p>
          </div>
          <button
            onClick={() => setMarketplaceVisible((v) => !v)}
            className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${marketplaceVisible ? "bg-blue-600" : "bg-muted"}`}
            data-testid="button-toggle-marketplace-visible"
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${marketplaceVisible ? "left-6" : "left-0.5"}`} />
          </button>
        </div>
      </SectionCard>

      <Button onClick={saveProfile} disabled={updateProfile.isPending} className="w-full sm:w-fit rounded-2xl" data-testid="button-save-profile">
        {updateProfile.isPending ? "Enregistrement…" : "Enregistrer"}
      </Button>

      <PrintCompanyDetailModal
        printerUserId={user?.id ?? null}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onOpenService={(serviceId) => setPreviewServiceId(serviceId)}
        readOnly
      />
      <PrintServiceDetailModal
        serviceId={previewServiceId}
        open={previewServiceId != null}
        onClose={() => setPreviewServiceId(null)}
        readOnly
      />
    </div>
  );
}
