import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import LocationPickerModal from "@/components/location-picker-modal";
import { User, MapPin, Shield, LogOut, Settings as SettingsIcon } from "lucide-react";

// ── Settings tab (Part 10-11) — same design logic as the Barista Marketplace
// Settings page (client/src/pages/barista-marketplace/settings.tsx), adapted
// to Maintenance: Account info / Location / Security / Notifications /
// Marketplace visibility. Reuses the same generic self-service endpoints
// (PATCH /api/auth/me/profile, PATCH /api/auth/me/location) plus the existing
// PATCH /api/maintenance/profile for marketplaceVisible — no second
// visibility/account system. ─────────────────────────────────────────────────

export default function Settings() {
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Same queryKey/queryFn as profile.tsx/availability.tsx — React Query dedupes
  // this to a single request/cache entry across whichever of these tabs are
  // mounted, so fetching it here too is not a duplicated network call.
  const { data: profileData } = useQuery<{ user: any; profile: any }>({
    queryKey: ["/api/maintenance/profile", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/maintenance/profile/${user!.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load profile");
      return response.json();
    },
    enabled: !!user?.id,
  });
  const profile = profileData?.profile;

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [profileImageUrl, setProfileImageUrl] = useState((user as any)?.profileImageUrl ?? "");
  const [savingAccount, setSavingAccount] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [visible, setVisible] = useState(profile?.marketplaceVisible ?? true);
  const [savingVisibility, setSavingVisibility] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setProfileImageUrl((user as any).profileImageUrl ?? "");
  }, [user?.id]);
  useEffect(() => {
    if (profile) setVisible(profile.marketplaceVisible);
  }, [profile?.updatedAt]);

  const saveAccount = async () => {
    setSavingAccount(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", { name, phone, profileImageUrl: profileImageUrl.trim() || null });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Informations mises à jour" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message ?? "Impossible de sauvegarder.", variant: "destructive" });
    } finally {
      setSavingAccount(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) return;
    setSavingPassword(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", { password: newPassword, currentPassword });
      setCurrentPassword(""); setNewPassword("");
      toast({ title: "Mot de passe mis à jour" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message ?? "Mot de passe actuel incorrect.", variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLocationConfirm = async (loc: any) => {
    try {
      await apiRequest("PATCH", "/api/auth/me/location", loc);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/maintenance/profile", user?.id] });
      setLocationModalOpen(false);
      toast({ title: "📍 Adresse mise à jour" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message ?? "Impossible de mettre à jour l'adresse.", variant: "destructive" });
    }
  };

  const handleToggleVisible = async (value: boolean) => {
    setVisible(value);
    setSavingVisibility(true);
    try {
      await apiRequest("PATCH", "/api/maintenance/profile", { marketplaceVisible: value });
      await queryClient.invalidateQueries({ queryKey: ["/api/maintenance/profile", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/maintenance/profiles"] });
      toast({ title: value ? "Profil visible sur la marketplace" : "Profil masqué de la marketplace" });
    } catch (err: any) {
      setVisible(!value);
      toast({ title: "Erreur", description: err?.message, variant: "destructive" });
    } finally {
      setSavingVisibility(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><User className="w-4 h-4 text-orange-500" />Informations du compte</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label className="text-xs text-gray-500">Nom / Structure</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 rounded-xl mt-0.5" data-testid="input-settings-name" /></div>
            <div><Label className="text-xs text-gray-500">Téléphone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 rounded-xl mt-0.5" data-testid="input-settings-phone" /></div>
            <div className="sm:col-span-2"><Label className="text-xs text-gray-500">Email</Label><Input value={user?.email ?? ""} disabled className="h-9 rounded-xl mt-0.5" /></div>
            <div className="sm:col-span-2"><Label className="text-xs text-gray-500">Photo de profil (URL)</Label><Input type="url" value={profileImageUrl} onChange={(e) => setProfileImageUrl(e.target.value)} placeholder="https://…" className="h-9 rounded-xl mt-0.5" data-testid="input-settings-picture" /></div>
          </div>
          <Button onClick={saveAccount} disabled={savingAccount} className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl" data-testid="button-save-settings-account">
            {savingAccount ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-orange-500" />Localisation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{user?.locationAddress || "Aucune adresse enregistrée."}</p>
          <p className="text-xs text-gray-500">Cette adresse détermine votre disponibilité, votre position sur la marketplace, la distance affichée aux cafés, et l'itinéraire GO vers vos interventions.</p>
          <Button variant="outline" onClick={() => setLocationModalOpen(true)} className="rounded-xl" data-testid="button-edit-settings-location">
            {user?.locationAddress ? "Modifier l'adresse" : "Ajouter une adresse"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Shield className="w-4 h-4 text-orange-500" />Sécurité</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label className="text-xs text-gray-500">Mot de passe actuel</Label><Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="h-9 rounded-xl mt-0.5" /></div>
            <div><Label className="text-xs text-gray-500">Nouveau mot de passe</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-9 rounded-xl mt-0.5" /></div>
          </div>
          <Button variant="outline" onClick={changePassword} disabled={savingPassword || !currentPassword || !newPassword} className="rounded-xl">Changer le mot de passe</Button>
          <div className="border-t border-gray-100 pt-3">
            <Button variant="ghost" className="text-destructive hover:text-destructive gap-2" onClick={() => logout()} disabled={isLoggingOut}><LogOut className="w-4 h-4" />Se déconnecter</Button>
          </div>
        </CardContent>
      </Card>

      <NotificationPreferencesCard role="MAINTENANCE" />

      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><SettingsIcon className="w-4 h-4 text-orange-500" />Visibilité marketplace</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium">Afficher mon profil sur la marketplace</p><p className="text-xs text-gray-500 mt-0.5">Lorsque désactivé, les cafés ne peuvent plus vous trouver ni réserver.</p></div>
            <Switch checked={visible} onCheckedChange={handleToggleVisible} disabled={savingVisibility} data-testid="switch-settings-visible" />
          </div>
        </CardContent>
      </Card>

      <LocationPickerModal
        open={locationModalOpen}
        mode="account"
        title="Choisissez votre adresse"
        initialAddress={user?.locationAddress ?? undefined}
        onClose={() => setLocationModalOpen(false)}
        onConfirm={handleLocationConfirm}
      />
    </div>
  );
}
