import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Lock, LogOut } from "lucide-react";

// Unified "Sécurité" section (Part 9) — identical for all seven accounts
// already (password change + logout), just extracted into one shared
// component instead of seven copies. Same generic PATCH /api/auth/me/profile
// (password/currentPassword) and useAuth().logout() every account already used.
export function AccountSecurityCard({ testIdPrefix = "settings" }: { testIdPrefix?: string }) {
  const { logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

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
    <SectionCard title="Sécurité" icon={Lock}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Mot de passe actuel</Label>
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} data-testid={`input-${testIdPrefix}-current-password`} />
        </div>
        <div className="space-y-1.5">
          <Label>Nouveau mot de passe</Label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} data-testid={`input-${testIdPrefix}-new-password`} />
        </div>
      </div>
      <Button className="mt-4" variant="outline" onClick={changePassword} disabled={saving || !currentPassword || !newPassword} data-testid={`button-${testIdPrefix}-change-password`}>
        Changer le mot de passe
      </Button>
      <Separator className="my-4" />
      <Button variant="ghost" className="text-destructive hover:text-destructive gap-2" onClick={() => logout()} disabled={isLoggingOut} data-testid={`button-${testIdPrefix}-logout`}>
        <LogOut className="w-4 h-4" /> Se déconnecter
      </Button>
    </SectionCard>
  );
}
