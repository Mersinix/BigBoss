import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";

// Unified "Compte" section (Part 1/4/14 of the cross-account Settings
// unification task) — same fields for every one of the seven professional
// accounts (Nom/Structure, Téléphone, Email, Photo de profil, Cover), all of
// which already live on the generic `users` table and save through the same
// existing PATCH /api/auth/me/profile endpoint every account's old Settings
// page already used. Fully self-contained (no per-account data plumbing
// needed) — only the label/accent color vary per caller, so this single
// component IS the unification rather than seven near-identical copies.
// coverImageUrl is new (Part 4): treated as the account's cover/banner image
// wherever the matching Details Modal supports one — same generic field/route,
// no second image system.
export function AccountIdentityCard({
  nameLabel = "Nom complet",
  accentClassName = "",
  testIdPrefix = "settings",
  className,
}: {
  nameLabel?: string;
  // Full Tailwind class string for the save button, e.g. "bg-orange-600 hover:bg-orange-700
  // text-white" — passed whole so Tailwind's JIT scanner sees the literal classes.
  accentClassName?: string;
  testIdPrefix?: string;
  // Optional visual override for the outer SectionCard — omitted by every
  // caller except Maintenance's own account-wide card styling unification,
  // so every other account keeps its exact current look.
  className?: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [isWhatsapp, setIsWhatsapp] = useState((user as any)?.isWhatsapp ?? false);
  const [profileImageUrl, setProfileImageUrl] = useState((user as any)?.profileImageUrl ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState((user as any)?.coverImageUrl ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setIsWhatsapp((user as any).isWhatsapp ?? false);
    setProfileImageUrl((user as any).profileImageUrl ?? "");
    setCoverImageUrl((user as any).coverImageUrl ?? "");
  }, [user?.id, (user as any)?.updatedAt]);

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", {
        name, phone, isWhatsapp,
        profileImageUrl: profileImageUrl.trim() || null,
        coverImageUrl: coverImageUrl.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: [api.auth.me.path] });
      toast({ title: "Informations mises à jour" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message ?? "Impossible de sauvegarder.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Compte" icon={User} className={className}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{nameLabel}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} data-testid={`input-${testIdPrefix}-name`} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>Téléphone</Label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" data-testid={`checkbox-${testIdPrefix}-whatsapp`} className="w-3.5 h-3.5 rounded border-border/50 accent-primary"
                checked={isWhatsapp} onChange={(e) => setIsWhatsapp(e.target.checked)} />
              WhatsApp
            </label>
          </div>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid={`input-${testIdPrefix}-phone`} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>E-mail</Label>
          <Input value={user?.email ?? ""} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Photo de profil (URL)</Label>
          <Input type="url" value={profileImageUrl} onChange={(e) => setProfileImageUrl(e.target.value)} placeholder="https://…" data-testid={`input-${testIdPrefix}-picture`} />
        </div>
        <div className="space-y-1.5">
          <Label>Cover (URL)</Label>
          <Input type="url" value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://…" data-testid={`input-${testIdPrefix}-cover`} />
        </div>
      </div>
      <Button className={`mt-4 ${accentClassName}`} onClick={save} disabled={saving} data-testid={`button-save-${testIdPrefix}-account`}>
        {saving ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </SectionCard>
  );
}
