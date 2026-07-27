import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wrench,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  RotateCcw,
  User,
  MapPin,
  Phone,
  Star,
  Award,
  Shield,
  Zap,
  Settings,
  ClipboardList,
  BarChart3,
  AlertCircle,
} from "lucide-react";

// ── Static / fake data ────────────────────────────────────────────────────────

const FAKE_RESERVATIONS = [
  {
    id: 1,
    cafeOwner: "Café des Arts",
    ownerPhone: "+216 71 234 567",
    service: "Réparation machine espresso",
    date: "2026-07-28",
    time: "09:00",
    location: "Tunis, Lac 1",
    description: "Machine DeLonghi en panne — ne chauffe plus. Urgent.",
    status: "PENDING" as const,
    category: "Machines",
  },
  {
    id: 2,
    cafeOwner: "Le Grand Café",
    ownerPhone: "+216 71 345 678",
    service: "Maintenance préventive réfrigérateur",
    date: "2026-07-29",
    time: "14:30",
    location: "Tunis, Centre ville",
    description: "Contrôle annuel du système de réfrigération.",
    status: "CONFIRMED" as const,
    category: "Machines",
  },
  {
    id: 3,
    cafeOwner: "Café Medina",
    ownerPhone: "+216 71 456 789",
    service: "Installation caméras de sécurité",
    date: "2026-07-25",
    time: "10:00",
    location: "Tunis, Médina",
    description: "Installation de 4 caméras IP + configuration NVR.",
    status: "COMPLETED" as const,
    category: "Digital & IT",
  },
  {
    id: 4,
    cafeOwner: "Café Riviera",
    ownerPhone: "+216 71 567 890",
    service: "Réparation système de ventilation",
    date: "2026-08-05",
    time: "08:00",
    location: "La Marsa",
    description: "Ventilation défaillante dans la cuisine. Bruit anormal depuis 2 jours.",
    status: "PENDING" as const,
    category: "Infrastructure",
  },
  {
    id: 5,
    cafeOwner: "Coffee House TN",
    ownerPhone: "+216 71 678 901",
    service: "Remise en état du moulin café",
    date: "2026-07-20",
    time: "11:00",
    location: "Ariana",
    description: "Moulin Mahlkönig EK43 — résidu de café, nettoyage complet.",
    status: "CANCELLED" as const,
    category: "Machines",
  },
];

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  PENDING:   { label: "En attente",  color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  CONFIRMED: { label: "Confirmée",   color: "bg-blue-100 text-blue-800 border-blue-200",       icon: CheckCircle },
  COMPLETED: { label: "Terminée",    color: "bg-green-100 text-green-800 border-green-200",    icon: CheckCircle },
  CANCELLED: { label: "Annulée",     color: "bg-red-100 text-red-800 border-red-200",          icon: XCircle },
  RESCHEDULED: { label: "Reprogrammée", color: "bg-purple-100 text-purple-800 border-purple-200", icon: RotateCcw },
};

const MAINTENANCE_SPECIALTIES = [
  "Machines à café", "Machines espresso", "Moulins à café", "Machines à glace",
  "Réfrigérateurs", "Congélateurs", "Lave-vaisselle", "Fours", "Mixeurs",
  "Électricité", "Plomberie", "Climatisation", "Ventilation",
  "Systèmes POS", "Réseaux WiFi", "Caméras de sécurité", "Téléviseurs",
  "Mobilier", "Éclairage", "Signalétique", "Menuiserie", "Peinture",
];

const COVERAGE_AREAS = [
  "Grand Tunis", "Ariana", "Ben Arous", "La Manouba",
  "Sfax", "Sousse", "Monastir", "Mahdia",
  "Béja", "Bizerte", "Gabès", "Jendouba",
];

// ── Today's date helpers ──────────────────────────────────────────────────────

const TODAY = "2026-07-27";

function getTab(date: string): "today" | "upcoming" | "past" {
  if (date === TODAY) return "today";
  if (date > TODAY) return "upcoming";
  return "past";
}

// ── Reservation Card ──────────────────────────────────────────────────────────

