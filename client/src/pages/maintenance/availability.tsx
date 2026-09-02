import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OpeningHoursMap } from "@shared/schema";
import { WEEKLY_DAY_DEFS, buildWeeklyHoursFallback } from "@/lib/weekly-hours";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, AlertCircle, Zap } from "lucide-react";

// ── Availability tab ──────────────────────────────────────────────────────────

export default function Availability() {
  const { user } = useAuth();
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
    setWorkingDays(p.workingDays ?? []);
    setStartTime(p.startTime);
    setEndTime(p.endTime);
    setIsOnVacation(p.isOnVacation);
    setWeeklyHours(p.weeklyHours ?? buildWeeklyHoursFallback(p.workingDays ?? [], p.startTime ?? "08:00", p.endTime ?? "18:00"));
  }, [profileData]);

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

  const updateDayHours = (key: keyof OpeningHoursMap, patch: Partial<OpeningHoursMap[keyof OpeningHoursMap]>) => {
    setWeeklyHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  return (
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
  );
}
