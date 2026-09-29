import { forwardRef, useImperativeHandle, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Lock, LogOut } from "lucide-react";
import type { SettingsCardHandle } from "@/components/settings/settings-card-handle";
import { PasswordInputField } from "@/components/settings/password-input-field";

// Unified "Sécurité" section (Part 9) — identical for all seven accounts
// already (password change + logout), just extracted into one shared
// component instead of seven copies. Same generic PATCH /api/auth/me/profile
// (password/currentPassword) and useAuth().logout() every account already used.
//
// Password-change save is exposed imperatively via ref (see
// settings-card-handle.ts) — the page-level unified Save button drives it.
// "Dirty" here means both fields are filled, mirroring the old internal
// button's disabled condition exactly: an incomplete pair is still a silent
// no-op, same as before. The separate "Se déconnecter" button below is
// untouched — it isn't a Save action.
export const AccountSecurityCard = forwardRef<SettingsCardHandle, { testIdPrefix?: string; className?: string }>(
  function AccountSecurityCard({ testIdPrefix = "settings", className }, ref) {
  const { logout, isLoggingOut } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!currentPassword || !newPassword) return;
      setSaving(true);
      try {
        await apiRequest("PATCH", "/api/auth/me/profile", { password: newPassword, currentPassword });
        setCurrentPassword("");
        setNewPassword("");
      } finally {
        setSaving(false);
      }
    },
  }), [currentPassword, newPassword]);

  return (
    <SectionCard title="Sécurité" icon={Lock} className={className}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Mot de passe actuel</Label>
          <PasswordInputField
            value={currentPassword}
            onChange={setCurrentPassword}
            disabled={saving}
            autoComplete="current-password"
            testId={`input-${testIdPrefix}-current-password`}
            toggleTestId={`button-toggle-${testIdPrefix}-current-password`}
            ariaLabel="mot de passe actuel"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Nouveau mot de passe</Label>
          <PasswordInputField
            value={newPassword}
            onChange={setNewPassword}
            disabled={saving}
            autoComplete="new-password"
            testId={`input-${testIdPrefix}-new-password`}
            toggleTestId={`button-toggle-${testIdPrefix}-new-password`}
            ariaLabel="nouveau mot de passe"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Renseignez les deux champs puis utilisez le bouton Enregistrer en haut de page pour changer votre mot de passe.
      </p>
      <Separator className="my-4" />
      <Button variant="ghost" className="text-destructive hover:text-destructive gap-2" onClick={() => logout()} disabled={isLoggingOut} data-testid={`button-${testIdPrefix}-logout`}>
        <LogOut className="w-4 h-4" /> Se déconnecter
      </Button>
    </SectionCard>
  );
});
