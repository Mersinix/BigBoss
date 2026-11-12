import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Bell, Lock, LogOut, Save, RefreshCw } from "lucide-react";
import { DashboardHero, SectionCard } from "@/components/dashboard/dashboard-kit";
import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { PasswordInputField } from "@/components/settings/password-input-field";

type Section = "compte" | "notifications" | "securite";

// Admin previously had no personal account settings page (System Management is platform
// config, not this). Same generic profile-update pattern already used by Supplier/Driver/
// Printer/Academy settings. Reorganized (task: "Admin & Supplier Settings — Section
// Switchers, Unified Save Actions") into a Compte/Notifications/Sécurité switcher with one
// main Enregistrer button in the header, scoped to the active section.
export default function AdminSettingsPage() {
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const [section, setSection] = useState<Section>("compte");
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [profileImageUrl, setProfileImageUrl] = useState(user?.profileImageUrl ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState((user as any)?.coverImageUrl ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", { name, phone, profileImageUrl: profileImageUrl.trim() || null, coverImageUrl: coverImageUrl.trim() || null });
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

  // Notifications (immediate per-toggle save) and Sécurité (its own independent "Changer le
  // mot de passe" action) have nothing for a general save button to do — hidden rather than
  // shown as a no-op (task: "do not introduce duplicate save operations").
  const showMainSave = section === "compte";

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Paramètres"
        subtitle="Gérez votre compte et vos préférences de notification."
        action={showMainSave && (
          <Button onClick={saveProfile} disabled={saving} data-testid="button-save-admin-profile" className="gap-2">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        )}
      />

      <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
        <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          <TabsList className="flex items-center justify-start gap-1 bg-secondary/40 rounded-xl p-1 h-auto w-max min-w-full sm:w-fit">
            <TabsTrigger value="compte" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground" data-testid="tab-settings-compte"><User className="w-3.5 h-3.5 mr-1.5" />Compte</TabsTrigger>
            <TabsTrigger value="notifications" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground" data-testid="tab-settings-notifications"><Bell className="w-3.5 h-3.5 mr-1.5" />Notifications</TabsTrigger>
            <TabsTrigger value="securite" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground" data-testid="tab-settings-securite"><Lock className="w-3.5 h-3.5 mr-1.5" />Sécurité</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {section === "compte" && (
        <SectionCard title="Compte" icon={User}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nom complet</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-admin-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Téléphone</Label>
              <Input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} data-testid="input-admin-phone" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Photo de profil (URL)</Label>
              <Input type="url" value={profileImageUrl ?? ""} onChange={(e) => setProfileImageUrl(e.target.value)} placeholder="https://…" data-testid="input-admin-picture" />
            </div>
            <div className="space-y-1.5">
              <Label>Cover (URL)</Label>
              <Input type="url" value={coverImageUrl ?? ""} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://…" data-testid="input-admin-cover" />
            </div>
          </div>
        </SectionCard>
      )}

      {section === "notifications" && <NotificationPreferencesCard role={user?.role ?? "ADMIN"} />}

      {section === "securite" && (
        <SectionCard title="Sécurité" icon={Lock}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mot de passe actuel</Label>
              <PasswordInputField
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
                testId="input-admin-current-password"
                toggleTestId="button-toggle-admin-current-password"
                ariaLabel="mot de passe actuel"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nouveau mot de passe</Label>
              <PasswordInputField
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                testId="input-admin-new-password"
                toggleTestId="button-toggle-admin-new-password"
                ariaLabel="nouveau mot de passe"
              />
            </div>
          </div>
          <Button className="mt-4" variant="outline" onClick={changePassword} disabled={saving || !currentPassword || !newPassword}>
            Changer le mot de passe
          </Button>
          <Separator className="my-4" />
          <Button variant="outline" className="text-destructive hover:text-destructive gap-2" onClick={() => logout()} disabled={isLoggingOut}>
            <LogOut className="w-4 h-4" /> Se déconnecter
          </Button>
        </SectionCard>
      )}
    </div>
  );
}
