import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMyBaristaJobApplications, useBaristaReviews, type BaristaJobApplicationStatus } from "@/hooks/use-barista-marketplace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, CalendarClock, Clock, Star, TrendingUp, Coffee } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

// Mission-workflow cleanup (barista_performance_flash_audit.md) — this
// dashboard used to be built entirely on the legacy 1:1 request/mission
// system (useBaristaRequests/useBaristaMissions), which no longer has any
// creation UI anywhere in the Barista Marketplace. Rebuilt on the current
// job-posting system: useMyBaristaJobApplications() (GET
// /api/barista/applications/mine), covering both Offer and Mission
// applications for this authenticated barista. No duplicate data source, no
// legacy-request figures counted as current activity.

const STATUS_LABELS: Record<BaristaJobApplicationStatus, string> = {
  PENDING: "En attente",
  PRESELECTED: "Présélectionné",
  INTERVIEW_SCHEDULED: "Entretien planifié",
  ACCEPTED: "Accepté",
  REJECTED: "Rejeté",
};

const STATUS_COLORS: Record<BaristaJobApplicationStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  PRESELECTED: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  INTERVIEW_SCHEDULED: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  ACCEPTED: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

export default function BaristaMarketplaceDashboard() {
  const { user } = useAuth();
  const { data: applications = [], isLoading: applicationsLoading } = useMyBaristaJobApplications();
  const { data: reviews = [] } = useBaristaReviews(user?.id ?? null);

  const isLoading = applicationsLoading;

  const now = new Date();
  const thisMonthApplications = applications.filter((a) => {
    const d = new Date(a.createdAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const pendingApplications = applications.filter((a) => a.status === "PENDING").length;
  // Upcoming interview = a proposed/confirmed meeting still in the future —
  // mirrors the same bucketing rule jobs.tsx's applicationBucket() already
  // uses for its own "upcoming" filter, so the two pages never disagree.
  const upcomingInterviews = applications.filter((a) => {
    const m = a.meeting;
    if (!m || (m.status !== "PROPOSED" && m.status !== "CONFIRMED")) return false;
    return new Date(m.scheduledAt).getTime() > now.getTime();
  }).length;
  const avgRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : "—";

  const chartData = useMemo(() => {
    const buckets: { month: string; applications: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const count = applications.filter((a) => {
        const ad = new Date(a.createdAt);
        return ad.getFullYear() === d.getFullYear() && ad.getMonth() === d.getMonth();
      }).length;
      buckets.push({ month: MONTH_LABELS[d.getMonth()], applications: count });
    }
    return buckets;
  }, [applications]);

  const recentApplications = useMemo(
    () => [...applications].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).slice(0, 5),
    [applications]
  );

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Tableau de bord Marketplace Barista"
        subtitle={`Bienvenue, ${user?.name}. Suivez vos candidatures et vos entretiens.`}
        stat={reviews.length > 0 ? avgRating : undefined}
        statLabel="Note moyenne"
        icon={Coffee}
        gradientClass="bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent border-green-500/20"
        iconBgClass="bg-green-500/15"
        iconTextClass="text-green-600 dark:text-green-400"
      />

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Candidatures ce mois", value: String(thisMonthApplications), icon: Send, color: "text-indigo-500" },
            { label: "Entretiens à venir", value: String(upcomingInterviews), icon: CalendarClock, color: "text-blue-500" },
            { label: "En attente", value: String(pendingApplications), icon: Clock, color: "text-amber-500" },
            { label: "Note", value: avgRating, icon: Star, color: "text-yellow-500" },
          ].map((kpi) => (
            <Card key={kpi.label} className={CARD_CLASS}>
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
        <Card className={CARD_CLASS}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" /> Candidatures (6 mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="baristaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v} candidature${v > 1 ? "s" : ""}`, "Candidatures"]} />
                <Area type="monotone" dataKey="applications" stroke="#6366f1" strokeWidth={2} fill="url(#baristaGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className={CARD_CLASS}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Candidatures récentes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
            ) : recentApplications.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Aucune candidature pour le moment.</p>
            ) : (
              <div className="space-y-3">
                {recentApplications.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-secondary/20">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{a.jobTitle}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.establishment} · {a.recordType === "MISSION" ? "Mission" : "Offre"}</p>
                    </div>
                    <Badge variant="secondary" className={`shrink-0 ${STATUS_COLORS[a.status]}`}>{STATUS_LABELS[a.status]}</Badge>
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
