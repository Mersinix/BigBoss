import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import type { AddressDetails } from "@shared/schema";

const FIELDS: { key: keyof AddressDetails; label: string; placeholder: string; span?: boolean }[] = [
  { key: "street", label: "Adresse (optionnel)", placeholder: "Rue, avenue…", span: true },
  { key: "buildingNumber", label: "N° bâtiment (optionnel)", placeholder: "Ex: 12" },
  { key: "postalCode", label: "Code postal (optionnel)", placeholder: "Ex: 1000" },
  { key: "governorate", label: "Gouvernorat (optionnel)", placeholder: "Ex: Tunis" },
  { key: "municipality", label: "Municipalité (optionnel)", placeholder: "Ex: La Marsa" },
  { key: "buildingType", label: "Type de bâtiment (optionnel)", placeholder: "Ex: Immeuble" },
  { key: "apartment", label: "Appartement (optionnel)", placeholder: "Ex: 4B" },
  { key: "floor", label: "Étage (optionnel)", placeholder: "Ex: 2" },
  { key: "door", label: "Porte (optionnel)", placeholder: "Ex: A" },
];

// Unified "Localisation" section (Part 6) — replaces the owner-side map modal
// with a static address-details form for every professional account.
// IMPORTANT split: users.locationAddress/locationLat/locationLng (the official
// geocoded pin) stay exclusively Admin-authoritative, set only via the
// existing map-based LocationPickerModal in Admin's own UI (untouched by this
// component) — this form only ever edits users.locationDetails (street/
// building number/postal code/governorate/municipality/building type/
// apartment/floor/door/notes), through the same generic PATCH /api/auth/me/profile
// endpoint every account already uses, never the lat/lng-requiring
// PATCH /api/auth/me/location route. Distance calculations, "Ville" display and
// every marketplace/Admin location representation keep reading the Admin-set
// locationAddress/lat/lng exactly as before — nothing here can change those.
export function AccountAddressCard({ accentClassName = "" }: { accentClassName?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [details, setDetails] = useState<AddressDetails>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDetails(((user as any)?.locationDetails as AddressDetails | null) ?? {});
  }, [user?.id, (user as any)?.updatedAt]);

  const setField = (key: keyof AddressDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDetails((d) => ({ ...d, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", { locationDetails: details });
      await queryClient.invalidateQueries({ queryKey: [api.auth.me.path] });
      toast({ title: "Adresse mise à jour" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message ?? "Impossible de sauvegarder.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Localisation" icon={MapPin}>
      <div className="space-y-3">
        <div>
          <p className="text-sm text-foreground">{user?.locationAddress || "Aucune localisation officielle définie."}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Localisation géographique officielle — définie par l'administration. Vous pouvez compléter les détails d'adresse ci-dessous.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.span ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              <Input value={details[f.key] ?? ""} onChange={setField(f.key)} placeholder={f.placeholder} data-testid={`input-address-${f.key}`} />
            </div>
          ))}
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes complémentaires (optionnel)</Label>
            <Textarea value={details.additionalNotes ?? ""} onChange={setField("additionalNotes")} placeholder="Ex: Entrée côté parking" rows={2} data-testid="input-address-additionalNotes" />
          </div>
        </div>
        <Button className={accentClassName} onClick={save} disabled={saving} data-testid="button-save-address-details">
          {saving ? "Enregistrement…" : "Enregistrer l'adresse"}
        </Button>
      </div>
    </SectionCard>
  );
}
