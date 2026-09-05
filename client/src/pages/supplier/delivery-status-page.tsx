import { useMemo, useState } from "react";
import { useDeliveries, useDispatchDelivery, useSupplierDrivers } from "@/hooks/use-deliveries";
import { useReassignDriver } from "@/hooks/use-delivery-ecosystem";
import { useDeliveryCompanyProfiles } from "@/hooks/use-delivery-company-marketplace";
import { DeliveryCompanyDetailModal } from "@/components/delivery/delivery-company-detail-modal";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Truck, CheckCircle, Clock, MapPin, Package, Search, X, Building2, User as UserIcon, Star, ChevronLeft, Users as UsersIcon } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import SupplierDeliveryTabs from "@/components/delivery/supplier-delivery-tabs";
import DeliveryDetails, { DELIVERY_STATUS_META, DELIVERY_MODE_LABEL } from "@/components/delivery/delivery-details";
import type { DeliveryWithDetails } from "@shared/schema";

const STATUS_FILTERS = ["ALL", "PENDING", "AVAILABLE", "ACCEPTED", "ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
const DATE_FILTERS = [
  { value: "ALL", label: "Toutes les dates" },
  { value: "TODAY", label: "Aujourd'hui" },
  { value: "YESTERDAY", label: "Hier" },
  { value: "7D", label: "7 derniers jours" },
  { value: "30D", label: "30 derniers jours" },
];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function matchesDateFilter(createdAt: Date | null, filter: string): boolean {
  if (filter === "ALL" || !createdAt) return true;
  const now = new Date();
  const d = new Date(createdAt);
  if (filter === "TODAY") return isSameDay(d, now);
  if (filter === "YESTERDAY") {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return isSameDay(d, y);
  }
  if (filter === "7D") return now.getTime() - d.getTime() <= 7 * 86400000;
  if (filter === "30D") return now.getTime() - d.getTime() <= 30 * 86400000;
  return true;
}

// Browsing real mapped Delivery Company cards (Part 20-22) — clicking one opens the same
// DeliveryCompanyDetailModal used everywhere else (Barista modal as the visual reference),
// whose "Choisir cette entreprise" action dispatches straight to that company (Part 24-25:
// targeted dispatch, see storage.dispatchDelivery's targetDeliveryCompanyId) instead of the
// broadcast-to-all-partners pool. The broadcast option below stays completely unchanged.
function CompanyBrowseView({ delivery, onBack, onClose }: { delivery: DeliveryWithDetails; onBack: () => void; onClose: () => void }) {
  const { data: companies = [], isLoading } = useDeliveryCompanyProfiles({ available: true });
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const dispatch = useDispatchDelivery();
  const { toast } = useToast();

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={onBack}><ChevronLeft className="w-4 h-4" />Retour</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pt-1">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : companies.length === 0 ? (
          <p className="text-sm text-muted-foreground col-span-2 text-center py-8">Aucune entreprise de livraison disponible pour le moment.</p>
        ) : (
          companies.map((c) => (
            <button
              key={c.userId}
              onClick={() => setSelectedCompanyId(c.userId)}
              className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
              data-testid={`card-delivery-company-${c.userId}`}
            >
              <Avatar className="w-10 h-10 shrink-0">
                <AvatarImage src={getAvatarUrl(c as any)} alt={c.name} />
                <AvatarFallback className="bg-teal-100 text-teal-700 font-semibold">{c.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {(c.rating / 10).toFixed(1)} ({c.reviewCount})
                  <span className="flex items-center gap-1"><UsersIcon className="w-3 h-3" />{c.driverCount}</span>
                </p>
                {c.location && <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{c.location}</p>}
              </div>
            </button>
          ))
        )}
      </div>
      <DeliveryCompanyDetailModal
        companyUserId={selectedCompanyId}
        open={selectedCompanyId != null}
        onClose={() => setSelectedCompanyId(null)}
        onSelect={(card) => {
          dispatch.mutate({ deliveryId: delivery.id, mode: "DELIVERY_COMPANY", deliveryCompanyId: card.userId }, {
            onSuccess: () => { toast({ title: `Envoyée à ${card.name}` }); onClose(); },
            onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
          });
        }}
      />
    </>
  );
}

