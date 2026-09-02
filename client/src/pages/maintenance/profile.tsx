import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/use-currency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAvatarUrl } from "@/lib/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Award, Wrench, MapPin, XCircle, X } from "lucide-react";

// ── Profile tab ────────────────────────────────────────────────────────────────

export default function Profile() {
  const { user } = useAuth();
  const currency = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profileData } = useQuery<{ user: any; profile: any }>({
    queryKey: ["/api/maintenance/profile", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/maintenance/profile/${user!.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load profile");
      return response.json();
    },
    enabled: !!user?.id,
  });
  const { data: taxonomy } = useQuery<{ competencies: { name: string }[]; zones: { name: string }[] }>({
    queryKey: ["/api/maintenance/taxonomy"],
  });
  const maintenanceSpecialties = taxonomy?.competencies.map((item) => item.name) ?? [];
  const coverageAreas = taxonomy?.zones.map((item) => item.name) ?? [];

  // Profile state
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [jobTitle, setJobTitle] = useState("Technicien de maintenance");
  const [bio, setBio] = useState("");
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [agentType, setAgentType] = useState("Freelance");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [dailyRate, setDailyRate] = useState("0");
  const [responseTime, setResponseTime] = useState("< 2h");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [yearsExperience, setYearsExperience] = useState("0");
  const [certificationDraft, setCertificationDraft] = useState("");
  const [portfolioDraft, setPortfolioDraft] = useState("");

  useEffect(() => {
    if (!profileData) return;
    const p = profileData.profile;
    setProfileName(profileData.user?.name ?? user?.name ?? "");
    setPhone(profileData.user?.phone ?? user?.phone ?? "");
    setJobTitle(p.jobTitle);
    setBio(p.description);
    setSelectedSpecialties(p.skills ?? []);
    setSelectedAreas(p.coverageArea ? p.coverageArea.split(",").map((v: string) => v.trim()).filter(Boolean) : []);
    setAgentType(p.profileType);
    setDailyRate(String((p.dailyRateInCents ?? 0) / 100));
    setResponseTime(p.responseTime);
    setCertifications(p.certifications ?? []);
    setPortfolioImages(p.portfolioImages ?? []);
    setYearsExperience(String(p.yearsExperience ?? 0));
  }, [profileData, user?.name, user?.phone]);

  const saveProfile = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/maintenance/profile", {
      jobTitle, profileType: agentType, skills: selectedSpecialties,
      categories: selectedSpecialties, description: bio,
      coverageArea: selectedAreas.join(", "), dailyRateInCents: Math.round((parseFloat(dailyRate) || 0) * 100),
      responseTime,
      certifications, portfolioImages,
      yearsExperience: Math.max(0, parseInt(yearsExperience, 10) || 0),
    }),
    onSuccess: async () => {
      if (profileName !== user?.name || phone !== user?.phone) {
        await apiRequest("PATCH", "/api/auth/me/profile", { name: profileName, phone });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/profile", user?.id] });
      toast({ title: "Profil sauvegardé" });
    },
    onError: (error: Error) => toast({ title: "Impossible de sauvegarder le profil", description: error.message, variant: "destructive" }),
  });

  const toggleSpecialty = (s: string) => {
    setSelectedSpecialties((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };
  const toggleArea = (a: string) => {
    setSelectedAreas((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  };

  return (
    <div className="space-y-4">
      {/* Basic info */}
      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><User className="w-4 h-4 text-orange-500" />Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={getAvatarUrl(user)} alt={profileName || "Maintenance"} />
              <AvatarFallback className="bg-orange-100 text-orange-700 font-bold text-xl">
                {profileName.charAt(0)?.toUpperCase() ?? "M"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <div>
                <Label className="text-xs text-gray-500">Nom / Structure</Label>
                <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="h-9 rounded-xl mt-0.5" />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Titre du poste</Label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="h-9 rounded-xl mt-0.5" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">Téléphone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 rounded-xl mt-0.5" placeholder="+216..." />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Type</Label>
              <Select value={agentType} onValueChange={setAgentType}>
                <SelectTrigger className="h-9 rounded-xl mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Freelance">Freelance</SelectItem>
                  <SelectItem value="Company">Entreprise</SelectItem>
                  <SelectItem value="Agency">Agence</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">Tarif journalier ({currency})</Label>
              <Input value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} type="number" className="h-9 rounded-xl mt-0.5" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Temps de réponse</Label>
              <Select value={responseTime} onValueChange={setResponseTime}>
                <SelectTrigger className="h-9 rounded-xl mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="< 1h">Moins de 1h</SelectItem>
                  <SelectItem value="< 2h">Moins de 2h</SelectItem>
                  <SelectItem value="< 4h">Moins de 4h</SelectItem>
                  <SelectItem value="< 24h">Moins de 24h</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Biographie</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} className="rounded-xl mt-0.5 resize-none" rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Certifications, portfolio and experience use the shared marketplace profile. */}
      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Award className="w-4 h-4 text-orange-500" />Certifications & expérience</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-gray-500">Certifications</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={certificationDraft}
                onChange={(event) => setCertificationDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && certificationDraft.trim()) {
                    event.preventDefault();
                    setCertifications((current) => [...current, certificationDraft.trim()]);
                    setCertificationDraft("");
                  }
                }}
                placeholder="Ex. Certification SCA"
                className="h-9 rounded-xl"
              />
              <Button type="button" variant="outline" className="h-9 rounded-xl shrink-0" disabled={!certificationDraft.trim()} onClick={() => {
                setCertifications((current) => [...current, certificationDraft.trim()]);
                setCertificationDraft("");
              }}>Ajouter</Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {certifications.map((certification, index) => (
                <span key={`${certification}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 text-xs">
                  {certification}
                  <button type="button" aria-label={`Supprimer ${certification}`} onClick={() => setCertifications((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    <XCircle className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Expérience (ans)</Label>
            <Input type="number" min="0" value={yearsExperience} onChange={(event) => setYearsExperience(event.target.value)} className="h-9 rounded-xl mt-1 max-w-[180px]" />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Portfolio (URL des images)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={portfolioDraft}
                onChange={(event) => setPortfolioDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && portfolioDraft.trim()) {
                    event.preventDefault();
                    setPortfolioImages((current) => [...current, portfolioDraft.trim()]);
                    setPortfolioDraft("");
                  }
                }}
                placeholder="https://…"
                className="h-9 rounded-xl"
              />
              <Button type="button" variant="outline" className="h-9 rounded-xl shrink-0" disabled={!portfolioDraft.trim()} onClick={() => {
                setPortfolioImages((current) => [...current, portfolioDraft.trim()]);
                setPortfolioDraft("");
              }}>Ajouter</Button>
            </div>
            {portfolioImages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {portfolioImages.map((image, index) => (
                  <div key={`${image}-${index}`} className="relative group">
                    <img src={image} alt={`Portfolio ${index + 1}`} className="h-24 w-full rounded-xl object-cover bg-gray-100" />
                    <button type="button" aria-label={`Supprimer l'image ${index + 1}`} onClick={() => setPortfolioImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Specialties */}
      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Wrench className="w-4 h-4 text-orange-500" />Spécialités & Compétences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {maintenanceSpecialties.map((s) => (
              <button
                key={s}
                onClick={() => toggleSpecialty(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  selectedSpecialties.includes(s)
                    ? "bg-orange-600 text-white border-orange-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"
                }`}>
                {s}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Coverage area */}
      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-orange-500" />Zone d'intervention</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {coverageAreas.map((a) => (
              <button
                key={a}
                onClick={() => toggleArea(a)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  selectedAreas.includes(a)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}>
                {a}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending} className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-2xl py-5">
        Sauvegarder le profil
      </Button>
    </div>
  );
}
