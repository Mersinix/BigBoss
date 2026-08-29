import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useMyAcademyProfile, useUpdateAcademyProfile } from "@/hooks/use-barista-academy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings as SettingsIcon, Mail, Phone, MapPin } from "lucide-react";

// Public identity fields (name, contact, logo, location) live on the shared
// users table — same canonical source every other role uses — and are edited
// via the existing Account/profile flow, not duplicated here (mirrors
// barista-marketplace/settings.tsx's own scope: this page only owns what the
// generic users table has no place for). Changing them there propagates
// automatically everywhere Academy identity is shown, with no disconnected copy.
export default function AcademySettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = useMyAcademyProfile(user?.id ?? null);
  const updateProfile = useUpdateAcademyProfile();
  const [description, setDescription] = useState("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (data?.profile) {
      setDescription(data.profile.description ?? "");
      setVisible(data.profile.marketplaceVisible);
    }
  }, [data?.profile?.updatedAt]);

  const saveDescription = () => {
    updateProfile.mutate(
      { description },
      {
        onSuccess: () => toast({ title: "Description mise à jour" }),
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      },
    );
  };

  const handleToggle = (value: boolean) => {
    setVisible(value);
    updateProfile.mutate(
      { marketplaceVisible: value },
      {
        onSuccess: () => toast({ title: value ? "Académie visible sur la marketplace" : "Académie masquée de la marketplace" }),
        onError: (err: Error) => {
          setVisible(!value);
          toast({ title: "Erreur", description: err.message, variant: "destructive" });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez la présentation et la visibilité de votre académie.</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-muted-foreground" /> Identité publique
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 shrink-0" />{user?.email}</p>
            {user?.phone && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 shrink-0" />{user.phone}</p>}
            {(user as any)?.locationAddress && <p className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 shrink-0" />{(user as any).locationAddress}</p>}
          </div>
          <p className="text-xs text-muted-foreground">Nom, contact, photo et localisation se modifient depuis votre compte — ils sont automatiquement répercutés partout où votre académie apparaît (Coffee Owner, /academy, Admin).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Description</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Présentez votre académie, votre expérience, vos spécialités…" data-testid="input-academy-description" />
          <div className="flex justify-end">
            <Button onClick={saveDescription} disabled={updateProfile.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="button-save-description">
              {updateProfile.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Visibilité</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Afficher mon académie sur /academy</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Lorsque désactivé, vos formations publiées ne sont plus visibles par les Coffee Owners.
              </p>
            </div>
            <Switch checked={visible} onCheckedChange={handleToggle} disabled={updateProfile.isPending} data-testid="switch-settings-visible" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
