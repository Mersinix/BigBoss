import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  GraduationCap, Users, CheckCircle, XCircle, Star, Search,
  MapPin, Phone, Mail, Calendar, TrendingUp, Wallet, Clock, ClipboardList, BookOpen, Award, CalendarDays,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/use-realtime";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useAuth } from "@/hooks/use-auth";
import { SectionCard, RankRow, EmptyState } from "@/components/dashboard/dashboard-kit";
import { MessagesPanel } from "@/components/messages/messages-panel";

// Mirrors admin/barista-page.tsx's architecture exactly: one aggregate overview
// endpoint (/api/admin/academy), client-side tabs/filters over it, no
// pagination, no separate per-tab fetch, no duplicate data — this page is a
// read/moderate layer over the exact same tables the public /academy
// marketplace, the Coffee Owner's registrations and the Barista Academy
// account itself already read from (academyCourses, academyCourseSessions,
// academyRegistrations, academyProfiles, and supplierProductReviews scoped to
// reviewType='ACADEMY').

type AdminAcademy = {
  userId: number; name: string; email: string; phone: string | null; profileImageUrl: string | null;
  status: string; description: string; location: string; marketplaceVisible: boolean;
  rating: number; reviewCount: number; courseCount: number; publishedCourseCount: number;
  registrationCount: number; completedRegistrationCount: number; revenueCents: number;
  createdAt: string | null; initials: string;
};
type AdminCourse = {
  id: number; academyUserId: number; title: string; description: string; level: string;
  priceInCents: number; duration: string; hasCertification: boolean; category: string; location: string;
  trainingMode: string; capacity: number | null; isPublished: boolean; createdAt: string | null;
  academyName: string;
};
type AdminRegistration = {
  id: number; courseId: number; sessionId: number | null; academyUserId: number; cafeOwnerId: number;
  participantType: "CAFE_OWNER" | "BARISTA_MARKETPLACE";
  participantCount: number; participants: string[]; priceInCents: number; status: string; notes: string;
  createdAt: string | null; confirmedAt: string | null; cancelledAt: string | null; completedAt: string | null;
  cafeOwnerName: string; academyName: string; courseTitle: string; sessionStartDate: string | null; sessionEndDate: string | null;
};
type AdminSession = {
  id: number; courseId: number; academyUserId: number; startDate: string; endDate: string | null;
  capacity: number | null; status: string; courseTitle: string; academyName: string; registeredCount: number;
};
type AdminReview = {
  id: number; rating: number; comment: string | null; cafeName: string; cafeOwnerName: string | null;
  createdAt: string | null; academyRegistrationId: number | null; academyName: string;
};
type Overview = {
  stats: {
    totalAcademies: number; activeAcademies: number; totalCourses: number; publishedCourses: number;
    totalRegistrations: number; pendingRegistrations: number; confirmedRegistrations: number;
    completedRegistrations: number; cancelledRegistrations: number; upcomingSessions: number; completedSessions: number;
    completedRegistrationValueCents: number; pendingRegistrationValueCents: number;
    reviewCount: number; averageRating: number;
  };
  academies: AdminAcademy[];
  courses: AdminCourse[];
  registrations: AdminRegistration[];
  sessions: AdminSession[];
  reviews: AdminReview[];
};

const LEVEL_LABELS: Record<string, string> = { BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert" };
const LEVEL_COLORS: Record<string, string> = {
  BEGINNER: "bg-green-100 text-green-700", ADVANCED: "bg-blue-100 text-blue-700", EXPERT: "bg-purple-100 text-purple-700",
};
const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente", CONFIRMED: "Confirmée", CANCELLED: "Annulée", COMPLETED: "Terminée",
};
const REGISTRATION_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700", CONFIRMED: "bg-indigo-100 text-indigo-700",
  CANCELLED: "bg-gray-100 text-gray-600", COMPLETED: "bg-green-100 text-green-700",
};
const SESSION_STATUS_LABELS: Record<string, string> = { UPCOMING: "À venir", ACTIVE: "En cours", COMPLETED: "Terminée", CANCELLED: "Annulée" };
const SESSION_STATUS_COLORS: Record<string, string> = {
  UPCOMING: "bg-blue-100 text-blue-700", ACTIVE: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700", CANCELLED: "bg-gray-100 text-gray-600",
};

function RegistrationStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={REGISTRATION_STATUS_COLORS[status] ?? ""}>{REGISTRATION_STATUS_LABELS[status] ?? status}</Badge>;
}
function SessionStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={SESSION_STATUS_COLORS[status] ?? ""}>{SESSION_STATUS_LABELS[status] ?? status}</Badge>;
}

// ── Academy detail dialog ──────────────────────────────────────────────────────

function AcademyDetail({ academy, onClose }: { academy: AdminAcademy | null; onClose: () => void }) {
  const fmt = useFormatCurrency();
  if (!academy) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar><AvatarImage src={getAvatarUrl(academy)} alt={academy.name} /><AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">{academy.initials}</AvatarFallback></Avatar>
            <span>{academy.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Badge variant="outline">{academy.status}</Badge>
            <Badge variant={academy.publishedCourseCount > 0 ? "default" : "secondary"}>{academy.publishedCourseCount > 0 ? "Formations actives" : "Aucune formation publiée"}</Badge>
            {!academy.marketplaceVisible && <Badge variant="secondary">Masquée du marketplace</Badge>}
          </div>
          <div className="flex gap-2"><Mail className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Email</p><p>{academy.email}</p></div></div>
          <div className="flex gap-2"><Phone className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Téléphone</p><p>{academy.phone || "—"}</p></div></div>
          <div className="flex gap-2"><MapPin className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Localisation</p><p>{academy.location || "—"}</p></div></div>
          <div className="flex gap-2"><Calendar className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Inscription</p><p>{academy.createdAt ? new Date(academy.createdAt).toLocaleDateString("fr-FR") : "—"}</p></div></div>
          <div className="flex gap-2"><BookOpen className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Formations</p><p>{academy.publishedCourseCount} publiée(s) / {academy.courseCount} au total</p></div></div>
          <div className="flex gap-2"><ClipboardList className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Inscriptions</p><p>{academy.completedRegistrationCount} terminée(s) / {academy.registrationCount} au total</p></div></div>
          <div className="flex gap-2"><Wallet className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Revenu (formations terminées)</p><p>{fmt(academy.revenueCents)}</p></div></div>
          <div className="flex gap-2"><Star className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Évaluation</p><p>{academy.reviewCount > 0 ? `${(academy.rating / 10).toFixed(1)} (${academy.reviewCount} avis)` : "Aucun avis"}</p></div></div>
          {academy.description && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Description</p><p className="whitespace-pre-wrap">{academy.description}</p></div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────

const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };

export default function AdminAcademyPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fmt = useFormatCurrency();
  useRealtime();

  const [section, setSection] = useState("overview");
  const [selectedAcademy, setSelectedAcademy] = useState<AdminAcademy | null>(null);

  const [academySearch, setAcademySearch] = useState("");
  const [academyStatus, setAcademyStatus] = useState("all");

  const [courseSearch, setCourseSearch] = useState("");
  const [courseStatus, setCourseStatus] = useState("all");

  const [registrationSearch, setRegistrationSearch] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState("all");

  const [studentSearch, setStudentSearch] = useState("");

  const { data, isLoading } = useQuery<Overview>({ queryKey: ["/api/admin/academy"] });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest("PATCH", `/api/admin/users/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/academy"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Statut mis à jour" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const stats = data?.stats;
  const kpis = [
    ["Académies", stats?.totalAcademies ?? 0, Users],
    ["Actives / approuvées", stats?.activeAcademies ?? 0, CheckCircle],
    ["Formations publiées", stats?.publishedCourses ?? 0, BookOpen],
    ["Inscriptions", stats?.totalRegistrations ?? 0, ClipboardList],
    ["En attente", stats?.pendingRegistrations ?? 0, Clock],
    ["Terminées", stats?.completedRegistrations ?? 0, CheckCircle],
    ["Annulées", stats?.cancelledRegistrations ?? 0, XCircle],
    ["Sessions à venir", stats?.upcomingSessions ?? 0, CalendarDays],
  ] as const;

  // ── Académies tab ──
  const academies = useMemo(() => (data?.academies ?? []).filter((a) => {
    const haystack = [a.name, a.email, a.location].join(" ").toLowerCase();
    return (!academySearch || haystack.includes(academySearch.toLowerCase()))
      && (academyStatus === "all" || a.status === academyStatus);
  }), [data?.academies, academySearch, academyStatus]);

  // ── Formations tab ──
  const courses = useMemo(() => (data?.courses ?? []).filter((c) => {
    const haystack = [c.title, c.description, c.academyName, c.category].join(" ").toLowerCase();
    return (!courseSearch || haystack.includes(courseSearch.toLowerCase()))
      && (courseStatus === "all" || (courseStatus === "published" ? c.isPublished : !c.isPublished));
  }), [data?.courses, courseSearch, courseStatus]);

  // ── Inscriptions tab ──
  const registrations = useMemo(() => (data?.registrations ?? []).filter((r) => {
    const haystack = [r.courseTitle, r.academyName, r.cafeOwnerName].join(" ").toLowerCase();
    return (!registrationSearch || haystack.includes(registrationSearch.toLowerCase()))
      && (registrationStatus === "all" || r.status === registrationStatus);
  }), [data?.registrations, registrationSearch, registrationStatus]);

  // ── Étudiants tab — derived from registrations, no duplicate student system ──
  const students = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return (data?.registrations ?? [])
      .filter((r) => r.status !== "CANCELLED")
      .filter((r) => !query || [r.cafeOwnerName, r.courseTitle, r.academyName, ...r.participants].join(" ").toLowerCase().includes(query));
  }, [data?.registrations, studentSearch]);

  // ── Finance tab ──
  const financeSummary = useMemo(() => ({
    total: (stats?.completedRegistrationValueCents ?? 0) + (stats?.pendingRegistrationValueCents ?? 0),
    completed: stats?.completedRegistrationValueCents ?? 0,
    pending: stats?.pendingRegistrationValueCents ?? 0,
  }), [stats]);

  const topAcademiesByRevenue = useMemo(
    () => (data?.academies ?? []).slice().sort((a, b) => b.revenueCents - a.revenueCents).filter((a) => a.revenueCents > 0).slice(0, 5),
    [data?.academies],
  );

  // ── Analytics tab ──
  const registrationsByMonth = useMemo(() => {
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = (key: string) => {
      const [y, m] = key.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
    };
    const now = new Date();
    const byMonth = new Map<string, number>();
    for (const r of data?.registrations ?? []) {
      if (!r.createdAt) continue;
      const key = monthKey(new Date(r.createdAt));
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }
    const history: { month: string; registrations: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      history.push({ month: monthLabel(key), registrations: byMonth.get(key) ?? 0 });
    }
    return history;
  }, [data?.registrations]);

  const topCourses = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of data?.registrations ?? []) {
      if (r.status === "CANCELLED") continue;
      counts.set(r.courseId, (counts.get(r.courseId) ?? 0) + r.participantCount);
    }
    return (data?.courses ?? [])
      .map((c) => ({ course: c, registered: counts.get(c.id) ?? 0 }))
      .filter((c) => c.registered > 0)
      .sort((a, b) => b.registered - a.registered)
      .slice(0, 6);
  }, [data?.registrations, data?.courses]);

  const completionRate = stats && stats.totalRegistrations > 0 ? Math.round((stats.completedRegistrations / stats.totalRegistrations) * 100) : 0;
  const cancellationRate = stats && stats.totalRegistrations > 0 ? Math.round((stats.cancelledRegistrations / stats.totalRegistrations) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><GraduationCap className="w-6 h-6 text-indigo-600" />ACADEMY</h1>
        <p className="text-muted-foreground text-sm mt-1">Contrôle centralisé du service Academy : académies, formations, inscriptions, étudiants, calendrier, messages, avis, finance et analytics.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(([label, value, Icon]) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-xl bg-indigo-500/10 p-2.5"><Icon className="w-4 h-4 text-indigo-600" /></div>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{isLoading ? "…" : value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="academies">Académies</TabsTrigger>
          <TabsTrigger value="courses">Formations</TabsTrigger>
          <TabsTrigger value="registrations">Inscriptions</TabsTrigger>
          <TabsTrigger value="students">Étudiants</TabsTrigger>
          <TabsTrigger value="calendar">Calendrier</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="reviews">Avis</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Inscriptions récentes</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {(data?.registrations ?? []).length === 0 ? <p className="p-6 text-center text-muted-foreground text-sm">Aucune inscription pour le moment.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">ID</th><th className="p-3">Académie</th><th className="p-3">Coffee Owner</th><th className="p-3">Formation</th><th className="p-3">Statut</th></tr></thead>
                  <tbody>
                    {(data?.registrations ?? []).slice(0, 10).map((r) => (
                      <tr key={r.id} className="border-b last:border-0" data-testid={`row-recent-registration-${r.id}`}>
                        <td className="p-3 font-medium">#{r.id}</td>
                        <td className="p-3">{r.academyName}</td>
                        <td className="p-3">{r.cafeOwnerName}</td>
                        <td className="p-3">{r.courseTitle}</td>
                        <td className="p-3"><RegistrationStatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Sessions à venir</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {(data?.sessions ?? []).filter((s) => s.status === "UPCOMING").length === 0 ? <p className="p-6 text-center text-muted-foreground text-sm">Aucune session à venir.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Formation</th><th className="p-3">Académie</th><th className="p-3">Date</th><th className="p-3">Participants</th></tr></thead>
                  <tbody>
                    {(data?.sessions ?? []).filter((s) => s.status === "UPCOMING").slice(0, 10).map((s) => (
                      <tr key={s.id} className="border-b last:border-0" data-testid={`row-upcoming-session-${s.id}`}>
                        <td className="p-3 font-medium">{s.courseTitle}</td>
                        <td className="p-3">{s.academyName}</td>
                        <td className="p-3 text-muted-foreground">{s.startDate}{s.endDate ? ` → ${s.endDate}` : ""}</td>
                        <td className="p-3">{s.registeredCount}{s.capacity ? `/${s.capacity}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Académies ── */}
        <TabsContent value="academies" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={academySearch} onChange={(e) => setAcademySearch(e.target.value)} placeholder="Rechercher une académie…" data-testid="input-search-academies" /></div>
            <Select value={academyStatus} onValueChange={setAcademyStatus}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="approved">Approuvée</SelectItem><SelectItem value="pending">En attente</SelectItem><SelectItem value="rejected">Rejetée</SelectItem></SelectContent>
            </Select>
          </div>
          {academies.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucune académie correspondante.</CardContent></Card> : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {academies.map((academy) => (
                <Card key={academy.userId} className="hover:shadow-md transition-shadow" data-testid={`card-academy-${academy.userId}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3 cursor-pointer" onClick={() => setSelectedAcademy(academy)}>
                      <Avatar><AvatarImage src={getAvatarUrl(academy)} alt={academy.name} /><AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">{academy.initials}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1"><h3 className="font-semibold truncate">{academy.name}</h3><p className="text-xs text-muted-foreground truncate flex items-center gap-1"><MapPin className="h-3 w-3" />{academy.location || "—"}</p></div>
                      <span className={`h-2.5 w-2.5 rounded-full mt-1 ${academy.publishedCourseCount > 0 ? "bg-green-500" : "bg-gray-300"}`} />
                    </div>
                    <div className="flex flex-wrap gap-1"><Badge variant="outline" className="text-xs">{academy.status}</Badge><Badge variant="secondary" className="text-xs">{academy.publishedCourseCount} formation(s)</Badge><Badge variant="secondary" className="text-xs">{academy.registrationCount} inscription(s)</Badge></div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{fmt(academy.revenueCents)}</span><span>{academy.reviewCount > 0 ? `★ ${(academy.rating / 10).toFixed(1)}` : "Aucun avis"}</span></div>
                    {academy.status !== "approved" && (
                      <Button size="sm" className="w-full h-7 text-xs" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: academy.userId, status: "approved" })} data-testid={`button-approve-academy-${academy.userId}`}>Approuver</Button>
                    )}
                    {academy.status === "approved" && (
                      <Button size="sm" variant="outline" className="w-full h-7 text-xs border-red-200 text-red-600 hover:bg-red-50" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: academy.userId, status: "rejected" })} data-testid={`button-suspend-academy-${academy.userId}`}>Suspendre</Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Formations ── */}
        <TabsContent value="courses" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={courseSearch} onChange={(e) => setCourseSearch(e.target.value)} placeholder="Rechercher une formation, une académie…" data-testid="input-search-courses" /></div>
            <Select value={courseStatus} onValueChange={setCourseStatus}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toutes</SelectItem><SelectItem value="published">Publiées</SelectItem><SelectItem value="draft">Brouillons</SelectItem></SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {courses.length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucune formation correspondante.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Formation</th><th className="p-3">Académie</th><th className="p-3">Niveau</th><th className="p-3">Prix</th><th className="p-3">Certification</th><th className="p-3">Statut</th></tr></thead>
                  <tbody>
                    {courses.map((c) => (
                      <tr key={c.id} className="border-b last:border-0" data-testid={`row-course-${c.id}`}>
                        <td className="p-3 font-medium">{c.title}</td>
                        <td className="p-3">{c.academyName}</td>
                        <td className="p-3"><Badge variant="outline" className={LEVEL_COLORS[c.level] ?? ""}>{LEVEL_LABELS[c.level] ?? c.level}</Badge></td>
                        <td className="p-3">{fmt(c.priceInCents)}</td>
                        <td className="p-3">{c.hasCertification ? <span className="flex items-center gap-1 text-amber-600"><Award className="h-3.5 w-3.5" />Certifiante</span> : "—"}</td>
                        <td className="p-3"><Badge variant={c.isPublished ? "default" : "secondary"}>{c.isPublished ? "Publiée" : "Brouillon"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Inscriptions ── */}
        <TabsContent value="registrations" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={registrationSearch} onChange={(e) => setRegistrationSearch(e.target.value)} placeholder="Rechercher une inscription, une académie, un client…" data-testid="input-search-registrations" /></div>
            <Select value={registrationStatus} onValueChange={setRegistrationStatus}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les statuts</SelectItem>{Object.entries(REGISTRATION_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {registrations.length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucune inscription correspondante.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">ID</th><th className="p-3">Académie</th><th className="p-3">Inscrit par</th><th className="p-3">Type</th><th className="p-3">Formation</th><th className="p-3">Participants</th><th className="p-3">Montant</th><th className="p-3">Statut</th></tr></thead>
                  <tbody>
                    {registrations.slice(0, 100).map((r) => (
                      <tr key={r.id} className="border-b last:border-0" data-testid={`row-registration-${r.id}`}>
                        <td className="p-3 font-medium">#{r.id}</td>
                        <td className="p-3">{r.academyName}</td>
                        <td className="p-3">{r.cafeOwnerName}</td>
                        <td className="p-3"><Badge variant="outline" className="text-[10px] font-normal">{r.participantType === "BARISTA_MARKETPLACE" ? "Barista" : "Coffee Owner"}</Badge></td>
                        <td className="p-3">{r.courseTitle}</td>
                        <td className="p-3">{r.participantCount}</td>
                        <td className="p-3">{fmt(r.priceInCents)}</td>
                        <td className="p-3"><RegistrationStatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Étudiants ── */}
        <TabsContent value="students" className="mt-4 space-y-4">
          <div className="relative max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Rechercher un étudiant…" data-testid="input-search-students" /></div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {students.length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucun étudiant pour le moment.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Inscrit par</th><th className="p-3">Type</th><th className="p-3">Participants</th><th className="p-3">Formation</th><th className="p-3">Académie</th><th className="p-3">Statut</th></tr></thead>
                  <tbody>
                    {students.slice(0, 200).map((r) => (
                      <tr key={r.id} className="border-b last:border-0" data-testid={`row-student-${r.id}`}>
                        <td className="p-3 font-medium">{r.cafeOwnerName}</td>
                        <td className="p-3"><Badge variant="outline" className="text-[10px] font-normal">{r.participantType === "BARISTA_MARKETPLACE" ? "Barista" : "Coffee Owner"}</Badge></td>
                        <td className="p-3">{r.participants.length > 0 ? r.participants.join(", ") : `${r.participantCount} participant(s)`}</td>
                        <td className="p-3">{r.courseTitle}</td>
                        <td className="p-3">{r.academyName}</td>
                        <td className="p-3"><RegistrationStatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Calendrier ── */}
        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {(data?.sessions ?? []).length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucune session pour le moment.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Formation</th><th className="p-3">Académie</th><th className="p-3">Date</th><th className="p-3">Participants</th><th className="p-3">Statut</th></tr></thead>
                  <tbody>
                    {(data?.sessions ?? []).map((s) => (
                      <tr key={s.id} className="border-b last:border-0" data-testid={`row-session-${s.id}`}>
                        <td className="p-3 font-medium">{s.courseTitle}</td>
                        <td className="p-3">{s.academyName}</td>
                        <td className="p-3 text-muted-foreground">{s.startDate}{s.endDate ? ` → ${s.endDate}` : ""}</td>
                        <td className="p-3">{s.registeredCount}{s.capacity ? `/${s.capacity}` : ""}</td>
                        <td className="p-3"><SessionStatusBadge status={s.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Messages — reuses the exact same MessagesPanel + central Messages System
        as Admin Messages and Admin Barista, scoped to service="ACADEMY". ── */}
        <TabsContent value="messages" className="mt-4">
          <Card className="overflow-hidden">
            {user && <MessagesPanel currentUserId={user.id} showRoleIndicator service="ACADEMY" />}
          </Card>
          <p className="text-xs text-muted-foreground mt-2">Pour la modération avancée (masquer/supprimer des conversations, export, broadcast), utilisez Admin → Messages → ACADEMY.</p>
        </TabsContent>

        {/* ── Avis ── */}
        <TabsContent value="reviews" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {(data?.reviews ?? []).length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucun avis Academy pour le moment.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Académie</th><th className="p-3">Client</th><th className="p-3">Note</th><th className="p-3">Commentaire</th><th className="p-3">Date</th></tr></thead>
                  <tbody>
                    {(data?.reviews ?? []).map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3">{r.academyName}</td>
                        <td className="p-3">{r.cafeOwnerName || r.cafeName}</td>
                        <td className="p-3 flex items-center gap-1 text-amber-500"><Star className="h-3.5 w-3.5 fill-current" />{r.rating}</td>
                        <td className="p-3 max-w-[280px] truncate">{r.comment || "—"}</td>
                        <td className="p-3 text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Finance — derived entirely from registration.priceInCents, exactly like
        the Academy's own Revenus page: no platform commission field exists in the
        data model, so none is fabricated here. ── */}
        <TabsContent value="finance" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Valeur totale (confirmées + terminées)</p><p className="text-xl font-bold">{fmt(financeSummary.total)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Formations terminées</p><p className="text-xl font-bold text-green-600">{fmt(financeSummary.completed)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Confirmées, pas encore délivrées</p><p className="text-xl font-bold text-amber-600">{fmt(financeSummary.pending)}</p></CardContent></Card>
          </div>
          <p className="text-xs text-muted-foreground">Academy est une mise en relation directe Académie ↔ Coffee Owner, sans commission plateforme — les montants ci-dessus correspondent donc au tarif convenu de chaque inscription, comme sur la page Revenus de l'académie.</p>
          <Card>
            <CardHeader><CardTitle className="text-base">Meilleures académies par revenu</CardTitle></CardHeader>
            <CardContent>
              {topAcademiesByRevenue.length === 0 ? <EmptyState message="Aucune donnée pour le moment." /> : (
                <div className="divide-y divide-border/40">
                  {topAcademiesByRevenue.map((a, i) => <RankRow key={a.userId} rank={i + 1} title={a.name} subtitle={`${a.completedRegistrationCount} inscription(s) terminée(s)`} value={fmt(a.revenueCents)} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Analytics ── */}
        <TabsContent value="analytics" className="mt-4 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux de complétion</p><p className="text-xl font-bold text-green-600">{completionRate}%</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux d'annulation</p><p className="text-xl font-bold text-red-600">{cancellationRate}%</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sessions terminées</p><p className="text-xl font-bold">{stats?.completedSessions ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Note moyenne</p><p className="text-xl font-bold">{stats && stats.reviewCount > 0 ? stats.averageRating.toFixed(1) : "—"}</p></CardContent></Card>
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
            <SectionCard title="Meilleures académies" icon={Users}>
              {topAcademiesByRevenue.length === 0 ? <EmptyState message="Aucune académie pour le moment." /> : (
                <div className="divide-y divide-border/40">
                  {topAcademiesByRevenue.map((a, i) => <RankRow key={a.userId} rank={i + 1} title={a.name} subtitle={`${a.registrationCount} inscription(s)`} value={fmt(a.revenueCents)} />)}
                </div>
              )}
            </SectionCard>
          </div>
          <SectionCard title="Formations les plus demandées" icon={Award}>
            {topCourses.length === 0 ? <EmptyState message="Aucune inscription pour le moment." /> : (
              <div className="divide-y divide-border/40">
                {topCourses.map((c, i) => <RankRow key={c.course.id} rank={i + 1} title={c.course.title} subtitle={c.course.academyName} value={String(c.registered)} />)}
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <AcademyDetail academy={selectedAcademy} onClose={() => setSelectedAcademy(null)} />
    </div>
  );
}
