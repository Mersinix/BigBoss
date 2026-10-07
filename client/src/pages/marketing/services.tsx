import { useEffect, useState } from "react";
import {
  useMyMarketingServices, useCreateMarketingService, useUpdateMarketingService, useDeleteMarketingService,
  useMarketingTaxonomy, type MarketingService,
} from "@/hooks/use-marketing";
import { MarketingServiceDetailModal } from "@/components/marketing/marketing-service-detail-modal";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Plus, Pencil, Trash2, Clock, Eye, EyeOff } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { resolveMarketingCategoryIcon } from "@/lib/marketing-category-icon";

type ServiceFormState = {
  title: string; category: string; startingPrice: string; responseTime: string; description: string; offerDetails: string; imageUrl: string;
};
const EMPTY_FORM: ServiceFormState = { title: "", category: "", startingPrice: "", responseTime: "< 24h", description: "", offerDetails: "", imageUrl: "" };

function ServiceFormDialog({ service, onClose }: { service: MarketingService | "new" | null; onClose: () => void }) {
  const { toast } = useToast();
  const { data: taxonomy = [] } = useMarketingTaxonomy();
  const create = useCreateMarketingService();
  const update = useUpdateMarketingService();
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  const isNew = service === "new";

  useEffect(() => {
    if (service && service !== "new") {
      setForm({
        title: service.title ?? "",
        category: service.category,
        startingPrice: String((service.startingPriceInCents ?? 0) / 100),
        responseTime: service.responseTime,
        description: service.description,
        offerDetails: service.offerDetails ?? "",
        imageUrl: service.imageUrl ?? "",
      });
    } else if (service === "new") {
      setForm(EMPTY_FORM);
    }
  }, [service]);

  if (!service) return null;
  const isPending = create.isPending || update.isPending;

  const save = () => {
    if (!form.title.trim()) {
      toast({ title: "Titre requis", variant: "destructive" });
      return;
    }
    if (!form.category.trim()) {
      toast({ title: "Catégorie requise", variant: "destructive" });
      return;
    }
    const payload = {
      title: form.title.trim(),
      category: form.category,
      startingPriceInCents: Math.round((parseFloat(form.startingPrice) || 0) * 100),
      responseTime: form.responseTime,
      description: form.description,
      offerDetails: form.offerDetails,
      imageUrl: form.imageUrl.trim() || null,
    };
    const onDone = {
      onSuccess: () => { toast({ title: isNew ? "Service créé" : "Service mis à jour" }); onClose(); },
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    };
    if (isNew) create.mutate(payload, onDone);
    else update.mutate({ id: (service as MarketingService).id, ...payload }, onDone);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Thin scrollbar treatment — matches the existing Admin Order Details modal's own
          scroll container exactly, same thumb/track/hover classes, not a new scrollbar style. */}
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
        <DialogHeader><DialogTitle>{isNew ? "Nouveau service" : "Modifier le service"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Titre</label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex : Campagne Google Ads Premium" data-testid="input-service-title" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Catégorie</label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger data-testid="select-service-category"><SelectValue placeholder="Choisir une catégorie" /></SelectTrigger>
              <SelectContent>
                {taxonomy.filter((t) => t.isActive && !t.isFrozen).map((t) => (
                  <SelectItem key={t.id} value={t.name}>{t.icon ? `${t.icon} ` : ""}{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prix de départ (د.ت)</label>
              <Input type="number" min={0} value={form.startingPrice} onChange={(e) => setForm((f) => ({ ...f, startingPrice: e.target.value }))} data-testid="input-service-price" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Temps de réponse</label>
              <Input value={form.responseTime} onChange={(e) => setForm((f) => ({ ...f, responseTime: e.target.value }))} placeholder="< 24h" data-testid="input-service-response-time" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description du service</label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} placeholder="Décrivez ce service précisément (ex : Création et gestion de campagnes publicitaires...)" data-testid="input-service-description" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Détails de l'offre</label>
            <Textarea value={form.offerDetails} onChange={(e) => setForm((f) => ({ ...f, offerDetails: e.target.value }))} rows={4} placeholder="Ce qui est inclus dans cette offre (ex : 8h de tournage, photographe professionnel, photos retouchées, livraison sous 48h...)" data-testid="input-service-offer-details" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Image du service (URL)</label>
            <Input value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" data-testid="input-service-image" />
            {form.imageUrl && <img src={form.imageUrl} alt="Aperçu" className="h-24 w-full rounded-xl object-cover bg-muted mt-2" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={isPending} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white" data-testid="button-save-service">
            {isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Business → Services — Agency → Multiple Services: an agency can now offer several
// independently priced/described/imaged services (Ads, Branding, Photo…) instead of one
// combined profile-level blob. Mirrors barista-academy/courses.tsx's Formations CRUD
// page structure exactly (same card grid, publish toggle, edit/delete, Aperçu preview).
export default function MarketingServicesPage() {
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const { data: services = [], isLoading } = useMyMarketingServices();
  const { data: taxonomy = [] } = useMarketingTaxonomy();
  const update = useUpdateMarketingService();
  const remove = useDeleteMarketingService();
  const [editing, setEditing] = useState<MarketingService | "new" | null>(null);
  const [previewServiceId, setPreviewServiceId] = useState<number | null>(null);

  const togglePublish = (service: MarketingService) => {
    update.mutate({ id: service.id, isPublished: !service.isPublished } as any, {
      onSuccess: () => toast({ title: service.isPublished ? "Service dépublié" : "Service publié" }),
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  const handleDelete = (service: MarketingService) => {
    if (!window.confirm(`Supprimer le service "${service.category}" ? Cette action est irréversible.`)) return;
    remove.mutate(service.id, {
      onSuccess: () => toast({ title: "Service supprimé" }),
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  // Same usePagination/DataPagination pattern already used throughout the app (reference:
  // Espace Livraison → Business → Chauffeurs' driver-roster-view.tsx).
  const pagination = usePagination(services.length);
  useEffect(() => { pagination.resetPage(); }, [services.length]);
  const pageServices = services.slice(pagination.start, pagination.end);

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Services"
        subtitle="Gérez les services individuels affichés sur la marketplace /marketing."
        icon={Megaphone}
        gradientClass="bg-gradient-to-br from-fuchsia-500/10 via-fuchsia-500/5 to-transparent border-fuchsia-500/20"
        iconBgClass="bg-fuchsia-500/15"
        iconTextClass="text-fuchsia-600 dark:text-fuchsia-400"
        action={
          <Button onClick={() => setEditing("new")} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white" data-testid="button-new-service">
            <Plus className="w-4 h-4 mr-1.5" />Nouveau service
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-72 w-full rounded-2xl" />)}</div>
      ) : services.length === 0 ? (
        <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
          <CardContent className="py-16 text-center">
            <Megaphone className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucun service pour le moment</p>
            <p className="text-sm text-muted-foreground mt-1">Créez votre premier service (Ads, Branding, Photo…) pour qu'il apparaisse sur /marketing.</p>
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pageServices.map((service) => (
            // Image-on-top layout + category/status badges mirror the Coffee Owner
            // /marketing mapped service card's visual language (MarketingMappedServiceCard),
            // while keeping this page's own real management actions below
            // (docs/marketing_services_offer_details_admin_audit.md Section B — no agency
            // badge/Avis here since this is the agency managing its own listing, and no
            // per-service rating is fetched by this page's own data source).
            <Card key={service.id} data-testid={`card-service-${service.id}`} className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl overflow-hidden flex flex-col">
              <button type="button" onClick={() => setPreviewServiceId(service.id)} className="text-left" data-testid={`button-preview-service-${service.id}`}>
                <div className="relative aspect-[4/3] bg-gray-50 dark:bg-gray-700 overflow-hidden">
                  {service.imageUrl ? (
                    <img src={service.imageUrl} alt={service.title?.trim() || service.category} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Megaphone className="w-10 h-10 text-muted-foreground/40" /></div>
                  )}
                  {/* Status — bottom-left dot, same visual language as the Coffee Owner
                      card's availability dot, repurposed here to mean "published" */}
                  <span
                    className={`absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full border-2 border-white ${service.isPublished ? "bg-green-500" : "bg-gray-300"}`}
                    title={service.isPublished ? "Publié" : "Brouillon"}
                  />
                  {/* Category — bottom-right badge, same taxonomy icon resolver as /marketing */}
                  <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full">
                    <span className="text-xs leading-none">{resolveMarketingCategoryIcon(service.category, taxonomy)}</span>{service.category}
                  </span>
                </div>
                <CardContent className="p-4 pb-0 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm truncate">{service.title?.trim() || service.category}</h3>
                    <Badge className={`text-[10px] shrink-0 border-0 px-1.5 ${service.isPublished ? "bg-green-600" : "bg-gray-400"}`}>
                      {service.isPublished ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                      {service.isPublished ? "Publié" : "Brouillon"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{service.description || "Aucune description"}</p>
                </CardContent>
              </button>
              <CardContent className="p-4 pt-3 flex flex-col gap-3 mt-auto">
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{service.responseTime}</p>
                    <p className="font-bold text-sm text-fuchsia-600 mt-0.5">{fmt(service.startingPriceInCents)}</p>
                  </div>
                  <Switch checked={service.isPublished} onCheckedChange={() => togglePublish(service)} disabled={update.isPending} data-testid={`switch-publish-service-${service.id}`} />
                </div>
                <div className="flex gap-2 justify-end flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => setPreviewServiceId(service.id)} data-testid={`button-preview-service-action-${service.id}`}>
                    <Eye className="w-3.5 h-3.5 mr-1" />Aperçu
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(service)} data-testid={`button-edit-service-${service.id}`}>
                    <Pencil className="w-3.5 h-3.5 mr-1" />Modifier
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDelete(service)} data-testid={`button-delete-service-${service.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <DataPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={services.length}
          totalPages={pagination.totalPages}
          start={pagination.start}
          end={pagination.end}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemLabel="services"
        />
        </>
      )}

      <ServiceFormDialog service={editing} onClose={() => setEditing(null)} />
      {/* Aperçu (Part 7) — same real service data/design as the Coffee Owner /marketing
          card+modal experience, read-only here since the agency is previewing its own listing. */}
      <MarketingServiceDetailModal serviceId={previewServiceId} open={previewServiceId != null} onClose={() => setPreviewServiceId(null)} readOnly />
    </div>
  );
}
