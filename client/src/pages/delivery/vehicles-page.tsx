import { useState } from "react";
import {
  useVehicles, useCreateVehicle, useUpdateVehicle, useDeleteVehicle, useAssignVehicle,
  VEHICLE_TYPE_LABELS, type DeliveryVehicleType, type Vehicle,
} from "@/hooks/use-delivery-ecosystem";
import { useDeliveryCompanyDrivers as useDriversHook } from "@/hooks/use-deliveries";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Plus, Pencil, Trash2, User as UserIcon, Snowflake } from "lucide-react";

const VEHICLE_ICONS: Record<DeliveryVehicleType, string> = {
  BICYCLE: "🚲", MOTO: "🏍️", CAR: "🚗", VAN: "🚐", TRUCK: "🚚", OTHER: "🚙",
};

type VehicleForm = { type: DeliveryVehicleType; brand: string; model: string; plateNumber: string; hasAirConditioning: boolean };
const EMPTY_FORM: VehicleForm = { type: "MOTO", brand: "", model: "", plateNumber: "", hasAirConditioning: false };

function VehicleFormDialog({ vehicle, onClose }: { vehicle: Vehicle | "new" | null; onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateVehicle("DELIVERY_COMPANY");
  const update = useUpdateVehicle("DELIVERY_COMPANY");
  const [form, setForm] = useState<VehicleForm>(vehicle && vehicle !== "new" ? { type: vehicle.type, brand: vehicle.brand, model: vehicle.model, plateNumber: vehicle.plateNumber, hasAirConditioning: vehicle.hasAirConditioning } : EMPTY_FORM);

  if (!vehicle) return null;
  const isNew = vehicle === "new";

  const save = () => {
    const onSettled = {
      onSuccess: () => { toast({ title: isNew ? "Véhicule ajouté" : "Véhicule mis à jour" }); onClose(); },
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    };
    if (isNew) create.mutate(form, onSettled);
    else update.mutate({ id: vehicle.id, ...form }, onSettled);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isNew ? "Ajouter un véhicule" : "Modifier le véhicule"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Type de véhicule</label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as DeliveryVehicleType }))}>
              <SelectTrigger data-testid="select-vehicle-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(VEHICLE_TYPE_LABELS) as DeliveryVehicleType[]).map((t) => <SelectItem key={t} value={t}>{VEHICLE_ICONS[t]} {VEHICLE_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Marque" value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} data-testid="input-vehicle-brand" />
            <Input placeholder="Modèle" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} data-testid="input-vehicle-model" />
          </div>
          <Input placeholder="Matricule (ex: 123 TUN 4567)" value={form.plateNumber} onChange={(e) => setForm((f) => ({ ...f, plateNumber: e.target.value }))} data-testid="input-vehicle-plate" />
          {(form.type === "CAR" || form.type === "VAN" || form.type === "TRUCK") && (
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <span className="text-sm font-medium flex items-center gap-1.5"><Snowflake className="w-3.5 h-3.5" />Avec climatiseur</span>
              <Switch checked={form.hasAirConditioning} onCheckedChange={(v) => setForm((f) => ({ ...f, hasAirConditioning: v }))} data-testid="switch-vehicle-ac" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={create.isPending || update.isPending} data-testid="button-save-vehicle">
            {create.isPending || update.isPending ? "Enregistrement…" : isNew ? "Ajouter" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DeliveryVehiclesPage() {
  const { toast } = useToast();
  const { data: vehicles = [], isLoading } = useVehicles("DELIVERY_COMPANY");
  const { data: drivers = [] } = useDriversHook();
  const update = useUpdateVehicle("DELIVERY_COMPANY");
  const remove = useDeleteVehicle("DELIVERY_COMPANY");
  const assign = useAssignVehicle("DELIVERY_COMPANY");
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);

  const driverName = (id: number | null) => (id ? drivers.find((d) => d.id === id)?.name ?? `Chauffeur #${id}` : null);
  const unassignedDrivers = drivers.filter((d) => !vehicles.some((v) => v.assignedDriverId === d.id));

  const toggleActive = (v: Vehicle) => {
    update.mutate({ id: v.id, isActive: !v.isActive }, {
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };
  const handleDelete = (v: Vehicle) => {
    if (!window.confirm(`Supprimer ce véhicule (${v.brand} ${v.model}) ?`)) return;
    remove.mutate(v.id, { onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }) });
  };
  const handleAssign = (v: Vehicle, driverId: string) => {
    assign.mutate({ vehicleId: v.id, driverId: driverId === "__none__" ? null : Number(driverId) }, {
      onSuccess: () => toast({ title: driverId === "__none__" ? "Véhicule désassigné" : "Véhicule assigné" }),
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Véhicules</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gérez la flotte de votre entreprise et assignez un véhicule à chaque chauffeur.</p>
        </div>
        <Button onClick={() => setEditing("new")} className="gap-1.5" data-testid="button-new-vehicle"><Plus className="w-4 h-4" />Ajouter un véhicule</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>
      ) : vehicles.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <Truck className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="font-semibold">Aucun véhicule pour le moment</p>
          <p className="text-sm text-muted-foreground mt-1">Ajoutez un véhicule pour l'assigner à un chauffeur.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vehicles.map((v) => (
            <Card key={v.id} data-testid={`card-vehicle-${v.id}`}>
              <CardContent className="p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{VEHICLE_ICONS[v.type]}</span>
                    <div>
                      <p className="font-semibold text-sm">{v.brand || VEHICLE_TYPE_LABELS[v.type]} {v.model}</p>
                      <p className="text-xs text-muted-foreground">{v.plateNumber || "Matricule non renseigné"}</p>
                    </div>
                  </div>
                  <Badge variant={v.isActive ? "default" : "secondary"}>{v.isActive ? "Actif" : "Inactif"}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-xs">{VEHICLE_TYPE_LABELS[v.type]}</Badge>
                  {v.hasAirConditioning && <Badge variant="outline" className="text-xs"><Snowflake className="w-3 h-3 mr-1" />Climatisé</Badge>}
                </div>
                <div className="pt-2 border-t border-border/50 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><UserIcon className="w-3.5 h-3.5" />Chauffeur assigné</label>
                  <Select value={v.assignedDriverId ? String(v.assignedDriverId) : "__none__"} onValueChange={(val) => handleAssign(v, val)}>
                    <SelectTrigger className="h-9" data-testid={`select-assign-driver-${v.id}`}>
                      <SelectValue placeholder="Aucun chauffeur assigné">{v.assignedDriverId ? driverName(v.assignedDriverId) : "Aucun chauffeur assigné"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Aucun</SelectItem>
                      {v.assignedDriverId && !unassignedDrivers.some((d) => d.id === v.assignedDriverId) && (
                        <SelectItem value={String(v.assignedDriverId)}>{driverName(v.assignedDriverId)}</SelectItem>
                      )}
                      {unassignedDrivers.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Switch checked={v.isActive} onCheckedChange={() => toggleActive(v)} data-testid={`switch-vehicle-active-${v.id}`} />
                    <span className="text-xs text-muted-foreground">Disponible</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(v)} data-testid={`button-edit-vehicle-${v.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(v)} data-testid={`button-delete-vehicle-${v.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <VehicleFormDialog vehicle={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
