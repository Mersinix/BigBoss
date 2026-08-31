import { useState } from "react";
import { useDeliveries } from "@/hooks/use-deliveries";
import { useVehicles, useAssignVehicle, useDriverReviews, VEHICLE_TYPE_LABELS, type DeliveryVehicleType } from "@/hooks/use-delivery-ecosystem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Truck, Plus, Loader2, Search, Phone, Mail, Calendar, Star, Package, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAvatarUrl } from "@/lib/avatar";
import { formatDate } from "@/lib/format";
import type { User } from "@shared/schema";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

type CreateDriverInput = { name: string; email: string; password: string; phone?: string | null; isWhatsapp?: boolean; profileImageUrl?: string | null };

type Props = {
  title?: string;
  subtitle?: string;
  useDrivers: () => UseQueryResult<User[]>;
  useCreateDriver: () => UseMutationResult<any, any, CreateDriverInput>;
  /** Only the Delivery Company roster manages its own fleet's vehicle assignment inline —
   *  Supplier drivers just display whichever vehicle they already have (if any). */
  ownerType?: "DELIVERY_COMPANY" | "SUPPLIER";
};

function DriverDetailModal({ driver, deliveries, vehicle, onClose }: { driver: User | null; deliveries: any[]; vehicle: any; onClose: () => void }) {
  const { data: reviews = [] } = useDriverReviews(driver?.id ?? null);
  if (!driver) return null;
  const active = deliveries.filter((d) => d.driverId === driver.id && ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(d.status)).length;
  const completed = deliveries.filter((d) => d.driverId === driver.id && d.status === "DELIVERED").length;
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar><AvatarImage src={getAvatarUrl(driver)} alt={driver.name} /><AvatarFallback className="bg-primary/10 text-primary font-bold">{driver.name.charAt(0)}</AvatarFallback></Avatar>
            <span>{driver.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Badge variant="outline">{driver.status}</Badge>
            {(driver as any).isWhatsapp && driver.phone && <Badge variant="outline" className="text-green-600 border-green-200">WhatsApp</Badge>}
          </div>
          <div className="flex gap-2"><Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Email</p><p>{driver.email}</p></div></div>
          <div className="flex gap-2"><Phone className="h-4 w-4 text-primary mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Téléphone</p><p>{driver.phone || "—"}</p></div></div>
          <div className="flex gap-2"><Calendar className="h-4 w-4 text-primary mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Inscrit le</p><p>{driver.createdAt ? formatDate(driver.createdAt as any) : "—"}</p></div></div>
          <div className="flex gap-2"><Truck className="h-4 w-4 text-primary mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Véhicule</p><p>{vehicle ? `${VEHICLE_TYPE_LABELS[vehicle.type as DeliveryVehicleType]} — ${vehicle.brand} ${vehicle.model}${vehicle.plateNumber ? ` (${vehicle.plateNumber})` : ""}` : "Aucun véhicule assigné"}</p></div></div>
          <div className="flex gap-2"><Package className="h-4 w-4 text-primary mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Livraisons</p><p>{active} en cours / {completed} terminée(s)</p></div></div>
          <div className="flex gap-2"><Star className="h-4 w-4 text-primary mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Évaluation</p><p>{reviews.length > 0 ? `${avgRating.toFixed(1)} (${reviews.length} avis)` : "Aucun avis"}</p></div></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Driver roster UI shared by the Delivery Company "Drivers" page and the Supplier "Drivers"
 * tab — same experience, different data source (a Driver belongs to exactly one operator;
 * see users.deliveryCompanyId / users.supplierId). Avoids maintaining two near-identical
 * pages for what is, underneath, the same Driver model. Professional mapped cards (not a
 * table) with real vehicle/rating/activity information — see task Parts 14/15/34.
 */
export default function DriverRosterView({ title = "Chauffeurs", subtitle = "Gérez vos chauffeurs.", useDrivers, useCreateDriver, ownerType }: Props) {
  const { data: drivers = [], isLoading } = useDrivers();
  const { data: deliveries = [] } = useDeliveries();
  // Hooks called unconditionally (Rules of Hooks) — the vehicles query is simply disabled
  // when this roster has no vehicle-owning context (Supplier drivers page).
  const { data: vehicles = [] } = useVehicles(ownerType ?? "DELIVERY_COMPANY", !!ownerType);
  const assignVehicle = useAssignVehicle(ownerType ?? "DELIVERY_COMPANY");
  const createDriver = useCreateDriver();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", isWhatsapp: false, profileImageUrl: "" });
  const [detail, setDetail] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("ALL");

  const vehicleByDriver = new Map<number, any>();
  for (const v of vehicles) if (v.assignedDriverId) vehicleByDriver.set(v.assignedDriverId, v);
  const unassignedVehicles = vehicles.filter((v) => !v.assignedDriverId && v.isActive);

  const activeDeliveriesByDriver = new Map<number, number>();
  for (const d of deliveries) {
    if (d.driverId && ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(d.status)) {
      activeDeliveriesByDriver.set(d.driverId, (activeDeliveriesByDriver.get(d.driverId) ?? 0) + 1);
    }
  }
  const completedByDriver = new Map<number, number>();
  for (const d of deliveries) {
    if (d.driverId && d.status === "DELIVERED") {
      completedByDriver.set(d.driverId, (completedByDriver.get(d.driverId) ?? 0) + 1);
    }
  }

  const filteredDrivers = drivers.filter((d) => {
    if (search && !`${d.name} ${d.phone ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    const busy = (activeDeliveriesByDriver.get(d.id) ?? 0) > 0;
    if (availabilityFilter === "AVAILABLE" && busy) return false;
    if (availabilityFilter === "BUSY" && !busy) return false;
    return true;
  });

  const handleCreate = () => {
    createDriver.mutate(
      { name: form.name, email: form.email, password: form.password, phone: form.phone || null, isWhatsapp: form.isWhatsapp, profileImageUrl: form.profileImageUrl.trim() || null },
      {
        onSuccess: () => {
          toast({ title: "Chauffeur ajouté" });
          setOpen(false);
          setForm({ name: "", email: "", password: "", phone: "", isWhatsapp: false, profileImageUrl: "" });
        },
        onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      },
    );
  };

  const handleAssignVehicle = (driverId: number, vehicleId: string) => {
    assignVehicle.mutate({ vehicleId: Number(vehicleId), driverId }, {
      onSuccess: () => toast({ title: "Véhicule assigné" }),
      onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1.5" data-testid="button-add-driver"><Plus className="w-4 h-4" /> Ajouter un chauffeur</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><Truck className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Chauffeurs</p><p className="text-2xl font-bold">{drivers.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-indigo-500/10 rounded-xl p-3"><Truck className="w-5 h-5 text-indigo-600" /></div>
            <div><p className="text-xs text-muted-foreground">En livraison actuellement</p><p className="text-2xl font-bold">{activeDeliveriesByDriver.size}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un chauffeur…" data-testid="input-search-drivers" />
        </div>
        <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
          <SelectTrigger className="w-44" data-testid="select-driver-availability"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous</SelectItem>
            <SelectItem value="AVAILABLE">Disponible</SelectItem>
            <SelectItem value="BUSY">Occupé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-muted animate-pulse rounded-2xl" />)}</div>
      ) : filteredDrivers.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          {drivers.length === 0 ? "Aucun chauffeur pour le moment. Ajoutez-en un pour commencer à assigner des livraisons." : "Aucun chauffeur ne correspond à ces filtres."}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDrivers.map((d) => {
            const busy = (activeDeliveriesByDriver.get(d.id) ?? 0) > 0;
            const vehicle = vehicleByDriver.get(d.id);
            return (
              <Card key={d.id} className="hover:shadow-md transition-shadow" data-testid={`card-driver-${d.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3 cursor-pointer" onClick={() => setDetail(d)}>
                    <Avatar className="w-10 h-10 shrink-0">
                      <AvatarImage src={getAvatarUrl(d)} alt={d.name} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">{d.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate">{d.name}</h3>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><Phone className="h-3 w-3" />{d.phone || "—"}</p>
                    </div>
                    <span className={`h-2.5 w-2.5 rounded-full mt-1 shrink-0 ${busy ? "bg-amber-500" : "bg-green-500"}`} title={busy ? "Occupé" : "Disponible"} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-xs">{activeDeliveriesByDriver.get(d.id) ?? 0} en cours</Badge>
                    <Badge variant="secondary" className="text-xs">{completedByDriver.get(d.id) ?? 0} terminée(s)</Badge>
                    {vehicle && <Badge variant="outline" className="text-xs">{VEHICLE_TYPE_LABELS[vehicle.type as DeliveryVehicleType]}</Badge>}
                  </div>
                  {ownerType && (
                    <div className="pt-2 border-t border-border/50">
                      <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mb-1"><UserIcon className="w-3 h-3" />Véhicule</label>
                      <Select value={vehicle ? String(vehicle.id) : "__none__"} onValueChange={(val) => val !== "__none__" && handleAssignVehicle(d.id, val)}>
                        <SelectTrigger className="h-8 text-xs" data-testid={`select-driver-vehicle-${d.id}`}>
                          <SelectValue placeholder="Aucun">{vehicle ? `${vehicle.brand} ${vehicle.model}` : "Aucun"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Aucun</SelectItem>
                          {vehicle && <SelectItem value={String(vehicle.id)}>{vehicle.brand} {vehicle.model}</SelectItem>}
                          {unassignedVehicles.map((v) => <SelectItem key={v.id} value={String(v.id)}>{VEHICLE_TYPE_LABELS[v.type as DeliveryVehicleType]} — {v.brand} {v.model}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={() => setDetail(d)} data-testid={`button-driver-details-${d.id}`}>Voir les détails</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un chauffeur</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nom complet" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="input-new-driver-name" />
            <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} data-testid="input-new-driver-email" />
            <Input placeholder="Mot de passe (min. 6 caractères)" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} data-testid="input-new-driver-password" />
            <div className="flex items-center gap-2">
              <Input placeholder="Téléphone (optionnel)" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} data-testid="input-new-driver-phone" />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none shrink-0">
                <input type="checkbox" className="w-3.5 h-3.5 rounded border-border/50 accent-primary" checked={form.isWhatsapp} onChange={(e) => setForm((f) => ({ ...f, isWhatsapp: e.target.checked }))} />
                WhatsApp
              </label>
            </div>
            <Input placeholder="Photo de profil — URL (optionnel)" value={form.profileImageUrl} onChange={(e) => setForm((f) => ({ ...f, profileImageUrl: e.target.value }))} data-testid="input-new-driver-picture" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button
              onClick={handleCreate}
              disabled={!form.name || !form.email || form.password.length < 6 || createDriver.isPending}
              data-testid="button-submit-new-driver"
            >
              {createDriver.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DriverDetailModal driver={detail} deliveries={deliveries} vehicle={detail ? vehicleByDriver.get(detail.id) : null} onClose={() => setDetail(null)} />
    </div>
  );
}
