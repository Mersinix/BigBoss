import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useMyAcademyCourses, useAcademyRegistrations, useMyAcademySessions, useAcademyReviews,
  type AcademyRegistrationStatus,
} from "@/hooks/use-barista-academy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Users, Clock, Star, TrendingUp, CalendarDays } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const STATUS_LABELS: Record<AcademyRegistrationStatus, string> = {
  PENDING: "En attente", CONFIRMED: "Confirmée", CANCELLED: "Annulée", COMPLETED: "Terminée",
};
const STATUS_COLORS: Record<AcademyRegistrationStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700", CONFIRMED: "bg-indigo-100 text-indigo-700",
  CANCELLED: "bg-gray-100 text-gray-600", COMPLETED: "bg-green-100 text-green-700",
};

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

// Real Academy dashboard — every KPI below is computed from actual courses/
// registrations/sessions/reviews, mirroring barista-marketplace/dashboard.tsx's
// own "compute from real hooks, no stored aggregates" approach. No fake values.
export default function BaristaAcademyDashboard() {
  const { user } = useAuth();
  const { data: courses = [], isLoading: coursesLoading } = useMyAcademyCourses();
  const { data: registrations = [], isLoading: registrationsLoading } = useAcademyRegistrations();
  const { data: sessions = [], isLoading: sessionsLoading } = useMyAcademySessions();
  const { data: reviews = [] } = useAcademyReviews(user?.id ?? null);

  const isLoading = coursesLoading || registrationsLoading || sessionsLoading;

  const now = new Date();
  const publishedCourses = courses.filter((c) => c.isPublished).length;
  const pendingRegistrations = registrations.filter((r) => r.status === "PENDING").length;
  const students = registrations.filter((r) => r.status !== "CANCELLED").reduce((sum, r) => sum + r.participantCount, 0);
  const avgRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : "—";

  const upcomingSessions = useMemo(
    () => sessions.filter((s) => s.status === "UPCOMING").sort((a, b) => (a.startDate > b.startDate ? 1 : -1)).slice(0, 5),
    [sessions],
  );

  const chartData = useMemo(() => {
    const buckets: { month: string; registrations: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const count = registrations.filter((r) => {
        const rd = new Date(r.createdAt);
        return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth();
      }).length;
      buckets.push({ month: MONTH_LABELS[d.getMonth()], registrations: count });
    }
    return buckets;
  }, [registrations]);

  const recentRegistrations = useMemo(
    () => [...registrations].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).slice(0, 5),
    [registrations],
  );
  const recentReviews = useMemo(() => [...reviews].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).slice(0, 5), [reviews]);

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Barista Academy</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Bienvenue, {user?.name}. Gérez vos formations et étudiants.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Formations publiées", value: String(publishedCourses), icon: BookOpen, color: "text-indigo-500" },
            { label: "Étudiants", value: String(students), icon: Users, color: "text-blue-500" },
            { label: "Inscriptions en attente", value: String(pendingRegistrations), icon: Clock, color: "text-amber-500" },
            { label: "Note moyenne", value: avgRating, icon: Star, color: "text-yellow-500" },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" /> Inscriptions (6 mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="academyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v} inscrits`, "Inscriptions"]} />
                <Area type="monotone" dataKey="registrations" stroke="#6366f1" strokeWidth={2} fill="url(#academyGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Inscriptions récentes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentRegistrations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Aucune inscription pour le moment.</p>
            ) : (
              <div className="space-y-3">
                {recentRegistrations.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-secondary/20">
                    <div>
                      <p className="font-medium text-sm">{r.cafeOwnerName}{r.participantCount > 1 ? ` (${r.participantCount} pers.)` : ""}</p>
                      <p className="text-xs text-muted-foreground">{r.courseTitle}</p>
                    </div>
                    <Badge variant="secondary" className={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-500" /> Prochaines sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Aucune session à venir.</p>
            ) : (
              <div className="space-y-3">
                {upcomingSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-secondary/20">
                    <div>
                      <p className="font-medium text-sm">{s.courseTitle}</p>
                      <p className="text-xs text-muted-foreground">{s.startDate}{s.endDate ? ` → ${s.endDate}` : ""}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{s.registeredCount}{s.capacity ? `/${s.capacity}` : ""} inscrits</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" /> Avis récents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentReviews.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Aucun avis pour le moment.</p>
            ) : (
              <div className="space-y-3">
                {recentReviews.map((r) => (
                  <div key={r.id} className="p-3 rounded-xl border border-border/50 bg-secondary/20">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{r.cafeOwnerName || r.cafeName}</p>
                      <span className="text-amber-500 text-xs">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                    </div>
                    {r.comment && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
