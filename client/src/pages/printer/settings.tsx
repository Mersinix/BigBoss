import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Lock, LogOut, MapPin, Tag } from "lucide-react";
import { SectionCard } from "@/components/dashboard/dashboard-kit";

// "Settings" — reuses the app's existing generic profile-update endpoint (PATCH
// /api/auth/me/profile), the same pattern as pages/supplier/settings-page.tsx and
// pages/driver/settings.tsx (both built this session as the current reference for
// self-service settings). Location is shown read-only: PATCH /api/auth/me/location
// requires address+lat+lng all truthy (checked in server/routes.ts), i.e. it expects a
// map-based picker, which is out of scope here — rather than build a text-only editor
// against an endpoint that would reject it, this page surfaces the current address only.
// printCategories (which categories this printer account is approved for) is shown
// read-only too — it's admin-managed only (admin/users-page.tsx, admin/categories-page.tsx),
// with no self-service precedent to build against, per the task's scoping.
export default function PrinterSettings() {
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [isWhatsapp, setIsWhatsapp] = useState(user?.isWhatsapp ?? false);
  const [profileImageUrl, setProfileImageUrl] = useState(user?.profileImageUrl ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", { name, phone, isWhatsapp, profileImageUrl: profileImageUrl.trim() || null });
      await queryClient.invalidateQueries({ queryKey: [api.auth.me.path] });
      toast({ title: "Sauvegardé", description: "Profil mis à jour." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de sauvegarder.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) return;
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", { password: newPassword, currentPassword });
      setCurrentPassword("");
      setNewPassword("");
      toast({ title: "Mot de passe mis à jour" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message ?? "Mot de passe actuel incorrect.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez votre compte et vos préférences.</p>
      </div>

      <SectionCard title="Compte" icon={User}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nom complet</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-printer-name" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Téléphone</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" data-testid="checkbox-printer-whatsapp" className="w-3.5 h-3.5 rounded border-border/50 accent-primary"
                  checked={isWhatsapp} onChange={(e) => setIsWhatsapp(e.target.checked)} />
                WhatsApp
              </label>
            </div>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-printer-phone" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Photo de profil (URL)</Label>
            <Input type="url" value={profileImageUrl} onChange={(e) => setProfileImageUrl(e.target.value)} placeholder="https://…" data-testid="input-printer-picture" />
          </div>
        </div>
        <Button className="mt-4" onClick={saveProfile} disabled={saving} data-testid="button-save-printer-profile">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </SectionCard>

      <SectionCard title="Localisation" icon={MapPin}>
        <p className="text-sm text-foreground">{user?.locationAddress || "Aucune adresse renseignée."}</p>
        <p className="text-xs text-muted-foreground mt-1.5">La modification de la localisation nécessite un sélecteur de carte, non disponible sur cette page pour le moment. Contactez l'administration pour la mettre à jour.</p>
      </SectionCard>

      {user?.printCategories && user.printCategories.length > 0 && (
        <SectionCard title="Catégories approuvées" icon={Tag}>
          <div className="flex flex-wrap gap-1.5">
            {user.printCategories.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Gérées par l'administration.</p>
        </SectionCard>
      )}

      <SectionCard title="Sécurité" icon={Lock}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Mot de passe actuel</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Nouveau mot de passe</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
        </div>
        <Button className="mt-4" variant="outline" onClick={changePassword} disabled={saving || !currentPassword || !newPassword}>
          Changer le mot de passe
        </Button>
        <Separator className="my-4" />
        <Button variant="ghost" className="text-destructive hover:text-destructive gap-2" onClick={() => logout()} disabled={isLoggingOut}>
          <LogOut className="w-4 h-4" /> Se déconnecter
        </Button>
      </SectionCard>
    </div>
  );
}
