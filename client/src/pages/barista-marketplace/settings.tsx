import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { useMyBaristaProfile, useUpdateBaristaProfile } from "@/hooks/use-barista-marketplace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { User, MapPin, Lock, Bell, Settings as SettingsIcon, LogOut } from "lucide-react";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import type { AddressDetails } from "@shared/schema";

// Settings — grouped into: Account information / Location information / Security /
// Notifications / Marketplace visibility. Every section reuses an existing generic
// mechanism (PATCH /api/auth/me/profile, PATCH /api/auth/me/location, the same
// LocationPickerModal used by Admin/Landing) rather than a Barista-specific one —
// mirrors the pattern already proven on Driver Settings (client/src/pages/driver/settings.tsx).
export default function BaristaSettingsPage() {
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = useMyBaristaProfile(user?.id ?? null);
  const updateProfile = useUpdateBaristaProfile();

  // Account information
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [isWhatsapp, setIsWhatsapp] = useState((user as any)?.isWhatsapp ?? false);
  const [profileImageUrl, setProfileImageUrl] = useState((user as any)?.profileImageUrl ?? "");
  const [savingAccount, setSavingAccount] = useState(false);

  // Security
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Location information — the same users.locationAddress/locationLat/locationLng
  // used everywhere else (public profile "Ville", distance calculations, Coffee
  // Owner card view); editing it here keeps every surface synchronized, no
  // second location value.
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  // Notifications — client-side preferences only; no notification-preferences
  // table exists in the schema (same honest limitation already documented on
  // Driver Settings), so these are not claimed to persist server-side.
  const [notifs, setNotifs] = useState({ requests: true, missions: true, messages: true, academy: true });

  // Marketplace visibility — existing field, kept exactly as before.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setIsWhatsapp((user as any).isWhatsapp ?? false);
    setProfileImageUrl((user as any).profileImageUrl ?? "");
  }, [user?.id]);

  useEffect(() => {
    if (data?.profile) setVisible(data.profile.marketplaceVisible);
  }, [data?.profile?.updatedAt]);

  const saveAccount = async () => {
    setSavingAccount(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", { name, phone, isWhatsapp, profileImageUrl: profileImageUrl.trim() || null });
      await queryClient.invalidateQueries({ queryKey: [api.auth.me.path] });
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
      setCurrentPassword("");
      setNewPassword("");
      toast({ title: "Mot de passe mis à jour" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message ?? "Mot de passe actuel incorrect.", variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLocationConfirm = async (loc: PickedLocation) => {
    try {
      await apiRequest("PATCH", "/api/auth/me/location", loc);
      await queryClient.invalidateQueries({ queryKey: [api.auth.me.path] });
      await queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/barista/profile") });
      setLocationModalOpen(false);
      toast({ title: "📍 Adresse mise à jour" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message ?? "Impossible de mettre à jour l'adresse.", variant: "destructive" });
    }
  };

  const handleToggleVisible = (value: boolean) => {
    setVisible(value);
    updateProfile.mutate(
      { marketplaceVisible: value },
      {
        onSuccess: () => toast({ title: value ? "Profil visible sur la marketplace" : "Profil masqué de la marketplace" }),
        onError: (err: Error) => {
          setVisible(!value);
          toast({ title: "Erreur", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez votre compte, votre localisation et votre visibilité sur la marketplace.</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="w-4 h-4 text-green-600" /> Informations du compte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nom complet</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-settings-name" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Téléphone</Label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" data-testid="checkbox-settings-whatsapp" className="w-3.5 h-3.5 rounded border-border/50 accent-primary"
                    checked={isWhatsapp} onChange={(e) => setIsWhatsapp(e.target.checked)} />
                  WhatsApp
                </label>
              </div>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-settings-phone" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Photo de profil (URL)</Label>
              <Input type="url" value={profileImageUrl} onChange={(e) => setProfileImageUrl(e.target.value)} placeholder="https://…" data-testid="input-settings-picture" />
            </div>
          </div>
          <Button onClick={saveAccount} disabled={savingAccount} className="bg-green-600 hover:bg-green-700 text-white" data-testid="button-save-settings-account">
            {savingAccount ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-green-600" /> Localisation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-foreground">{user?.locationAddress || "Aucune adresse enregistrée."}</p>
          <p className="text-xs text-muted-foreground">
            Cette adresse est utilisée comme "Ville" sur votre profil public et pour calculer la distance affichée aux cafés.
          </p>
          <Button variant="outline" onClick={() => setLocationModalOpen(true)} data-testid="button-edit-settings-location">
            {user?.locationAddress ? "Modifier l'adresse" : "Ajouter une adresse"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Lock className="w-4 h-4 text-green-600" /> Sécurité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mot de passe actuel</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} data-testid="input-settings-current-password" />
            </div>
            <div className="space-y-1.5">
              <Label>Nouveau mot de passe</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} data-testid="input-settings-new-password" />
            </div>
          </div>
          <Button variant="outline" onClick={changePassword} disabled={savingPassword || !currentPassword || !newPassword} data-testid="button-change-settings-password">
            Changer le mot de passe
          </Button>
          <Separator />
          <Button variant="ghost" className="text-destructive hover:text-destructive gap-2" onClick={() => logout()} disabled={isLoggingOut}>
            <LogOut className="w-4 h-4" /> Se déconnecter
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4 text-green-600" /> Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: "requests" as const, label: "Nouvelles demandes" },
            { key: "missions" as const, label: "Missions" },
            { key: "messages" as const, label: "Messages" },
            { key: "academy" as const, label: "Academy" },
          ].map((n) => (
            <div key={n.key} className="flex items-center justify-between py-1">
              <span className="text-sm text-foreground">{n.label}</span>
              <Switch checked={notifs[n.key]} onCheckedChange={(v) => setNotifs((p) => ({ ...p, [n.key]: v }))} data-testid={`switch-settings-notif-${n.key}`} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-green-600" /> Visibilité marketplace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Afficher mon profil sur la marketplace</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Lorsque désactivé, les cafés ne peuvent plus vous trouver ni vous envoyer de nouvelles demandes.
              </p>
            </div>
            <Switch checked={visible} onCheckedChange={handleToggleVisible} disabled={updateProfile.isPending} data-testid="switch-settings-visible" />
          </div>
        </CardContent>
      </Card>

      <LocationPickerModal
        open={locationModalOpen}
        mode="account"
        title="Choisissez votre adresse"
        initialAddress={user?.locationAddress ?? undefined}
        initialDetails={(user as any)?.locationDetails as AddressDetails | undefined}
        onClose={() => setLocationModalOpen(false)}
        onConfirm={handleLocationConfirm}
      />
    </div>
  );
}
