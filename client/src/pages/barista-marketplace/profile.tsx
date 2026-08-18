import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import {
  useMyBaristaProfile,
  useUpdateBaristaProfile,
  useUpdateBaristaAvailability,
  useBaristaSkills,
  type BaristaLevel,
} from "@/hooks/use-barista-marketplace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, UserCheck, Eye, EyeOff } from "lucide-react";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const LEVEL_LABELS: Record<BaristaLevel, string> = { BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert" };

export default function BaristaProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const { data, isLoading } = useMyBaristaProfile(user?.id ?? null);
  const { data: skillOptions = [] } = useBaristaSkills();
  const updateProfile = useUpdateBaristaProfile();
  const updateAvailability = useUpdateBaristaAvailability();

  const [level, setLevel] = useState<BaristaLevel>("BEGINNER");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [rate, setRate] = useState("");
  const [city, setCity] = useState("");
  const [visible, setVisible] = useState(true);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [onVacation, setOnVacation] = useState(false);

  useEffect(() => {
    if (!data?.profile) return;
    setLevel(data.profile.level);
    setBio(data.profile.bio ?? "");
    setSkills(data.profile.skills ?? []);
    setRate(String((data.profile.dailyRateInCents ?? 0) / 100));
    setCity(data.profile.city ?? "");
    setVisible(data.profile.marketplaceVisible);
    setAvailableDays(data.profile.availableDays ?? []);
    setOnVacation(data.profile.isOnVacation);
  }, [data?.profile?.updatedAt]);

  const toggleSkill = (name: string) => {
    setSkills((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
  };
  const toggleDay = (day: string) => {
    setAvailableDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const saveProfile = () => {
    updateProfile.mutate(
      { level, bio, skills, dailyRateInCents: Math.round(parseFloat(rate || "0") * 100), city, marketplaceVisible: visible },
      {
        onSuccess: () => toast({ title: "Profil mis à jour" }),
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  const saveAvailability = () => {
    updateAvailability.mutate(
      { availableDays, isOnVacation: onVacation, isAvailable: !onVacation },
      {
        onSuccess: () => toast({ title: "Disponibilité mise à jour" }),
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mon profil public</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Ce profil est visible par les cafés sur la marketplace Barista.</p>
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-green-600" /> Informations
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {visible ? <Eye className="w-3.5 h-3.5 text-green-600" /> : <EyeOff className="w-3.5 h-3.5" />}
            {visible ? "Visible sur la marketplace" : "Masqué de la marketplace"}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Niveau</label>
              <Select value={level} onValueChange={(v) => setLevel(v as BaristaLevel)}>
                <SelectTrigger data-testid="select-profile-level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["BEGINNER", "ADVANCED", "EXPERT"] as const).map((l) => (
                    <SelectItem key={l} value={l}>{LEVEL_LABELS[l]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ville</label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Tunis" data-testid="input-profile-city" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Tarif journalier</label>
            <Input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} data-testid="input-profile-rate" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Bio</label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="Présentez votre expérience et votre spécialité..." data-testid="input-profile-bio" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Compétences</label>
            <div className="flex flex-wrap gap-1.5">
              {skillOptions.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => toggleSkill(skill.name)}
                  data-testid={`chip-skill-${skill.id}`}
                >
                  <Badge
                    variant={skills.includes(skill.name) ? "default" : "outline"}
                    className={skills.includes(skill.name) ? "bg-green-600 hover:bg-green-700 cursor-pointer" : "cursor-pointer"}
                  >
                    {skill.name}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div>
              <p className="text-sm font-medium">Visible sur la marketplace</p>
              <p className="text-xs text-muted-foreground">Désactivez pour vous masquer temporairement des recherches.</p>
            </div>
            <Switch checked={visible} onCheckedChange={setVisible} data-testid="switch-profile-visible" />
          </div>

          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={updateProfile.isPending} className="bg-green-600 hover:bg-green-700 text-white" data-testid="button-save-profile">
              {updateProfile.isPending ? "Enregistrement…" : "Enregistrer le profil"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Disponibilité</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Jours disponibles</label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((day) => (
                <button key={day} type="button" onClick={() => toggleDay(day)} data-testid={`chip-day-${day}`}>
                  <Badge
                    variant={availableDays.includes(day) ? "default" : "outline"}
                    className={availableDays.includes(day) ? "bg-blue-600 hover:bg-blue-700 cursor-pointer" : "cursor-pointer"}
                  >
                    {day}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div>
              <p className="text-sm font-medium">En vacances / indisponible</p>
              <p className="text-xs text-muted-foreground">Vous n'apparaîtrez plus comme disponible aux cafés.</p>
            </div>
            <Switch checked={onVacation} onCheckedChange={setOnVacation} data-testid="switch-profile-vacation" />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveAvailability} disabled={updateAvailability.isPending} variant="outline" data-testid="button-save-availability">
              {updateAvailability.isPending ? "Enregistrement…" : "Enregistrer la disponibilité"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
