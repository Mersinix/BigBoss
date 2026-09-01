import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/use-currency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/use-realtime";
import type { ConversationSummary, ConversationMessageRow, OpeningHoursMap } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getAvatarUrl } from "@/lib/avatar";
import LocationPickerModal from "@/components/location-picker-modal";
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
  X,
  Navigation,
  Bell,
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

// ── Per-day schedule (Part 2) ────────────────────────────────────────────────
// Reuses the exact same { monday: {open, close, closed}, ... } shape as
// supplierStores.openingHours (shared/schema.ts's OpeningHoursMap) rather than
// inventing a parallel one — also exported so the Coffee-Owner-facing
// Availability modal (maintenance-page.tsx) shares the same day key/label map.

export const WEEKLY_DAY_DEFS: { key: keyof OpeningHoursMap; label: string; short: string }[] = [
  { key: "monday", label: "Lundi", short: "Lun" },
  { key: "tuesday", label: "Mardi", short: "Mar" },
  { key: "wednesday", label: "Mercredi", short: "Mer" },
  { key: "thursday", label: "Jeudi", short: "Jeu" },
  { key: "friday", label: "Vendredi", short: "Ven" },
  { key: "saturday", label: "Samedi", short: "Sam" },
  { key: "sunday", label: "Dimanche", short: "Dim" },
];

// Migration fallback — derives a per-day schedule from the legacy global
// workingDays/startTime/endTime fields so an account that never touched the
// new per-day editor still gets a sensible starting point (Part 6: no data
// loss, nothing hardcoded that isn't actually the saved schedule).
export function buildWeeklyHoursFallback(workingDays: string[], startTime: string, endTime: string): OpeningHoursMap {
  const map = {} as OpeningHoursMap;
  for (const d of WEEKLY_DAY_DEFS) {
    map[d.key] = { open: startTime || "08:00", close: endTime || "18:00", closed: !workingDays.includes(d.short) };
  }
  return map;
}

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

