import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  RotateCcw,
  MapPin,
  Phone,
  Navigation,
} from "lucide-react";

export type MaintenanceReservationRow = {
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

// ── Planning tab ───────────────────────────────────────────────────────────────

export default function Planning() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [planTab, setPlanTab] = useState<"today" | "upcoming" | "past">("upcoming");
  const [rescheduleTarget, setRescheduleTarget] = useState<MaintenanceReservationRow | null>(null);
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("");

  const { data: reservations = [] } = useQuery<MaintenanceReservationRow[]>({
    queryKey: ["/api/maintenance/reservations"],
    enabled: user?.role === "MAINTENANCE",
  });

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

  return (
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
    </>
  );
}