function DispatchDialog({ delivery, onClose }: { delivery: DeliveryWithDetails; onClose: () => void }) {
  const dispatch = useDispatchDelivery();
  const { toast } = useToast();
  const [view, setView] = useState<"choose" | "browse">("choose");
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Comment livrer cette commande ?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Commande #{delivery.orderId} · {delivery.cafe.name}
        </p>
        {view === "browse" ? (
          <CompanyBrowseView delivery={delivery} onBack={() => setView("choose")} onClose={onClose} />
        ) : (
        <div className="grid grid-cols-1 gap-3 pt-2">
          <button
            onClick={() => dispatch.mutate({ deliveryId: delivery.id, mode: "DELIVERY_COMPANY" }, {
              onSuccess: () => { toast({ title: "Envoyée aux entreprises de livraison" }); onClose(); },
              onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
            })}
            disabled={dispatch.isPending}
            className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
          >
            <Building2 className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="font-medium text-sm">Entreprise de livraison</p>
              <p className="text-xs text-muted-foreground">Publier dans la file des entreprises de livraison partenaires.</p>
            </div>
          </button>
          <button
            onClick={() => setView("browse")}
            className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
            data-testid="button-browse-delivery-companies"
          >
            <Search className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="font-medium text-sm">Choisir une entreprise</p>
              <p className="text-xs text-muted-foreground">Parcourir les entreprises partenaires et en choisir une précise.</p>
            </div>
          </button>
          <button
            onClick={() => dispatch.mutate({ deliveryId: delivery.id, mode: "SUPPLIER" }, {
              onSuccess: () => { toast({ title: "Prête à assigner à un chauffeur" }); onClose(); },
              onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
            })}
            disabled={dispatch.isPending}
            className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
          >
            <UserIcon className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="font-medium text-sm">Mes chauffeurs</p>
              <p className="text-xs text-muted-foreground">Livrer avec l'un de vos propres chauffeurs.</p>
            </div>
          </button>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Change the assigned driver before pickup (task Part 32) — only meaningful once a driver
// is already assigned (deliveryMode SUPPLIER, status ASSIGNED); refuses once PICKED_UP or
// later (storage.reassignDriver enforces this server-side too).
function ReassignDialog({ delivery, onClose }: { delivery: DeliveryWithDetails; onClose: () => void }) {
  const { data: drivers = [] } = useSupplierDrivers();
  const reassignDriver = useReassignDriver();
  const { toast } = useToast();
  const [selected, setSelected] = useState("");

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Changer le chauffeur assigné</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Commande #{delivery.orderId} · actuellement {delivery.driver?.name ?? "—"}</p>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger data-testid="select-reassign-driver"><SelectValue placeholder="Choisir un nouveau chauffeur" /></SelectTrigger>
          <SelectContent>
            {drivers.filter((d) => d.id !== delivery.driverId).map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          className="w-full" disabled={!selected || reassignDriver.isPending}
          onClick={() => reassignDriver.mutate({ deliveryId: delivery.id, driverId: Number(selected) }, {
            onSuccess: () => { toast({ title: "Chauffeur réassigné" }); onClose(); },
            onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
          })}
          data-testid="button-confirm-reassign"
        >
          Réassigner
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function SupplierDeliveryStatusPage() {
  const { data: deliveries = [], isLoading } = useDeliveries();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL");
  const [modeFilter, setModeFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [dispatchTarget, setDispatchTarget] = useState<DeliveryWithDetails | null>(null);
  const [viewTarget, setViewTarget] = useState<DeliveryWithDetails | null>(null);
  const [reassignTarget, setReassignTarget] = useState<DeliveryWithDetails | null>(null);

  const filtered = useMemo(() => {
    return deliveries.filter((d) => {
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (modeFilter !== "ALL" && d.deliveryMode !== modeFilter) return false;
      if (!matchesDateFilter(d.createdAt as any, dateFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [String(d.orderId), String(d.id), d.cafe.name, d.driver?.name ?? "", d.deliveryCompany?.name ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [deliveries, statusFilter, dateFilter, modeFilter, search]);

  const inTransit = deliveries.filter((d) => ["PICKED_UP", "IN_TRANSIT"].includes(d.status)).length;
  const deliveredCount = deliveries.filter((d) => d.status === "DELIVERED").length;
  const pendingDispatch = deliveries.filter((d) => d.status === "PENDING").length;

  const hasFilters = statusFilter !== "ALL" || dateFilter !== "ALL" || modeFilter !== "ALL" || !!search;
  const clearFilters = () => { setStatusFilter("ALL"); setDateFilter("ALL"); setModeFilter("ALL"); setSearch(""); };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Delivery</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Suivi et gestion de toutes vos livraisons.</p>
      </div>

      <SupplierDeliveryTabs />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground">À dispatcher</p><p className="text-2xl font-bold">{pendingDispatch}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-indigo-500/10 rounded-xl p-3"><Truck className="w-5 h-5 text-indigo-600" /></div>
            <div><p className="text-xs text-muted-foreground">En transit</p><p className="text-2xl font-bold">{inTransit}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><CheckCircle className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">Livrées</p><p className="text-2xl font-bold">{deliveredCount}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>{s === "ALL" ? "Tous les statuts" : (DELIVERY_STATUS_META[s]?.label ?? s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Date" /></SelectTrigger>
          <SelectContent>
            {DATE_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Mode de livraison" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les modes</SelectItem>
            <SelectItem value="DELIVERY_COMPANY">{DELIVERY_MODE_LABEL.DELIVERY_COMPANY}</SelectItem>
            <SelectItem value="SUPPLIER">{DELIVERY_MODE_LABEL.SUPPLIER}</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Commande, café, chauffeur…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-56" />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={clearFilters}>
            <X className="w-3.5 h-3.5" /> Effacer
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} livraison{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucune livraison</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const meta = DELIVERY_STATUS_META[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-600" };
            return (
              <Card key={d.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-4">
                      <div className="rounded-lg p-2 mt-0.5 bg-secondary"><Truck className="w-4 h-4 text-muted-foreground" /></div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">Commande #{d.orderId}</p>
                          <Badge variant="secondary" className={meta.cls}>{meta.label}</Badge>
                          {d.deliveryMode && <Badge variant="outline" className="text-[11px]">{DELIVERY_MODE_LABEL[d.deliveryMode]}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Café: <span className="font-medium text-foreground">{d.cafe.name}</span></p>
                        {d.deliveryCompany && <p className="text-xs text-muted-foreground">Transporteur: <span className="font-medium text-foreground">{d.deliveryCompany.name}</span></p>}
                        {d.driver && <p className="text-xs text-muted-foreground">Chauffeur: <span className="font-medium text-foreground">{d.driver.name}</span></p>}
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {d.destinationAddress?.address || "—"}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{formatDate(d.createdAt as any)}</span>
                      <div className="flex gap-2">
                        {d.status === "PENDING" && (
                          <Button size="sm" onClick={() => setDispatchTarget(d)}>Dispatcher</Button>
                        )}
                        {d.status === "ASSIGNED" && d.deliveryMode === "SUPPLIER" && (
                          <Button size="sm" variant="outline" onClick={() => setReassignTarget(d)} data-testid={`button-reassign-status-${d.id}`}>Changer de chauffeur</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setViewTarget(d)}>Détails</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {reassignTarget && <ReassignDialog delivery={reassignTarget} onClose={() => setReassignTarget(null)} />}

      {dispatchTarget && <DispatchDialog delivery={dispatchTarget} onClose={() => setDispatchTarget(null)} />}

      <Dialog open={!!viewTarget} onOpenChange={(v) => { if (!v) setViewTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Détails de la livraison</DialogTitle></DialogHeader>
          {viewTarget && <DeliveryDetails delivery={viewTarget} viewerRole="SUPPLIER" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
