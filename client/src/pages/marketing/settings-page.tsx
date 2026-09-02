import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { User, Lock, LogOut } from "lucide-react";
import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";

// New — Marketing previously had no personal account settings page. Same
// generic profile-update pattern already used by Supplier/Driver/Printer.
export default function MarketingSettingsPage() {
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [profileImageUrl, setProfileImageUrl] = useState(user?.profileImageUrl ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", { name, phone, profileImageUrl: profileImageUrl.trim() || null });
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
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez votre compte et vos préférences de notification.</p>
      </div>

      <SectionCard title="Compte" icon={User}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nom complet</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-marketing-name" />
          </div>
          <div className="space-y-1.5">
            <Label>Téléphone</Label>
            <Input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} data-testid="input-marketing-phone" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Photo de profil (URL)</Label>
            <Input type="url" value={profileImageUrl ?? ""} onChange={(e) => setProfileImageUrl(e.target.value)} placeholder="https://…" data-testid="input-marketing-picture" />
          </div>
        </div>
        <Button className="mt-4" onClick={saveProfile} disabled={saving} data-testid="button-save-marketing-profile">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </SectionCard>

      <NotificationPreferencesCard role="MARKETING" />

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
