import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useThemeStore } from "@/store/theme-store";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { AddressDetails } from "@shared/schema";

export const ADDRESS_DETAIL_FIELDS: { key: keyof AddressDetails; label: string; placeholder: string; span?: boolean }[] = [
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

// Shared address-details form body (Part 1/19 of the address/location
// synchronization task) — the single implementation of "official geographical
// location (read-only, Admin-authoritative) + editable human-readable detail
// fields" reused by every surface that lets an account complete its address:
// AccountAddressCard (inline SectionCard, used by every service account's own
// Settings and now Supplier's), and AddressDetailsModal (Dialog, used by
// Coffee Owner). Always saves through the same generic
// PATCH /api/auth/me/profile { locationDetails } — never the lat/lng-requiring
// PATCH /api/auth/me/location route, so this can never override the official
// coordinates Admin controls via the map modal.
export function AddressDetailsFields({ onSaved, accentClassName = "" }: { onSaved?: () => void; accentClassName?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const dk = useThemeStore((s) => s.isDark);
  const textPrimary = dk ? "text-white" : "text-gray-900";
  const textMuted = dk ? "text-gray-400" : "text-gray-500";
  const inputCls = dk ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "";
  const labelCls = dk ? "text-xs text-gray-400" : "text-xs text-muted-foreground";
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
      onSaved?.();
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message ?? "Impossible de sauvegarder.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className={`text-sm ${textPrimary}`}>{user?.locationAddress || "Aucune localisation officielle définie."}</p>
        <p className={`text-xs mt-1 ${textMuted}`}>
          Localisation géographique officielle — définie par l'administration. Vous pouvez compléter les détails d'adresse ci-dessous.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ADDRESS_DETAIL_FIELDS.map((f) => (
          <div key={f.key} className={f.span ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
            <Label className={labelCls}>{f.label}</Label>
            <Input value={details[f.key] ?? ""} onChange={setField(f.key)} placeholder={f.placeholder} className={inputCls} data-testid={`input-address-${f.key}`} />
          </div>
        ))}
        <div className="sm:col-span-2 space-y-1.5">
          <Label className={labelCls}>Notes complémentaires (optionnel)</Label>
          <Textarea value={details.additionalNotes ?? ""} onChange={setField("additionalNotes")} placeholder="Ex: Entrée côté parking" rows={2} className={inputCls} data-testid="input-address-additionalNotes" />
        </div>
      </div>
      <Button className={accentClassName} onClick={save} disabled={saving} data-testid="button-save-address-details">
        {saving ? "Enregistrement…" : "Enregistrer l'adresse"}
      </Button>
    </div>
  );
}