function ReservationCard({ res, onConfirm, onCancel, onReschedule }: {
  res: typeof FAKE_RESERVATIONS[0];
  onConfirm: (id: number) => void;
  onCancel: (id: number) => void;
  onReschedule: (id: number) => void;
}) {
  const meta = STATUS_META[res.status] ?? STATUS_META.PENDING;
  const Icon = meta.icon;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-sm">{res.cafeOwner}</p>
          <p className="text-xs text-gray-500 mt-0.5">{res.service}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-xl border ${meta.color}`}>
          <Icon className="w-3 h-3" />{meta.label}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-orange-500" />{res.date} à {res.time}</span>
        <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-orange-500" />{res.location}</span>
        <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-orange-500" />{res.ownerPhone}</span>
      </div>
      <p className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2 leading-relaxed">{res.description}</p>
      <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-200 bg-orange-50">{res.category}</Badge>
      {res.status === "PENDING" && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white rounded-xl" onClick={() => onConfirm(res.id)}>
            <CheckCircle className="w-3 h-3 mr-1" /> Confirmer
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs border-purple-200 text-purple-600 hover:bg-purple-50 rounded-xl" onClick={() => onReschedule(res.id)}>
            <RotateCcw className="w-3 h-3 mr-1" /> Reprogrammer
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs border-red-200 text-red-500 hover:bg-red-50 rounded-xl px-2" onClick={() => onCancel(res.id)}>
            <XCircle className="w-3 h-3" />
          </Button>
        </div>
      )}
      {res.status === "CONFIRMED" && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
            <CheckCircle className="w-3 h-3 mr-1" /> Marquer terminée
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function MaintenanceDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"planning" | "profile" | "availability">("planning");
  const [planTab, setPlanTab] = useState<"today" | "upcoming" | "past">("upcoming");
  const [reservations, setReservations] = useState(FAKE_RESERVATIONS);

  // Profile state
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [jobTitle, setJobTitle] = useState("Technicien de maintenance");
  const [bio, setBio] = useState("Spécialiste en maintenance d'équipements de café professionnels avec plus de 8 ans d'expérience.");
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>(["Machines à café", "Machines espresso", "Moulins à café"]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>(["Grand Tunis"]);
  const [agentType, setAgentType] = useState("Freelance");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [dailyRate, setDailyRate] = useState("200");
  const [responseTime, setResponseTime] = useState("< 2h");

  // Availability state
  const [workingDays, setWorkingDays] = useState<string[]>(["Lun", "Mar", "Mer", "Jeu", "Ven"]);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [isOnVacation, setIsOnVacation] = useState(false);

  const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  const filtered = reservations.filter((r) => getTab(r.date) === planTab);
  const todayCount = reservations.filter((r) => getTab(r.date) === "today").length;
  const upcomingCount = reservations.filter((r) => getTab(r.date) === "upcoming").length;
  const pendingCount = reservations.filter((r) => r.status === "PENDING").length;

  const handleConfirm = (id: number) => {
    setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: "CONFIRMED" as const } : r));
  };
  const handleCancel = (id: number) => {
    setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: "CANCELLED" as const } : r));
  };
  const handleReschedule = (id: number) => {
    setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: "RESCHEDULED" as const } : r));
  };

  const toggleSpecialty = (s: string) => {
    setSelectedSpecialties((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };
  const toggleArea = (a: string) => {
    setSelectedAreas((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  };
  const toggleDay = (d: string) => {
    setWorkingDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  };

  const tabs = [
    { key: "planning" as const, label: "Planning", icon: ClipboardList },
    { key: "profile" as const, label: "Mon Profil", icon: User },
    { key: "availability" as const, label: "Disponibilité", icon: Calendar },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-600 px-4 py-5 md:py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg">Espace Maintenance</h1>
              <p className="text-orange-100 text-xs">{user?.name}</p>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: "Aujourd'hui", value: todayCount, icon: Calendar, color: "text-amber-200" },
              { label: "À venir", value: upcomingCount, icon: Clock, color: "text-blue-200" },
              { label: "En attente", value: pendingCount, icon: AlertCircle, color: "text-red-200" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white/10 rounded-2xl p-3 text-center backdrop-blur-sm">
                <kpi.icon className={`w-4 h-4 mx-auto mb-1 ${kpi.color}`} />
                <p className="font-bold text-white text-xl">{kpi.value}</p>
                <p className="text-orange-100 text-[11px]">{kpi.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex gap-0">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-orange-600 text-orange-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                <tab.icon className="w-4 h-4" />{tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* ── PLANNING ── */}
        {activeTab === "planning" && (
          <>
            {/* Sub-tabs */}
            <div className="flex gap-2 bg-gray-100 rounded-2xl p-1">
              {(["today", "upcoming", "past"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPlanTab(tab)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all ${
                    planTab === tab ? "bg-white text-orange-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}>
                  {tab === "today" ? "Aujourd'hui" : tab === "upcoming" ? "À venir" : "Passées"}
                  <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${planTab === tab ? "bg-orange-100 text-orange-600" : "bg-gray-200 text-gray-500"}`}>
                    {reservations.filter((r) => getTab(r.date) === tab).length}
                  </span>
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="font-medium text-gray-600">Aucune réservation</p>
                <p className="text-sm text-gray-400 mt-1">Pas de réservation pour cette période.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((res) => (
                  <ReservationCard
                    key={res.id}
                    res={res}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                    onReschedule={handleReschedule}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── PROFILE ── */}
        {activeTab === "profile" && (
          <div className="space-y-4">
            {/* Basic info */}
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><User className="w-4 h-4 text-orange-500" />Informations personnelles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16">
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
                    <Label className="text-xs text-gray-500">Tarif journalier (TND)</Label>
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

            {/* Specialties */}
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><Wrench className="w-4 h-4 text-orange-500" />Spécialités & Compétences</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {MAINTENANCE_SPECIALTIES.map((s) => (
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
                  {COVERAGE_AREAS.map((a) => (
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

            <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-2xl py-5">
              Sauvegarder le profil
            </Button>
          </div>
        )}

        {/* ── AVAILABILITY ── */}
        {activeTab === "availability" && (
          <div className="space-y-4">
            {/* Vacation mode */}
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">Mode Congé / Absence</p>
                    <p className="text-xs text-gray-500 mt-0.5">Masque votre profil et stoppe les nouvelles réservations</p>
                  </div>
                  <button
                    onClick={() => setIsOnVacation((v) => !v)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${isOnVacation ? "bg-orange-500" : "bg-gray-200"}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isOnVacation ? "left-6" : "left-0.5"}`} />
                  </button>
                </div>
                {isOnVacation && (
                  <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Votre profil est masqué. Désactivez le mode congé pour réapparaître dans les résultats.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Working days */}
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-orange-500" />Jours de travail</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map((day) => (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={`w-12 h-12 rounded-2xl text-sm font-semibold transition-all ${
                        workingDays.includes(day)
                          ? "bg-orange-600 text-white shadow-md"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}>
                      {day}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Working hours */}
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-orange-500" />Horaires de travail</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-gray-500">Début</Label>
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-10 rounded-xl mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Fin</Label>
                    <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-10 rounded-xl mt-0.5" />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">Les cafés ne verront que les créneaux disponibles dans ces plages horaires.</p>
              </CardContent>
            </Card>

            {/* Summary */}
            <Card className="rounded-2xl border-gray-100 shadow-sm bg-gradient-to-br from-orange-50 to-amber-50">
              <CardContent className="pt-4">
                <p className="font-semibold text-sm mb-2 text-orange-700 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Résumé de disponibilité</p>
                <p className="text-xs text-gray-600">
                  <strong>Jours :</strong> {workingDays.join(", ") || "Aucun"}<br />
                  <strong>Horaires :</strong> {startTime} – {endTime}<br />
                  <strong>Statut :</strong> {isOnVacation ? "🔴 En congé" : "🟢 Disponible"}
                </p>
              </CardContent>
            </Card>

            <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-2xl py-5">
              Sauvegarder les disponibilités
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
