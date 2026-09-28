import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User } from "lucide-react";
import type { SettingsCardHandle } from "@/components/settings/settings-card-handle";

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
//
// Save is exposed imperatively via ref (see settings-card-handle.ts) — the
// page-level unified Save button drives it; this component no longer renders
// its own Save button or toast, only its own fields.
export const AccountIdentityCard = forwardRef<SettingsCardHandle, {
  nameLabel?: string;
  testIdPrefix?: string;
  // Optional visual override for the outer SectionCard — omitted by every
  // caller except Maintenance's own account-wide card styling unification,
  // so every other account keeps its exact current look.
  className?: string;
}>(function AccountIdentityCard({ nameLabel = "Nom complet", testIdPrefix = "settings", className }, ref) {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [isWhatsapp, setIsWhatsapp] = useState((user as any)?.isWhatsapp ?? false);
  const [profileImageUrl, setProfileImageUrl] = useState((user as any)?.profileImageUrl ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState((user as any)?.coverImageUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setIsWhatsapp((user as any).isWhatsapp ?? false);
    setProfileImageUrl((user as any).profileImageUrl ?? "");
    setCoverImageUrl((user as any).coverImageUrl ?? "");
    setDirty(false);
  }, [user?.id, (user as any)?.updatedAt]);

  const markDirty = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };
  const setNameD = markDirty(setName);
  const setPhoneD = markDirty(setPhone);
  const setIsWhatsappD = markDirty(setIsWhatsapp);
  const setProfileImageUrlD = markDirty(setProfileImageUrl);
  const setCoverImageUrlD = markDirty(setCoverImageUrl);

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!dirty) return;
      setSaving(true);
      try {
        await apiRequest("PATCH", "/api/auth/me/profile", {
          name, phone, isWhatsapp,
          profileImageUrl: profileImageUrl.trim() || null,
          coverImageUrl: coverImageUrl.trim() || null,
        });
        await queryClient.invalidateQueries({ queryKey: [api.auth.me.path] });
        setDirty(false);
      } finally {
        setSaving(false);
      }
    },
  }), [dirty, name, phone, isWhatsapp, profileImageUrl, coverImageUrl]);

  return (
    <SectionCard title="Compte" icon={User} className={className}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{nameLabel}</Label>
          <Input value={name} onChange={(e) => setNameD(e.target.value)} disabled={saving} data-testid={`input-${testIdPrefix}-name`} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>Téléphone</Label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" data-testid={`checkbox-${testIdPrefix}-whatsapp`} className="w-3.5 h-3.5 rounded border-border/50 accent-primary"
                checked={isWhatsapp} disabled={saving} onChange={(e) => setIsWhatsappD(e.target.checked)} />
              WhatsApp
            </label>
          </div>
          <Input value={phone} onChange={(e) => setPhoneD(e.target.value)} disabled={saving} data-testid={`input-${testIdPrefix}-phone`} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>E-mail</Label>
          <Input value={user?.email ?? ""} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Photo de profil (URL)</Label>
          <Input type="url" value={profileImageUrl} onChange={(e) => setProfileImageUrlD(e.target.value)} disabled={saving} placeholder="https://…" data-testid={`input-${testIdPrefix}-picture`} />
        </div>
        <div className="space-y-1.5">
          <Label>Cover (URL)</Label>
          <Input type="url" value={coverImageUrl} onChange={(e) => setCoverImageUrlD(e.target.value)} disabled={saving} placeholder="https://…" data-testid={`input-${testIdPrefix}-cover`} />
        </div>
      </div>
    </SectionCard>
  );
});
