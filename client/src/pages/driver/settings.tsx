import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { User, Bell, Lock, LogOut } from "lucide-react";
import { SectionCard } from "@/components/dashboard/dashboard-kit";

// "Paramètres" — reuses the app's existing generic profile-update endpoint (PATCH
// /api/auth/me/profile, already used by Supplier/Maintenance settings pages) rather than
// introducing a Driver-specific one. Notification toggles are local/client-side preferences
// only, matching the same convention already used on the Coffee Owner account settings tab
// (components/cafe/marketplace-layout.tsx) — there is no notification-preferences table in
// the schema to persist them to, so this does not pretend to save them server-side.
export default function DriverSettingsPage() {
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [isWhatsapp, setIsWhatsapp] = useState((user as any)?.isWhatsapp ?? false);
  const [profileImageUrl, setProfileImageUrl] = useState((user as any)?.profileImageUrl ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [notifs, setNotifs] = useState({ deliveries: true, messages: true, assignments: true, payments: true });

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez votre compte et vos préférences.</p>
      </div>

      <SectionCard title="Compte" icon={User}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nom complet</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-driver-name" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Téléphone</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" data-testid="checkbox-driver-whatsapp" className="w-3.5 h-3.5 rounded border-border/50 accent-primary"
                  checked={isWhatsapp} onChange={(e) => setIsWhatsapp(e.target.checked)} />
                WhatsApp
              </label>
            </div>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-driver-phone" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Photo de profil (URL)</Label>
            <Input type="url" value={profileImageUrl} onChange={(e) => setProfileImageUrl(e.target.value)} placeholder="https://…" data-testid="input-driver-picture" />
          </div>
        </div>
        <Button className="mt-4" onClick={saveProfile} disabled={saving} data-testid="button-save-driver-profile">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </SectionCard>

      <SectionCard title="Notifications" icon={Bell}>
        <div className="space-y-3">
          {[
            { key: "deliveries" as const, label: "Livraisons" },
            { key: "assignments" as const, label: "Nouvelles affectations" },
            { key: "messages" as const, label: "Messages" },
            { key: "payments" as const, label: "Paiements" },
          ].map((n) => (
            <div key={n.key} className="flex items-center justify-between py-1">
              <span className="text-sm text-foreground">{n.label}</span>
              <Switch checked={notifs[n.key]} onCheckedChange={(v) => setNotifs((p) => ({ ...p, [n.key]: v }))} />
            </div>
          ))}
        </div>
      </SectionCard>

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
