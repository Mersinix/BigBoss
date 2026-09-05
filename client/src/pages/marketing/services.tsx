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

type ServiceFormState = {
  category: string; startingPrice: string; responseTime: string; description: string; imageUrl: string;
};
const EMPTY_FORM: ServiceFormState = { category: "", startingPrice: "", responseTime: "< 24h", description: "", imageUrl: "" };

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
        category: service.category,
        startingPrice: String((service.startingPriceInCents ?? 0) / 100),
        responseTime: service.responseTime,
        description: service.description,
        imageUrl: service.imageUrl ?? "",
      });
    } else if (service === "new") {
      setForm(EMPTY_FORM);
    }
  }, [service]);

  if (!service) return null;
  const isPending = create.isPending || update.isPending;

  const save = () => {
    if (!form.category.trim()) {
      toast({ title: "Catégorie requise", variant: "destructive" });
      return;
    }
    const payload = {
      category: form.category,
      startingPriceInCents: Math.round((parseFloat(form.startingPrice) || 0) * 100),
      responseTime: form.responseTime,
      description: form.description,
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
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isNew ? "Nouveau service" : "Modifier le service"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
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

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Services</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gérez les services individuels affichés sur la marketplace /marketing.</p>
        </div>
        <Button onClick={() => setEditing("new")} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white" data-testid="button-new-service">
          <Plus className="w-4 h-4 mr-1.5" />Nouveau service
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>
      ) : services.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Megaphone className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucun service pour le moment</p>
            <p className="text-sm text-muted-foreground mt-1">Créez votre premier service (Ads, Branding, Photo…) pour qu'il apparaisse sur /marketing.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((service) => (
            <Card key={service.id} data-testid={`card-service-${service.id}`}>
              <CardContent className="p-5 flex flex-col gap-3">
                <button type="button" onClick={() => setPreviewServiceId(service.id)} className="text-left" data-testid={`button-preview-service-${service.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm truncate">{service.category}</h3>
                    <Badge className={`text-[10px] shrink-0 border-0 px-1.5 ${service.isPublished ? "bg-green-600" : "bg-gray-400"}`}>
                      {service.isPublished ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                      {service.isPublished ? "Publié" : "Brouillon"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{service.description || "Aucune description"}</p>
                </button>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{service.responseTime}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Prix de départ</p>
                    <p className="font-bold text-sm text-fuchsia-600">{fmt(service.startingPriceInCents)}</p>
                  </div>
                  <Switch checked={service.isPublished} onCheckedChange={() => togglePublish(service)} disabled={update.isPending} data-testid={`switch-publish-service-${service.id}`} />
                </div>
                <div className="flex gap-2 justify-end">
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
      )}

      <ServiceFormDialog service={editing} onClose={() => setEditing(null)} />
      {/* Aperçu (Part 7) — same real service data/design as the Coffee Owner /marketing
          card+modal experience, read-only here since the agency is previewing its own listing. */}
      <MarketingServiceDetailModal serviceId={previewServiceId} open={previewServiceId != null} onClose={() => setPreviewServiceId(null)} readOnly />
    </div>
  );
}
