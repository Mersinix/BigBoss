import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/use-currency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/use-realtime";
import type { ConversationSummary, ConversationMessageRow } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  MessageCircle,
  Send,
  ChevronLeft,
  LogOut,
  Flag,
} from "lucide-react";

type MaintenanceReservationRow = {
  id: number;
  cafeOwner: string;
  ownerPhone: string | null;
  service: string;
  date: string;
  time: string | null;
  location: string;
  description: string;
  status: string;
  category: string;
  urgency?: string;
  contactPhone?: string;
  proposedDate?: string | null;
  proposedTime?: string | null;
};

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  PENDING:   { label: "En attente",  color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  CONFIRMED: { label: "Confirmée",   color: "bg-blue-100 text-blue-800 border-blue-200",       icon: CheckCircle },
  COMPLETED: { label: "Terminée",    color: "bg-green-100 text-green-800 border-green-200",    icon: CheckCircle },
  CANCELLED: { label: "Annulée",     color: "bg-red-100 text-red-800 border-red-200",          icon: XCircle },
  RESCHEDULED: { label: "Reprogrammée", color: "bg-purple-100 text-purple-800 border-purple-200", icon: RotateCcw },
  RESCHEDULE_PENDING: { label: "Modification à confirmer", color: "bg-purple-100 text-purple-800 border-purple-200", icon: RotateCcw },
  RESCHEDULE_REJECTED: { label: "Modification refusée", color: "bg-gray-100 text-gray-700 border-gray-200", icon: XCircle },
};

// ── Today's date helpers ──────────────────────────────────────────────────────

function getToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getTab(date: string): "today" | "upcoming" | "past" {
  const today = getToday();
  if (date === today) return "today";
  if (date > today) return "upcoming";
  return "past";
}

// ── Reservation Card ──────────────────────────────────────────────────────────

function ReservationCard({ res, onConfirm, onCancel, onReschedule, onComplete }: {
  res: MaintenanceReservationRow;
  onConfirm: (id: number) => void;
  onCancel: (id: number) => void;
  onReschedule: (id: number) => void;
  onComplete: (id: number) => void;
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
        <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-orange-500" />{res.contactPhone || res.ownerPhone || "—"}</span>
      </div>
      <p className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2 leading-relaxed">{res.description}</p>
      <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-200 bg-orange-50">{res.category}</Badge>
      {res.urgency && <Badge variant="outline" className={`text-[10px] ml-1 ${res.urgency === "URGENT" ? "text-red-600 border-red-200 bg-red-50" : "text-gray-600"}`}>Urgence: {res.urgency}</Badge>}
      {res.status === "RESCHEDULE_PENDING" && res.proposedDate && (
        <div className="rounded-xl bg-purple-50 border border-purple-100 px-3 py-2 text-xs text-purple-700">
          Proposition envoyée : <strong>{res.proposedDate}{res.proposedTime ? ` à ${res.proposedTime}` : ""}</strong>. En attente de confirmation du Coffee Owner.
        </div>
      )}
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
          <Button size="sm" className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-xl" onClick={() => onComplete(res.id)}>
            <CheckCircle className="w-3 h-3 mr-1" /> Marquer terminée
          </Button>
        </div>
      )}
    </div>
  );
}

