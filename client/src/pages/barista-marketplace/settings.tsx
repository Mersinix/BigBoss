import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useMyBaristaProfile, useUpdateBaristaProfile } from "@/hooks/use-barista-marketplace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings as SettingsIcon } from "lucide-react";

export default function BaristaSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = useMyBaristaProfile(user?.id ?? null);
  const updateProfile = useUpdateBaristaProfile();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (data?.profile) setVisible(data.profile.marketplaceVisible);
  }, [data?.profile?.updatedAt]);

  const handleToggle = (value: boolean) => {
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
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez la visibilité de votre compte Barista Marketplace.</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-muted-foreground" /> Visibilité
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
            <Switch checked={visible} onCheckedChange={handleToggle} disabled={updateProfile.isPending} data-testid="switch-settings-visible" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
