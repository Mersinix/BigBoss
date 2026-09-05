import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useDriverDetails, useUpdateDriverProfile } from "@/hooks/use-driver-profile";
import { useMyVehicle, useCreateMyVehicle, useUpdateMyVehicle, VEHICLE_TYPE_LABELS, type DeliveryVehicleType } from "@/hooks/use-delivery-ecosystem";
import { DriverDetailModal } from "@/components/driver/driver-detail-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAvatarUrl } from "@/lib/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User as UserIcon, Award, XCircle, Calendar, Zap, Truck, Eye, AlertCircle } from "lucide-react";
import { WEEKLY_DAY_DEFS, buildWeeklyHoursFallback } from "@/lib/weekly-hours";
import type { OpeningHoursMap } from "@shared/schema";

// Business → Profil — the Driver's editable profile. Brand-new page (no
// pre-existing profile editor to preserve): mirrors the Delivery Company
// profile editor exactly (same fields/sections/save pattern), adapted to
// Driver content. Vehicle stays on the existing self-service
// /api/driver/vehicle routes (useMyVehicle/useCreateMyVehicle/
// useUpdateMyVehicle), never rebuilt. Same source of truth everywhere it's
// shown — self-editor here, Eye preview below, and the shared
// DriverDetailModal used by Supplier/Delivery Company/Admin all read the
// same /api/drivers/:driverId/details query.
export default function DriverProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = useDriverDetails(user?.id ?? null);
  const updateProfile = useUpdateDriverProfile();
  const { data: vehicle } = useMyVehicle();
  const createVehicle = useCreateMyVehicle();
  const updateVehicle = useUpdateMyVehicle();
  const [previewOpen, setPreviewOpen] = useState(false);

  const [bio, setBio] = useState("");
  const [experienceYears, setExperienceYears] = useState("0");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [certificationDraft, setCertificationDraft] = useState("");
  const [isOnVacation, setIsOnVacation] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState<OpeningHoursMap>(buildWeeklyHoursFallback([], "08:00", "18:00"));

  const [vehicleType, setVehicleType] = useState<DeliveryVehicleType>("MOTO");
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");

  useEffect(() => {
    if (!data?.profile) return;
    const p = data.profile;
    setBio(p.bio);
    setExperienceYears(String(p.experienceYears ?? 0));
    setCertifications(p.certifications ?? []);
    setIsOnVacation(p.isOnVacation);
    setWeeklyHours(p.weeklyHours ?? buildWeeklyHoursFallback([], "08:00", "18:00"));
  }, [data?.profile?.updatedAt]);

  useEffect(() => {
    if (!vehicle) return;
    setVehicleType(vehicle.type as DeliveryVehicleType);
    setVehicleBrand(vehicle.brand);
    setVehicleModel(vehicle.model);
    setVehiclePlate(vehicle.plateNumber);
  }, [vehicle?.id, vehicle?.updatedAt]);

  const updateDayHours = (key: keyof OpeningHoursMap, patch: Partial<OpeningHoursMap[keyof OpeningHoursMap]>) => {
    setWeeklyHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };
  const addCertification = () => {
    const v = certificationDraft.trim();
    if (!v || certifications.includes(v)) return;
    setCertifications((prev) => [...prev, v]);
    setCertificationDraft("");
  };

  const saveProfile = () => {
    updateProfile.mutate(
      { bio, experienceYears: Math.max(0, parseInt(experienceYears, 10) || 0), certifications, isOnVacation, weeklyHours },
      {
        onSuccess: () => toast({ title: "Profil enregistré" }),
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  const saveVehicle = () => {
    const payload = { type: vehicleType, brand: vehicleBrand, model: vehicleModel, plateNumber: vehiclePlate };
    const mutation = vehicle ? updateVehicle : createVehicle;
    mutation.mutate(payload, {
      onSuccess: () => toast({ title: "Véhicule enregistré" }),
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) {
    return <div className="flex flex-col gap-5 p-6"><div className="h-8 w-64 bg-muted rounded animate-pulse" /><div className="h-72 w-full rounded-2xl bg-muted animate-pulse" /></div>;
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mon profil</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vos informations telles qu'elles apparaissent auprès de votre fournisseur/entreprise et de l'Admin.</p>
        </div>
        {/* Preview — opens the exact same modal used everywhere a driver is shown (Supplier →
            Drivers, Espace Livraison → Chauffeurs, Admin → Chauffeurs). Purely informational,
            so nothing here can act against the driver's own account. */}
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setPreviewOpen(true)} data-testid="button-preview-profile">
          <Eye className="w-3.5 h-3.5" /> Aperçu
        </Button>
      </div>

      <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><UserIcon className="w-4 h-4 text-blue-500" />Informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={getAvatarUrl(user)} alt={user?.name ?? "Chauffeur"} />
              <AvatarFallback className="bg-blue-100 text-blue-700 font-bold text-xl">{(user?.name ?? "C").charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.phone || "Téléphone non renseigné"}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Nom, email, téléphone et photo se modifient depuis Paramètres.</p>
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Biographie</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} className="rounded-xl mt-0.5 resize-none" rows={3} data-testid="input-bio" />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Award className="w-4 h-4 text-blue-500" />Expérience & certifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-gray-500">Expérience (ans)</Label>
            <Input type="number" min="0" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} className="h-9 rounded-xl mt-1 max-w-[180px]" data-testid="input-experience-years" />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Certifications</Label>
            <div className="flex gap-2 mt-1">
              <Input value={certificationDraft} onChange={(e) => setCertificationDraft(e.target.value)} placeholder="Ex. Permis moto" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCertification())} className="h-9 rounded-xl" data-testid="input-new-certification" />
              <Button type="button" variant="outline" className="h-9 rounded-xl shrink-0" disabled={!certificationDraft.trim()} onClick={addCertification} data-testid="button-add-certification">Ajouter</Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {certifications.map((c, i) => (
                <span key={`${c}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2.5 py-1 text-xs">
                  {c}
                  <button type="button" aria-label={`Supprimer ${c}`} onClick={() => setCertifications((cur) => cur.filter((_, idx) => idx !== i))}><XCircle className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          </div>
          <Button onClick={saveProfile} disabled={updateProfile.isPending} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl" data-testid="button-save-profile">
            {updateProfile.isPending ? "Enregistrement…" : "Enregistrer le profil"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Truck className="w-4 h-4 text-blue-500" />Véhicule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">Type</Label>
              <Select value={vehicleType} onValueChange={(v) => setVehicleType(v as DeliveryVehicleType)}>
                <SelectTrigger className="h-9 rounded-xl mt-0.5" data-testid="select-vehicle-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(VEHICLE_TYPE_LABELS) as DeliveryVehicleType[]).map((k) => <SelectItem key={k} value={k}>{VEHICLE_TYPE_LABELS[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Plaque</Label>
              <Input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} className="h-9 rounded-xl mt-0.5" data-testid="input-vehicle-plate" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">Marque</Label>
              <Input value={vehicleBrand} onChange={(e) => setVehicleBrand(e.target.value)} className="h-9 rounded-xl mt-0.5" data-testid="input-vehicle-brand" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Modèle</Label>
              <Input value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} className="h-9 rounded-xl mt-0.5" data-testid="input-vehicle-model" />
            </div>
          </div>
          <Button onClick={saveVehicle} disabled={createVehicle.isPending || updateVehicle.isPending} variant="outline" className="rounded-xl" data-testid="button-save-vehicle">
            {vehicle ? "Mettre à jour le véhicule" : "Enregistrer le véhicule"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-500" />Disponibilité</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-gray-500 mb-2 block">Jours et horaires disponibles</Label>
            <div className="space-y-2">
              {WEEKLY_DAY_DEFS.map((d) => {
                const day = weeklyHours[d.key];
                return (
                  <div key={d.key} className="flex items-center gap-3 rounded-xl border border-border/50 p-2.5">
                    <button
                      type="button"
                      onClick={() => updateDayHours(d.key, { closed: !day.closed })}
                      className={`w-16 shrink-0 h-9 rounded-xl text-xs font-semibold transition-all ${!day.closed ? "bg-blue-600 text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                      data-testid={`button-toggle-day-${d.key}`}
                    >
                      {d.short}
                    </button>
                    {day.closed ? (
                      <span className="text-xs font-medium text-muted-foreground flex-1">Fermé</span>
                    ) : (
                      <div className="flex items-center gap-2 flex-1">
                        <Input type="time" value={day.open} onChange={(e) => updateDayHours(d.key, { open: e.target.value })} className="h-9 text-xs" data-testid={`input-day-open-${d.key}`} />
                        <span className="text-muted-foreground text-xs">–</span>
                        <Input type="time" value={day.close} onChange={(e) => updateDayHours(d.key, { close: e.target.value })} className="h-9 text-xs" data-testid={`input-day-close-${d.key}`} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-muted/40 p-3">
            <p className="font-semibold text-xs mb-2 text-blue-700 dark:text-blue-400 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Résumé de disponibilité</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              {WEEKLY_DAY_DEFS.map((d) => {
                const day = weeklyHours[d.key];
                return <p key={d.key}><strong className="text-foreground">{d.label} :</strong> {day.closed ? "Fermé" : `${day.open} – ${day.close}`}</p>;
              })}
              <p className="pt-1"><strong className="text-foreground">Statut :</strong> {isOnVacation ? "🔴 En congé" : "🟢 Disponible"}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div>
              <p className="text-sm font-medium">En congé / indisponible</p>
              <p className="text-xs text-muted-foreground">Signale votre indisponibilité aux personnes qui consultent votre profil.</p>
            </div>
            <Switch checked={isOnVacation} onCheckedChange={setIsOnVacation} data-testid="switch-vacation" />
          </div>
          {isOnVacation && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-3 text-xs text-orange-700 dark:text-orange-300 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Vous apparaissez comme indisponible. Désactivez le mode congé pour redevenir disponible.
            </div>
          )}
          <Button onClick={saveProfile} disabled={updateProfile.isPending} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-5">
            {updateProfile.isPending ? "Enregistrement…" : "Enregistrer la disponibilité"}
          </Button>
        </CardContent>
      </Card>

      <DriverDetailModal
        driver={user ?? null}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