function MaintenanceMessages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [input, setInput] = useState("");

  const { data: conversations = [], isLoading } = useQuery<ConversationSummary[]>({
    queryKey: ["/api/messages/conversations"],
    enabled: !!user,
  });
  const maintenanceConversations = conversations.filter((conversation) => conversation.service === "MAINTENANCE");
  const activeConversation = maintenanceConversations.find((conversation) => conversation.id === activeId) ?? null;

  const { data: messagesData, isLoading: messagesLoading } = useQuery<{ messages: ConversationMessageRow[] }>({
    queryKey: ["/api/messages/conversations", activeId, "messages"],
    queryFn: async () => {
      const response = await fetch(`/api/messages/conversations/${activeId}/messages?pageSize=100`, { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger les messages");
      return response.json();
    },
    enabled: !!activeId,
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/messages/conversations/${activeId}/messages`, { content }),
    onSuccess: () => {
      setInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations", activeId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
    onError: (error: Error) => toast({ title: "Message non envoyé", description: error.message, variant: "destructive" }),
  });

  const selectConversation = (id: number) => {
    setActiveId(id);
    apiRequest("PATCH", `/api/messages/conversations/${id}/read`).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    }).catch(() => {});
  };

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-orange-500" />Messages Coffee Owners
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!activeConversation ? (
          <div className="max-h-[360px] overflow-y-auto">
            {isLoading ? (
              <div className="p-5 text-sm text-gray-400">Chargement des conversations…</div>
            ) : maintenanceConversations.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <MessageCircle className="w-9 h-9 text-gray-200 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-600">Aucun message pour le moment</p>
                <p className="text-xs text-gray-400 mt-1">Les demandes des Coffee Owners apparaîtront ici.</p>
              </div>
            ) : (
              maintenanceConversations.map((conversation) => {
                const name = conversation.title ?? (conversation.otherParticipants.map((participant) => participant.name).join(", ") || "Coffee Owner");
                return (
                  <button
                    key={conversation.id}
                    onClick={() => selectConversation(conversation.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left border-b border-gray-100 last:border-0 hover:bg-orange-50/50 transition-colors"
                  >
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarFallback className="bg-orange-100 text-orange-700 font-bold text-xs">{name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{name}</p>
                      <p className="text-xs text-gray-500 truncate">{conversation.lastMessage?.content ?? "Nouvelle conversation"}</p>
                    </div>
                    {conversation.unreadCount > 0 && (
                      <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-[10px] font-bold flex items-center justify-center">{conversation.unreadCount}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="h-[360px] flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              <button onClick={() => setActiveId(null)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center" aria-label="Retour">
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <p className="text-sm font-semibold truncate">
                {activeConversation.title ?? (activeConversation.otherParticipants.map((participant) => participant.name).join(", ") || "Coffee Owner")}
              </p>
              <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">MAINTENANCE</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {messagesLoading ? <p className="text-xs text-gray-400 text-center pt-6">Chargement…</p> : (messagesData?.messages ?? []).map((message) => {
                const own = message.senderId === user?.id;
                return (
                  <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${own ? "bg-orange-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"}`}>
                      {message.content}
                      <span className={`block text-[10px] mt-1 opacity-60 ${own ? "text-right" : ""}`}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 border-t border-gray-100 flex gap-2">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (input.trim()) sendMessage.mutate(input.trim()); } }}
                placeholder="Écrire un message…"
                className="h-9 rounded-xl"
                disabled={sendMessage.isPending}
              />
              <Button
                size="icon"
                onClick={() => { if (input.trim()) sendMessage.mutate(input.trim()); }}
                disabled={!input.trim() || sendMessage.isPending}
                className="h-9 w-9 shrink-0 bg-orange-600 hover:bg-orange-700 rounded-xl"
                aria-label="Envoyer"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MaintenanceReviews() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reportId, setReportId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const { data: reviews = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/maintenance/reviews", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/maintenance/reviews/${user!.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger les avis");
      return response.json();
    },
    enabled: !!user?.id,
  });
  const report = useMutation({
    mutationFn: () => apiRequest("POST", `/api/maintenance/reviews/${reportId}/report`, { reason }),
    onSuccess: () => {
      setReportId(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/reviews", user?.id] });
      toast({ title: "Avis signalé", description: "L'équipe admin examinera votre signalement." });
    },
    onError: (error: Error) => toast({ title: "Signalement impossible", description: error.message, variant: "destructive" }),
  });

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Star className="w-4 h-4 text-orange-500" />Avis clients
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-gray-400">Chargement…</p> : reviews.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun avis reçu pour le moment.</p>
        ) : reviews.map((review) => {
          const reported = !!review.reportedAt;
          return (
            <div key={review.id} className="rounded-xl bg-gray-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{review.cafeOwnerName || review.cafeName || "Coffee Owner"}</p>
                  <div className="flex items-center gap-1 mt-1 text-amber-500 text-xs">
                    {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-gray-500 hover:text-red-600"
                  disabled={reported}
                  onClick={() => setReportId(review.id)}
                  title={reported ? "Avis déjà signalé" : "Signaler cet avis"}
                >
                  <Flag className="w-3.5 h-3.5" />
                </Button>
              </div>
              {review.comment && <p className="text-xs text-gray-600 mt-2 leading-relaxed">{review.comment}</p>}
              {reported && <Badge variant="outline" className="mt-2 text-[10px] text-orange-600 border-orange-200">Signalé</Badge>}
            </div>
          );
        })}
      </CardContent>
      <Dialog open={reportId !== null} onOpenChange={(open) => { if (!open) { setReportId(null); setReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Signaler cet avis</DialogTitle></DialogHeader>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Expliquez le motif du signalement…" rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportId(null)}>Annuler</Button>
            <Button variant="destructive" disabled={!reason.trim() || report.isPending} onClick={() => report.mutate()}>Envoyer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function MaintenanceDashboard() {
  const { user, logout, isLoggingOut } = useAuth();
  const currency = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  useRealtime(user?.id);
  const [activeTab, setActiveTab] = useState<"planning" | "profile" | "availability" | "messages" | "reviews">("planning");
  const [planTab, setPlanTab] = useState<"today" | "upcoming" | "past">("upcoming");
  const { data: reservations = [] } = useQuery<MaintenanceReservationRow[]>({
    queryKey: ["/api/maintenance/reservations"],
    enabled: user?.role === "MAINTENANCE",
  });
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
  const profile = profileData?.profile;

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

  // Availability state
  const [workingDays, setWorkingDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [isOnVacation, setIsOnVacation] = useState(false);

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
    setWorkingDays(p.workingDays ?? []);
    setStartTime(p.startTime);
    setEndTime(p.endTime);
    setIsOnVacation(p.isOnVacation);
  }, [profileData, user?.name, user?.phone]);

  const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  const filtered = useMemo(() => reservations.filter((r) => getTab(r.date) === planTab), [reservations, planTab]);
  const todayCount = reservations.filter((r) => getTab(r.date) === "today").length;
  const upcomingCount = reservations.filter((r) => getTab(r.date) === "upcoming").length;
  const pendingCount = reservations.filter((r) => r.status === "PENDING").length;

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/maintenance/reservations/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/maintenance/reservations"] }),
    onError: (error: Error) => toast({ title: "Impossible de mettre à jour la réservation", description: error.message, variant: "destructive" }),
  });
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
  const saveAvailability = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/maintenance/availability", {
      workingDays, startTime, endTime, isOnVacation, isAvailable: !isOnVacation,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/maintenance/profile", user?.id] }); toast({ title: "Disponibilités sauvegardées" }); },
    onError: (error: Error) => toast({ title: "Impossible de sauvegarder les disponibilités", description: error.message, variant: "destructive" }),
  });

  const handleConfirm = (id: number) => {
    updateStatus.mutate({ id, status: "CONFIRMED" });
  };
  const handleCancel = (id: number) => {
    updateStatus.mutate({ id, status: "CANCELLED" });
  };
  const handleReschedule = (id: number) => {
    const reservation = reservations.find((row) => row.id === id);
    if (!reservation) return;
    const nextDate = window.prompt("Nouvelle date (AAAA-MM-JJ)", reservation.date);
    if (!nextDate) return;
    const nextTime = window.prompt("Nouvelle heure (HH:MM)", reservation.time ?? "");
    updateStatus.mutate({ id, status: "RESCHEDULE_PENDING", date: nextDate, time: nextTime || null } as any);
  };
  const handleComplete = (id: number) => updateStatus.mutate({ id, status: "COMPLETED" });

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
    { key: "profile" as const, label: "Profil", icon: User },
    { key: "availability" as const, label: "Disponibilité", icon: Calendar },
    { key: "messages" as const, label: "Messages", icon: MessageCircle },
    { key: "reviews" as const, label: "Avis", icon: Star },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-600 px-4 py-5 md:py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg">Espace Maintenance</h1>
              <p className="text-orange-100 text-xs">{user?.name}</p>
            </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => logout()}
              disabled={isLoggingOut}
              className="text-white hover:bg-white/15 hover:text-white rounded-xl text-xs"
            >
              <LogOut className="w-4 h-4 mr-1.5" />Se déconnecter
            </Button>
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

        {/* ── MESSAGES ── */}
        {activeTab === "messages" && <MaintenanceMessages />}
        {activeTab === "reviews" && <MaintenanceReviews />}

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
                    onComplete={handleComplete}
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

            <Button onClick={() => saveAvailability.mutate()} disabled={saveAvailability.isPending} className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-2xl py-5">
              Sauvegarder les disponibilités
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