function ReservationCard({ res, onConfirm, onCancel, onReschedule, onComplete, fromAddress }: {
  res: MaintenanceReservationRow;
  onConfirm: (id: number) => void;
  onCancel: (id: number) => void;
  onReschedule: (id: number) => void;
  onComplete: (id: number) => void;
  fromAddress?: string | null;
}) {
  const meta = STATUS_META[res.status] ?? STATUS_META.PENDING;
  const Icon = meta.icon;
  // GO (Part 12) — real saved addresses only: FROM the Maintenance professional's
  // own account location (users.locationAddress), TO the reservation's stored
  // location. Google Maps resolves plain addresses itself, no geocoding needed
  // client-side. Gracefully hidden (not a broken/invalid link) when either side
  // is missing — never falls back to browser geolocation or a hardcoded point.
  const canNavigate = !!(fromAddress?.trim() && res.location?.trim());
  const mapsUrl = canNavigate
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(fromAddress!)}&destination=${encodeURIComponent(res.location)}`
    : null;
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
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-orange-500" />{res.date} à {res.time}</span>
        <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-orange-500" />{res.location}</span>
        <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-orange-500" />{res.contactPhone || res.ownerPhone || "—"}</span>
        {mapsUrl && (res.status === "PENDING" || res.status === "CONFIRMED") && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-orange-600 text-white hover:bg-orange-700"
            data-testid={`link-go-reservation-${res.id}`}>
            <Navigation className="w-3 h-3" />GO
          </a>
        )}
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
    refetchInterval: 30000,
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
                      <AvatarImage src={getAvatarUrl(conversation.otherParticipants[0] as any)} alt={name} />
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

// ── Settings (Part 10-11) — same design logic as the Barista Marketplace
// Settings page (client/src/pages/barista-marketplace/settings.tsx), adapted
// to Maintenance: Account info / Location / Security / Notifications /
// Marketplace visibility. Reuses the same generic self-service endpoints
// (PATCH /api/auth/me/profile, PATCH /api/auth/me/location) plus the existing
// PATCH /api/maintenance/profile for marketplaceVisible — no second
// visibility/account system. ─────────────────────────────────────────────────

function MaintenanceSettings({ profile }: { profile: any }) {
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-orange-500" />Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[{ key: "reservations", label: "Réservations" }, { key: "messages", label: "Messages" }, { key: "reviews", label: "Avis" }].map((n) => (
            <div key={n.key} className="flex items-center justify-between py-1"><span className="text-sm">{n.label}</span><Switch defaultChecked /></div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Settings className="w-4 h-4 text-orange-500" />Visibilité marketplace</CardTitle></CardHeader>
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

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function MaintenanceDashboard() {
  const { user, logout, isLoggingOut } = useAuth();
  const currency = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  useRealtime(user?.id);
  const [activeTab, setActiveTab] = useState<"planning" | "profile" | "availability" | "messages" | "reviews" | "settings">("planning");
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
  const [certificationDraft, setCertificationDraft] = useState("");
  const [portfolioDraft, setPortfolioDraft] = useState("");
  const [rescheduleTarget, setRescheduleTarget] = useState<MaintenanceReservationRow | null>(null);
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("");

  // Availability state — legacy global fields kept (still sent on save, derived
  // from weeklyHours, for backward compatibility) alongside the new per-day
  // schedule that now actually drives the editor UI.
  const [workingDays, setWorkingDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [isOnVacation, setIsOnVacation] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState<OpeningHoursMap>(buildWeeklyHoursFallback([], "08:00", "18:00"));

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
    setWeeklyHours(p.weeklyHours ?? buildWeeklyHoursFallback(p.workingDays ?? [], p.startTime ?? "08:00", p.endTime ?? "18:00"));
  }, [profileData, user?.name, user?.phone]);

  const filtered = useMemo(() => reservations.filter((r) => getTab(r.date) === planTab), [reservations, planTab]);
  const todayCount = reservations.filter((r) => getTab(r.date) === "today").length;
  const upcomingCount = reservations.filter((r) => getTab(r.date) === "upcoming").length;
  const pendingCount = reservations.filter((r) => r.status === "PENDING").length;

  const updateStatus = useMutation({
    mutationFn: ({ id, status, date, time }: { id: number; status: string; date?: string; time?: string | null }) =>
      apiRequest("PATCH", `/api/maintenance/reservations/${id}/status`, { status, date, time }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/reservations"] });
      setRescheduleTarget(null);
      toast({ title: "Réservation mise à jour" });
    },
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
    mutationFn: () => {
      // Legacy global fields derived from the per-day schedule for backward
      // compatibility — the per-day weeklyHours is now the real source of truth.
      const openDays = WEEKLY_DAY_DEFS.filter((d) => !weeklyHours[d.key].closed);
      const derivedWorkingDays = openDays.map((d) => d.short);
      const firstOpen = openDays[0] ? weeklyHours[openDays[0].key] : null;
      return apiRequest("PATCH", "/api/maintenance/availability", {
        workingDays: derivedWorkingDays,
        startTime: firstOpen?.open ?? startTime,
        endTime: firstOpen?.close ?? endTime,
        isOnVacation, isAvailable: !isOnVacation,
        weeklyHours,
      });
    },
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
    setRescheduleTarget(reservation);
    setProposedDate(reservation.date);
    setProposedTime(reservation.time ?? "");
  };
  const submitReschedule = () => {
    if (!rescheduleTarget || !proposedDate) return;
    updateStatus.mutate({
      id: rescheduleTarget.id,
      status: "RESCHEDULE_PENDING",
      date: proposedDate,
      time: proposedTime || null,
    });
  };
  const handleComplete = (id: number) => updateStatus.mutate({ id, status: "COMPLETED" });

  const toggleSpecialty = (s: string) => {
    setSelectedSpecialties((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };
  const toggleArea = (a: string) => {
    setSelectedAreas((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  };
  const updateDayHours = (key: keyof OpeningHoursMap, patch: Partial<OpeningHoursMap[keyof OpeningHoursMap]>) => {
    setWeeklyHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const tabs = [
    { key: "planning" as const, label: "Planning", icon: ClipboardList },
    { key: "profile" as const, label: "Profil", icon: User },
    { key: "availability" as const, label: "Disponibilité", icon: Calendar },
    { key: "messages" as const, label: "Messages", icon: MessageCircle },
    { key: "reviews" as const, label: "Avis", icon: Star },
    { key: "settings" as const, label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-600 px-4 py-5 md:py-6">
        <div className="max-w-5xl mx-auto">
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
              <LogOut className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Se déconnecter</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors shrink-0 ${
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

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* ── MESSAGES ── */}
        {activeTab === "messages" && <MaintenanceMessages />}
        {activeTab === "reviews" && <MaintenanceReviews />}
        {activeTab === "settings" && <MaintenanceSettings profile={profile} />}

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
                    fromAddress={user?.locationAddress}
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

            {/* Working days & hours — per-day (Part 2): each day is configured
                independently instead of one global toggle + one global time
                range. Same card/typography/spacing language as the rest of
                this page, just extended. */}
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-orange-500" />Jours et horaires de travail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {WEEKLY_DAY_DEFS.map((d) => {
                  const day = weeklyHours[d.key];
                  return (
                    <div key={d.key} className="flex items-center gap-3 rounded-xl border border-gray-100 p-2.5">
                      <button
                        onClick={() => updateDayHours(d.key, { closed: !day.closed })}
                        className={`w-16 shrink-0 h-9 rounded-xl text-xs font-semibold transition-all ${
                          !day.closed ? "bg-orange-600 text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                        data-testid={`button-toggle-day-${d.key}`}
                      >
                        {d.short}
                      </button>
                      {day.closed ? (
                        <span className="text-xs font-medium text-gray-400 flex-1">Fermé</span>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <Input type="time" value={day.open} onChange={(e) => updateDayHours(d.key, { open: e.target.value })} className="h-9 rounded-xl text-xs" data-testid={`input-day-open-${d.key}`} />
                          <span className="text-gray-300 text-xs">–</span>
                          <Input type="time" value={day.close} onChange={(e) => updateDayHours(d.key, { close: e.target.value })} className="h-9 rounded-xl text-xs" data-testid={`input-day-close-${d.key}`} />
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="text-xs text-gray-400 pt-1">Les cafés ne verront que les créneaux disponibles dans ces plages horaires, jour par jour.</p>
              </CardContent>
            </Card>

            {/* Summary — dynamic, reflects the actual saved per-day schedule (Part 5) */}
            <Card className="rounded-2xl border-gray-100 shadow-sm bg-gradient-to-br from-orange-50 to-amber-50">
              <CardContent className="pt-4">
                <p className="font-semibold text-sm mb-2 text-orange-700 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Résumé de disponibilité</p>
                <div className="text-xs text-gray-600 space-y-0.5">
                  {WEEKLY_DAY_DEFS.map((d) => {
                    const day = weeklyHours[d.key];
                    return (
                      <p key={d.key}>
                        <strong>{d.label} :</strong> {day.closed ? "Fermé" : `${day.open} – ${day.close}`}
                      </p>
                    );
                  })}
                  <p className="pt-1"><strong>Statut :</strong> {isOnVacation ? "🔴 En congé" : "🟢 Disponible"}</p>
                </div>
              </CardContent>
            </Card>

            <Button onClick={() => saveAvailability.mutate()} disabled={saveAvailability.isPending} className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-2xl py-5">
              Sauvegarder les disponibilités
            </Button>
          </div>
        )}
      </div>
      <Dialog open={rescheduleTarget !== null} onOpenChange={(open) => { if (!open) setRescheduleTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Proposer une nouvelle date</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            Le Coffee Owner devra confirmer cette modification. La date actuelle reste inchangée jusque-là.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="maintenance-proposed-date">Date proposée</Label>
              <Input id="maintenance-proposed-date" type="date" value={proposedDate} onChange={(event) => setProposedDate(event.target.value)} className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label htmlFor="maintenance-proposed-time">Heure proposée</Label>
              <Input id="maintenance-proposed-time" type="time" value={proposedTime} onChange={(event) => setProposedTime(event.target.value)} className="mt-1 rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleTarget(null)}>Annuler</Button>
            <Button disabled={!proposedDate || updateStatus.isPending} onClick={submitReschedule} className="bg-orange-600 hover:bg-orange-700 text-white">
              {updateStatus.isPending ? "Envoi…" : "Envoyer la proposition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
