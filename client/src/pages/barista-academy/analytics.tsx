import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAcademyRegistrations, useMyAcademyCourses, useMyAcademySessions, useAcademyReviews, useAcademyRevenue } from "@/hooks/use-barista-academy";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Award } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { SectionCard, RankRow, EmptyState } from "@/components/dashboard/dashboard-kit";

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };

// Every metric below is computed client-side from the same real hooks the
// rest of the account already uses — no duplicate analytics storage, mirrors
// admin/print-page.tsx's Analytics tab approach exactly.
export default function AcademyAnalyticsPage() {
  const { user } = useAuth();
  const fmt = useFormatCurrency();
  const { data: registrations = [], isLoading: regLoading } = useAcademyRegistrations();
  const { data: courses = [], isLoading: coursesLoading } = useMyAcademyCourses();
  const { data: sessions = [] } = useMyAcademySessions();
  const { data: reviews = [] } = useAcademyReviews(user?.id ?? null);
  const { data: revenue } = useAcademyRevenue();

  const isLoading = regLoading || coursesLoading;

  const registrationsByMonth = useMemo(() => {
    const now = new Date();
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

  const revenueByMonth = useMemo(() => (revenue?.history ?? []).map((h) => ({ month: h.month.slice(5), revenue: h.totalCents / 100 })), [revenue]);

  const topCourses = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of registrations) {
      if (r.status === "CANCELLED") continue;
      counts.set(r.courseId, (counts.get(r.courseId) ?? 0) + r.participantCount);
    }
    return courses
      .map((c) => ({ course: c, registered: counts.get(c.id) ?? 0 }))
      .filter((c) => c.registered > 0)
      .sort((a, b) => b.registered - a.registered)
      .slice(0, 5);
  }, [registrations, courses]);

  const nonCancelled = registrations.filter((r) => r.status !== "CANCELLED");
  const completed = registrations.filter((r) => r.status === "COMPLETED");
  const completionRate = nonCancelled.length > 0 ? Math.round((completed.length / nonCancelled.length) * 100) : 0;
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  const capacitySessions = sessions.filter((s) => s.capacity != null && s.status !== "CANCELLED");
  const occupancyRate = capacitySessions.length > 0
    ? Math.round((capacitySessions.reduce((s, session) => s + Math.min(session.registeredCount, session.capacity!), 0) / capacitySessions.reduce((s, session) => s + session.capacity!, 0)) * 100)
    : null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Vue d'ensemble de la performance de vos formations.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux de complétion</p><p className="text-xl font-bold text-green-600">{completionRate}%</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Note moyenne</p><p className="text-xl font-bold">{reviews.length > 0 ? avgRating.toFixed(1) : "—"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Formations publiées</p><p className="text-xl font-bold">{courses.filter((c) => c.isPublished).length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux d'occupation</p><p className="text-xl font-bold text-indigo-600">{occupancyRate != null ? `${occupancyRate}%` : "—"}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Inscriptions par mois" icon={TrendingUp}>
          {registrationsByMonth.every((h) => h.registrations === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={registrationsByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [`${v} inscriptions`, "Inscriptions"]} />
                <Bar dataKey="registrations" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Revenu par mois" icon={TrendingUp}>
          {revenueByMonth.every((h) => h.revenue === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [fmt(Math.round((v as number) * 100)), "Revenu"]} />
                <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Formations les plus demandées" icon={Award}>
        {topCourses.length === 0 ? <EmptyState message="Aucune inscription pour le moment." /> : (
          <div className="divide-y divide-border/40">
            {topCourses.map((c, i) => <RankRow key={c.course.id} rank={i + 1} title={c.course.title} subtitle={`${c.registered} participant${c.registered > 1 ? "s" : ""}`} value={String(c.registered)} />)}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
