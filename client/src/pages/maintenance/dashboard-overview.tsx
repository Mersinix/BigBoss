import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList, Clock, CheckCircle2, XCircle, CalendarClock, Star, Wrench, MapPin,
} from "lucide-react";
import type { MaintenanceReservationRow } from "@/pages/maintenance/planning";

// Real Maintenance Performance > Dashboard — a genuine dashboard, not a reuse
// of Planning's appointment list (Planning stays a separate, unchanged tab).
// Every number here is computed client-side from the same live endpoints the
// Planning and Profil tabs already use (GET /api/maintenance/reservations,
// GET /api/maintenance/profile/:userId) — no mock data, no second data source.
// Styled with the same `dark:` Tailwind-variant convention already proven to
// work across every other professional account shell (Driver/Printer/Academy/
// Barista/Marketing) — see provider-notifications-page.tsx's own note.

function statusMatches(status: string, key: string) {
  return status === key;
}

function StatTile({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: string | number;
  icon: typeof ClipboardList;
  tone: "orange" | "amber" | "green" | "red" | "blue";
}) {
  const toneCls: Record<string, string> = {
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  };
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${toneCls[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

export default function MaintenanceDashboardOverview() {
  const { user } = useAuth();
  const fmt = useFormatCurrency();

  const { data: reservations = [], isLoading: reservationsLoading } = useQuery<MaintenanceReservationRow[]>({
    queryKey: ["/api/maintenance/reservations"],
    enabled: user?.role === "MAINTENANCE",
  });
  const { data: profileData, isLoading: profileLoading } = useQuery<{ user: any; profile: any; card: any }>({
    queryKey: ["/api/maintenance/profile", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/maintenance/profile/${user!.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load profile");
      return response.json();
    },
    enabled: !!user?.id,
  });
  const isLoading = reservationsLoading || profileLoading;
  const card = profileData?.card;

  const stats = useMemo(() => {
    const total = reservations.length;
    const pending = reservations.filter((r) => statusMatches(r.status, "PENDING")).length;
    const confirmed = reservations.filter((r) => statusMatches(r.status, "CONFIRMED")).length;
    const completed = reservations.filter((r) => statusMatches(r.status, "COMPLETED")).length;
    const cancelled = reservations.filter((r) => statusMatches(r.status, "CANCELLED")).length;
    return { total, pending, confirmed, completed, cancelled };
  }, [reservations]);

  const nextIntervention = useMemo(() => {
    const now = new Date();
    return [...reservations]
      .filter((r) => r.status === "CONFIRMED" && r.date && new Date(`${r.date}T${r.time || "00:00"}`) >= now)
      .sort((a, b) => new Date(`${a.date}T${a.time || "00:00"}`).getTime() - new Date(`${b.date}T${b.time || "00:00"}`).getTime())[0];
  }, [reservations]);

  const recentReservations = useMemo(
    () => [...reservations].sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 5),
    [reservations],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Welcome / identity strip — same real account fields (name, rating,
          review count) the Profil/Avis tabs already show. */}
      <div className="bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent border border-orange-500/20 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Bienvenue, {user?.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Vue d'ensemble de votre activité Maintenance.</p>
        </div>
        {card && (
          <div className="flex items-center gap-3 bg-white/70 dark:bg-gray-800/70 border border-orange-500/20 rounded-2xl px-4 py-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
              <Star className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Note</p>
              <p className="text-base font-bold text-gray-900 dark:text-white">
                {card.reviewCount > 0 ? `${(card.rating / 10).toFixed(1)} (${card.reviewCount} avis)` : "Aucun avis"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* KPI tiles — real reservation counts from the same query Planning uses */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Total réservations" value={stats.total} icon={ClipboardList} tone="orange" />
        <StatTile label="En attente" value={stats.pending} icon={Clock} tone="amber" />
        <StatTile label="Confirmées" value={stats.confirmed} icon={CalendarClock} tone="blue" />
        <StatTile label="Terminées" value={stats.completed} icon={CheckCircle2} tone="green" />
        <StatTile label="Annulées" value={stats.cancelled} icon={XCircle} tone="red" />
      </div>

      {/* Next intervention */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 rounded-2xl p-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4 text-orange-500" /> Prochaine intervention
        </p>
        {nextIntervention ? (
          <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white truncate">{nextIntervention.cafeOwner} · {nextIntervention.service}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 shrink-0" /> {nextIntervention.location || "—"}
              </p>
            </div>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">
              {nextIntervention.date} {nextIntervention.time || ""}
            </span>
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">Aucune intervention confirmée à venir.</p>
        )}
      </div>

      {/* Recent activity */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 rounded-2xl p-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-1.5">
          <Wrench className="w-4 h-4 text-orange-500" /> Activité récente
        </p>
        {recentReservations.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Aucune réservation Maintenance pour le moment.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {recentReservations.map((r) => (
              <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{r.cafeOwner} · {r.service}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{r.date} {r.time || ""}</p>
                </div>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
