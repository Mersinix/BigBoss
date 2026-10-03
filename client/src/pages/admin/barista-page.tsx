import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Coffee, Users, CheckCircle, Star, Plus, Pencil, Trash2, Snowflake, Search,
  MapPin, Phone, Mail, Calendar, CalendarClock, TrendingUp, Wallet, Clock, ClipboardList, Briefcase, Award, Eye, X, Check, Send,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/use-realtime";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useAuth } from "@/hooks/use-auth";
import { DashboardHero, SectionCard, RankRow, EmptyState, KpiOverviewButton, KpiOverviewModal } from "@/components/dashboard/dashboard-kit";
import { useIsMobile } from "@/hooks/use-mobile";
import { AlertTriangle } from "lucide-react";
import {
  useAdminBaristaReports, useResolveBaristaReport,
  useAdminBaristaEducationLevels, useCreateAdminBaristaEducationLevel, useUpdateAdminBaristaEducationLevel, useDeleteAdminBaristaEducationLevel,
  useAdminBaristaLanguages, useCreateAdminBaristaLanguage, useUpdateAdminBaristaLanguage, useDeleteAdminBaristaLanguage,
} from "@/hooks/use-barista-marketplace";
import { BaristaDetailModal } from "@/components/barista/barista-detail-modal";
import { PublicationStatusBadge } from "@/components/account/publication-status-badge";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";

// Mirrors admin/print-page.tsx's architecture exactly: one aggregate overview
// endpoint (/api/admin/barista), client-side tabs/filters over it, no
// pagination, no separate per-tab fetch, no duplicate data — this page is a
// read/moderate layer over the exact same tables the public /barista
// marketplace, the Coffee Owner's "Marketplace Baristas" and the Barista
// Marketplace account itself already read from (baristaMarketplaceProfiles,
// baristaSkills, baristaJobPosts/-Applications/-Meetings, and
// supplierProductReviews scoped to reviewType='BARISTA_MARKETPLACE'). This is
// Marketplace Baristas ONLY — Barista Academy (/academy) is a separate,
// static-content service and is deliberately not represented here (see the
// Barista/Academy split rationale on shared/schema.ts's serviceKeyEnum).
//
// Mission-workflow cleanup (see mission_workflow_cleanup_audit.md): the old
// "Demandes"/"Missions"/"Finance" tabs — built entirely on the legacy 1:1
// baristaMarketplaceRequests/-Missions recruitment flow — were removed from
// this page. That data/the backend routes/storage methods computing it are
// NOT deleted (still returned by /api/admin/barista, harmless, preserves
// historical records) — they're simply no longer rendered here, since the
// Coffee Owner's own UI for creating/accepting them was removed first. The
// current, going-forward workflow (Coffee Owner publishes a job post,
// Barista applies, Coffee Owner reviews applications) lives entirely under
// "Offres & Missions (emploi)" below, which is now this page's single
// job-posting interface.

type SkillItem = { id: number; name: string; isActive: boolean; isFrozen: boolean };
type AdminBarista = {
  userId: number; name: string; email: string; phone: string | null; profileImageUrl: string | null;
  status: string; level: string; city: string; location: string; bio: string; skills: string[];
  availableDays: string[]; isAvailable: boolean; isOnVacation: boolean; marketplaceVisible: boolean; isFrozen: boolean;
  available: boolean; dailyRateInCents: number; rating: number; reviewCount: number;
  publicationStatus?: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED"; publicationRejectionReason?: string | null;
  jobApplicationCount: number; acceptedJobApplicationCount: number;
  createdAt: string | null; initials: string;
};
type AdminJobPost = {
  id: number; cafeOwnerId: number; recordType: "OFFER" | "MISSION"; title: string; establishment: string;
  locationAddress: string; openPositions: number; employmentTypes: string[]; experienceRequired: string;
  educationLevels: string[]; languages: string[]; remuneration: string; description: string; requirements: string;
  expiresAt: string | null; missionStartDate: string | null; missionEndDate: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED"; publicationMode: "AUTOMATIC" | "MANUAL";
  createdAt: string | null; updatedAt: string | null;
  cafeOwnerName: string; applicationCount: number;
};
type AdminJobApplication = {
  id: number; jobPostId: number; recordType: "OFFER" | "MISSION";
  status: "PENDING" | "PRESELECTED" | "INTERVIEW_SCHEDULED" | "ACCEPTED" | "REJECTED";
  createdAt: string | null;
};
type Overview = {
  stats: {
    totalBaristas: number; activeBaristas: number; availableBaristas: number;
    reviewCount: number; averageRating: number;
    totalJobOffers: number; publishedJobOffers: number; draftJobOffers: number; closedJobOffers: number;
    totalJobMissions: number; publishedJobMissions: number; draftJobMissions: number; closedJobMissions: number;
    totalJobApplications: number; pendingJobApplications: number; preselectedJobApplications: number;
    interviewScheduledJobApplications: number; acceptedJobApplications: number; rejectedJobApplications: number;
    applicationsToJobOffers: number; applicationsToJobMissions: number; scheduledInterviews: number;
  };
  skills: SkillItem[];
  baristas: AdminBarista[];
  jobPosts: AdminJobPost[];
  jobApplications: AdminJobApplication[];
};

const LEVEL_LABELS: Record<string, string> = { BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert" };
const LEVEL_COLORS: Record<string, string> = {
  BEGINNER: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400", ADVANCED: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400", EXPERT: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
};

// Same labels/colors as the Coffee Owner's job-management-modal.tsx and the
// Barista's barista-marketplace/jobs.tsx — Admin must read the exact same
// business states, never invent its own.
const JOB_POST_STATUS_LABELS: Record<string, string> = { DRAFT: "Brouillon", PUBLISHED: "Publiée", CLOSED: "Clôturée" };
const JOB_POST_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
  PUBLISHED: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  CLOSED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};
const PUBLICATION_MODE_LABELS: Record<string, string> = { AUTOMATIC: "Automatique", MANUAL: "Manuelle" };
const APPLICATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente", PRESELECTED: "Présélectionné", INTERVIEW_SCHEDULED: "Entretien planifié",
  ACCEPTED: "Accepté", REJECTED: "Rejeté",
};
const APPLICATION_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  PRESELECTED: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  INTERVIEW_SCHEDULED: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  ACCEPTED: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

function JobPostStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={JOB_POST_STATUS_COLORS[status] ?? ""}>{JOB_POST_STATUS_LABELS[status] ?? status}</Badge>;
}

function fmtPlainDate(value: string | null) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Taxonomy list (mirrors Print's CategoryTaxonomy — flat list, same admin-managed
// pattern already backing GET /api/barista/skills) — generalized so Niveau d'étude and
// Langue (new, Part X) can reuse the exact same UI/behavior as Compétences instead of
// three near-duplicate components. SkillsTaxonomy below is an unchanged thin wrapper
// over this, so the existing Compétences tab's rendering/testids are byte-identical. ──

function TaxonomySection({ title, items, placeholder, testIdPrefix, create, update, remove, emptyLabel }: {
  title: string;
  items: SkillItem[];
  placeholder: string;
  testIdPrefix: string;
  emptyLabel: string;
  create: (name: string) => Promise<any>;
  update: (id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }) => Promise<any>;
  remove: (id: number) => Promise<any>;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [pending, setPending] = useState(false);

  const runCreate = async () => {
    if (!draft.trim() || pending) return;
    setPending(true);
    try { await create(draft.trim()); setDraft(""); toast({ title: "Ajouté" }); }
    catch (e: any) { toast({ title: "Impossible d'ajouter", description: e.message, variant: "destructive" }); }
    finally { setPending(false); }
  };
  const runUpdate = async (id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }) => {
    try { await update(id, data); setEditing(null); }
    catch { toast({ title: "Mise à jour impossible", variant: "destructive" }); }
  };
  const runRemove = async (id: number) => {
    try { await remove(id); }
    catch { toast({ title: "Suppression impossible", variant: "destructive" }); }
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} onKeyDown={(e) => e.key === "Enter" && runCreate()} data-testid={`input-new-${testIdPrefix}`} />
          <Button size="sm" disabled={!draft.trim() || pending} onClick={runCreate} data-testid={`button-add-${testIdPrefix}`}><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
        </div>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">{emptyLabel}</p> : items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2" data-testid={`row-${testIdPrefix}-${item.id}`}>
            {editing === item.id ? (
              <Input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter" && editValue.trim()) runUpdate(item.id, { name: editValue.trim() });
                if (e.key === "Escape") setEditing(null);
              }} />
            ) : <span className="flex-1 text-sm font-medium">{item.name}</span>}
            {item.isFrozen && <Badge variant="outline" className="text-xs text-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé</Badge>}
            {!item.isActive && <Badge variant="secondary" className="text-xs">Inactif</Badge>}
            {editing === item.id
              ? <Button size="sm" onClick={() => editValue.trim() && runUpdate(item.id, { name: editValue.trim() })}>OK</Button>
              : <Button variant="ghost" size="icon" onClick={() => { setEditing(item.id); setEditValue(item.name); }}><Pencil className="h-3.5 w-3.5" /></Button>}
            <Button variant="ghost" size="icon" title={item.isFrozen ? "Dégeler" : "Geler"} onClick={() => runUpdate(item.id, { isFrozen: !item.isFrozen })}><Snowflake className={`h-3.5 w-3.5 ${item.isFrozen ? "text-blue-600" : ""}`} /></Button>
            <Button variant="ghost" size="icon" title={item.isActive ? "Désactiver" : "Activer"} onClick={() => runUpdate(item.id, { isActive: !item.isActive })}><CheckCircle className={`h-3.5 w-3.5 ${item.isActive ? "text-green-600" : "text-muted-foreground"}`} /></Button>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => runRemove(item.id)} data-testid={`button-delete-${testIdPrefix}-${item.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SkillsTaxonomy({ items, onRefresh }: { items: SkillItem[]; onRefresh: () => void }) {
  const { toast } = useToast();
  const create = useMutation({
    mutationFn: (name: string) => apiRequest("POST", "/api/admin/barista/skills", { name }),
    onSuccess: onRefresh,
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/barista/skills/${id}`, data),
    onSuccess: onRefresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/barista/skills/${id}`),
    onSuccess: onRefresh,
  });
  return (
    <TaxonomySection
      title="Compétences Barista"
      items={items}
      placeholder="Ajouter une compétence"
      testIdPrefix="barista-skill"
      emptyLabel="Aucune compétence."
      create={(name) => create.mutateAsync(name)}
      update={(id, data) => update.mutateAsync({ id, data })}
      remove={(id) => remove.mutateAsync(id)}
    />
  );
}

// ── Niveau d'étude / Langue taxonomies (new) — same TaxonomySection UI as
// Compétences above, self-fetching since they aren't part of the /api/admin/barista
// aggregate (an independent Admin-managed resource, like skills already was before
// this feature — except skills happens to also be echoed into that aggregate for the
// public marketplace's own skill-filter dropdown, which education/language don't need). ──

function EducationLevelsTaxonomy() {
  const { data } = useAdminBaristaEducationLevels();
  const create = useCreateAdminBaristaEducationLevel();
  const update = useUpdateAdminBaristaEducationLevel();
  const remove = useDeleteAdminBaristaEducationLevel();
  return (
    <TaxonomySection
      title="Niveaux d'étude"
      items={data ?? []}
      placeholder="Ajouter un niveau d'étude"
      testIdPrefix="barista-education-level"
      emptyLabel="Aucun niveau d'étude."
      create={(name) => create.mutateAsync(name)}
      update={(id, patch) => update.mutateAsync({ id, ...patch })}
      remove={(id) => remove.mutateAsync(id)}
    />
  );
}

function LanguagesTaxonomy() {
  const { data } = useAdminBaristaLanguages();
  const create = useCreateAdminBaristaLanguage();
  const update = useUpdateAdminBaristaLanguage();
  const remove = useDeleteAdminBaristaLanguage();
  return (
    <TaxonomySection
      title="Langues"
      items={data ?? []}
      placeholder="Ajouter une langue"
      testIdPrefix="barista-language"
      emptyLabel="Aucune langue."
      create={(name) => create.mutateAsync(name)}
      update={(id, patch) => update.mutateAsync({ id, ...patch })}
      remove={(id) => remove.mutateAsync(id)}
    />
  );
}

// Switcher dividing the "Compétences" tab into its three managed taxonomies —
// additive wrapper, doesn't touch how any of the three lists themselves work.
function CompetencesSwitcher({ skills, onRefreshSkills }: { skills: SkillItem[]; onRefreshSkills: () => void }) {
  const [section, setSection] = useState<"skills" | "education" | "language">("skills");
  return (
    <div className="space-y-4">
      <Tabs value={section} onValueChange={(v) => setSection(v as any)}>
        <TabsList>
          <TabsTrigger value="skills" data-testid="tab-barista-competences-skills">Compétences</TabsTrigger>
          <TabsTrigger value="education" data-testid="tab-barista-competences-education">Niveau d'étude</TabsTrigger>
          <TabsTrigger value="language" data-testid="tab-barista-competences-language">Langue</TabsTrigger>
        </TabsList>
      </Tabs>
      {section === "skills" && <SkillsTaxonomy items={skills} onRefresh={onRefreshSkills} />}
      {section === "education" && <EducationLevelsTaxonomy />}
      {section === "language" && <LanguagesTaxonomy />}
    </div>
  );
}

// ── Barista detail dialog ──────────────────────────────────────────────────────

function BaristaDetail({ barista, onClose, onRefresh }: { barista: AdminBarista | null; onClose: () => void; onRefresh: () => void }) {
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startEdit = () => {
    setForm({
      name: barista!.name, phone: barista!.phone ?? "", bio: barista!.bio ?? "",
      dailyRateInCents: String((barista!.dailyRateInCents ?? 0) / 100),
    });
    setEditing(true);
  };
  const editMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/barista/accounts/${barista!.userId}`, {
      name: form.name, phone: form.phone, bio: form.bio,
      dailyRateInCents: Math.round(parseFloat(form.dailyRateInCents || "0") * 100),
    }),
    onSuccess: () => { setEditing(false); onRefresh(); toast({ title: "Compte mis à jour" }); },
    onError: (e: any) => toast({ title: "Mise à jour impossible", description: e.message, variant: "destructive" }),
  });
  const freezeMutation = useMutation({
    mutationFn: (isFrozen: boolean) => apiRequest("PATCH", `/api/admin/barista/accounts/${barista!.userId}/freeze`, { isFrozen }),
    onSuccess: () => { onRefresh(); toast({ title: barista!.isFrozen ? "Compte dégelé" : "Compte gelé" }); },
    onError: (e: any) => toast({ title: "Action impossible", description: e.message, variant: "destructive" }),
  });
  // GO Live review (Phase 5D) — approve/reject the submitted PROFILE CONTENT,
  // distinct from both account registration approval and the Freeze kill-switch above.
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const publicationMutation = useMutation({
    mutationFn: (data: { decision: "APPROVED" | "REJECTED"; rejectionReason?: string }) =>
      apiRequest("PATCH", `/api/admin/barista/accounts/${barista!.userId}/publication`, data),
    onSuccess: (_d, vars) => { onRefresh(); setRejecting(false); setRejectionReason(""); toast({ title: vars.decision === "APPROVED" ? "Profil approuvé et publié" : "Profil refusé" }); },
    onError: (e: any) => toast({ title: "Action impossible", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/users/${barista!.userId}`),
    onSuccess: () => { onRefresh(); onClose(); toast({ title: "Compte supprimé" }); },
    onError: (e: any) => toast({ title: "Suppression impossible", description: e.message, variant: "destructive" }),
  });

  if (!barista) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Thin scrollbar treatment — matches the existing Admin Order Details modal's own
          scroll container exactly, same thumb/track/hover classes, not a new scrollbar style. */}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar><AvatarImage src={getAvatarUrl(barista)} alt={barista.name} /><AvatarFallback className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400 font-bold">{barista.initials}</AvatarFallback></Avatar>
            <span className="flex-1">{barista.name}</span>
            <Button type="button" variant="ghost" size="icon" className="absolute right-12 top-4 h-8 w-8 rounded-full" onClick={() => setPreviewOpen(true)} title="Aperçu marketplace" aria-label="Aperçu marketplace" data-testid="button-preview-barista-marketplace">
              <Eye className="w-3.5 h-3.5" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Badge variant="outline">{barista.status}</Badge>
            <Badge className={LEVEL_COLORS[barista.level] ?? ""} variant="outline">{LEVEL_LABELS[barista.level] ?? barista.level}</Badge>
            <Badge variant={barista.available ? "default" : "secondary"}>{barista.available ? "Disponible" : "Indisponible"}</Badge>
            {!barista.marketplaceVisible && <Badge variant="secondary">Masqué du marketplace</Badge>}
            {barista.isFrozen && <Badge className="bg-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé par l'Admin</Badge>}
            <PublicationStatusBadge status={barista.publicationStatus ?? "DRAFT"} />
          </div>
          {barista.publicationStatus === "REJECTED" && barista.publicationRejectionReason && (
            <div className="sm:col-span-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg p-2">
              Motif du refus précédent : {barista.publicationRejectionReason}
            </div>
          )}

          {editing ? (
            <div className="sm:col-span-2 space-y-2 rounded-lg border p-3">
              <div className="grid sm:grid-cols-2 gap-2">
                <div><label className="text-xs text-muted-foreground">Nom</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground">Téléphone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground">Tarif journalier (DT)</label><Input type="number" min={0} value={form.dailyRateInCents} onChange={(e) => setForm({ ...form, dailyRateInCents: e.target.value })} /></div>
              </div>
              <div><label className="text-xs text-muted-foreground">Bio</label><Input value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
                <Button size="sm" disabled={editMutation.isPending} onClick={() => editMutation.mutate()}>{editMutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button>
              </div>
            </div>
          ) : <>
            <div className="flex gap-2"><Mail className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Email</p><p>{barista.email}</p></div></div>
            <div className="flex gap-2"><Phone className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Téléphone</p><p>{barista.phone || "—"}</p></div></div>
            <div className="flex gap-2"><MapPin className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Localisation</p><p>{barista.location || "—"}</p></div></div>
            <div className="flex gap-2"><Calendar className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Inscription</p><p>{barista.createdAt ? new Date(barista.createdAt).toLocaleDateString("fr-FR") : "—"}</p></div></div>
            <div className="flex gap-2"><Wallet className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Tarif journalier</p><p>{fmt(barista.dailyRateInCents)}</p></div></div>
            {/* Mission-workflow cleanup — these two used to show the legacy
                requestCount/missionCount/revenueCents (baristaMarketplaceRequests/
                -Missions); replaced with the new job-posting system's own
                candidacy counts (baristaJobApplications), see
                mission_workflow_cleanup_audit.md. */}
            <div className="flex gap-2"><Send className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Candidatures envoyées</p><p>{barista.jobApplicationCount}</p></div></div>
            <div className="flex gap-2"><CheckCircle className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Candidatures acceptées</p><p>{barista.acceptedJobApplicationCount}</p></div></div>
            <div className="flex gap-2"><Star className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Évaluation</p><p>{barista.reviewCount > 0 ? `${(barista.rating / 10).toFixed(1)} (${barista.reviewCount} avis)` : "Aucun avis"}</p></div></div>
            {barista.bio && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Bio</p><p className="whitespace-pre-wrap">{barista.bio}</p></div>}
            {barista.skills.length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Compétences</p>
                <div className="flex flex-wrap gap-1">{barista.skills.map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}</div>
              </div>
            )}
            {barista.availableDays.length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Disponibilité hebdomadaire</p>
                <div className="flex flex-wrap gap-1">{barista.availableDays.map((d) => <Badge key={d} variant="outline" className="text-xs">{d}</Badge>)}</div>
              </div>
            )}
          </>}

          {barista.publicationStatus === "PENDING" && (
            <div className="sm:col-span-2 rounded-lg border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Demande de publication en attente — vérifiez le profil ci-dessus avant de décider.</p>
              {rejecting ? (
                <div className="space-y-2">
                  <Textarea placeholder="Motif du refus (visible par le professionnel)…" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={2} data-testid="input-barista-publication-rejection-reason" />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setRejectionReason(""); }}>Annuler</Button>
                    <Button size="sm" variant="destructive" disabled={publicationMutation.isPending} onClick={() => publicationMutation.mutate({ decision: "REJECTED", rejectionReason })} data-testid="button-reject-barista-publication">
                      {publicationMutation.isPending ? "…" : "Confirmer le refus"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => setRejecting(true)} data-testid="button-start-reject-barista-publication">
                    <X className="h-3.5 w-3.5 mr-1.5" />Refuser
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={publicationMutation.isPending} onClick={() => publicationMutation.mutate({ decision: "APPROVED" })} data-testid="button-approve-barista-publication">
                    <Check className="h-3.5 w-3.5 mr-1.5" />{publicationMutation.isPending ? "…" : "Approuver"}
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            {!editing && <Button size="sm" variant="outline" onClick={startEdit} data-testid="button-edit-barista-account"><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Button>}
            <Button size="sm" variant="outline" disabled={freezeMutation.isPending} onClick={() => freezeMutation.mutate(!barista.isFrozen)} data-testid="button-freeze-barista-account">
              <Snowflake className={`h-3.5 w-3.5 mr-1.5 ${barista.isFrozen ? "text-blue-600" : ""}`} />{barista.isFrozen ? "Dégeler" : "Freeze"}
            </Button>
            {!confirmDelete ? (
              <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => setConfirmDelete(true)} data-testid="button-delete-barista-account">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
              </Button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/40 p-2">
                <span className="text-xs text-destructive">Confirmer la suppression définitive ?</span>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Annuler</Button>
                <Button size="sm" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()} data-testid="button-confirm-delete-barista-account">
                  {deleteMutation.isPending ? "Suppression…" : "Confirmer"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
      <BaristaDetailModal
        baristaUserId={barista.userId}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onRecruit={() => {}}
        readOnly
      />
    </Dialog>
  );
}

// ── Job post (Offre/Mission) detail dialog — read-only, reuses the same
// Dialog conventions as BaristaDetail above. Shows the full persisted record
// (every column returned by /api/admin/barista's jobPosts, which already
// spreads the whole baristaJobPosts row), with "—" placeholders for empty
// values rather than fabricated data. No mutation path — Admin reviews the
// same rows the Coffee Owner's own job-management modal and the Barista's
// application views already manage. ──

function JobPostDetail({ jobPost, onClose }: { jobPost: AdminJobPost | null; onClose: () => void }) {
  if (!jobPost) return null;
  const isMission = jobPost.recordType === "MISSION";
  const expiry = fmtPlainDate(jobPost.expiresAt);
  const missionStart = fmtPlainDate(jobPost.missionStartDate);
  const missionEnd = fmtPlainDate(jobPost.missionEndDate);
  const created = fmtPlainDate(jobPost.createdAt);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="flex-1 min-w-0 truncate">{jobPost.title}</span>
            <Badge variant="outline" className="text-xs">{isMission ? "Mission" : "Offre"}</Badge>
          </DialogTitle>
          <DialogDescription className="sr-only">Détails de {isMission ? "la mission" : "l'offre"} #{jobPost.id}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <JobPostStatusBadge status={jobPost.status} />
            <Badge variant="secondary" className="text-xs">{PUBLICATION_MODE_LABELS[jobPost.publicationMode] ?? jobPost.publicationMode}</Badge>
            <Badge variant="outline" className="text-xs">{jobPost.applicationCount} candidature{jobPost.applicationCount > 1 ? "s" : ""}</Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><p className="text-xs text-muted-foreground">Café / Coffee Owner</p><p className="font-medium">{jobPost.cafeOwnerName || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Établissement</p><p className="font-medium">{jobPost.establishment || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Lieu</p><p>{jobPost.locationAddress || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Postes ouverts</p><p>{jobPost.openPositions || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Expérience requise</p><p>{jobPost.experienceRequired || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Rémunération</p><p>{jobPost.remuneration || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Publiée le</p><p>{created ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Expire le</p><p>{expiry ?? "—"}</p></div>
            {isMission && (
              <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Période de la mission</p><p>{missionStart ?? "—"} → {missionEnd ?? "—"}</p></div>
            )}
          </div>
          {jobPost.employmentTypes.length > 0 && (
            <div><p className="text-xs text-muted-foreground mb-1">Type de contrat</p><div className="flex flex-wrap gap-1">{jobPost.employmentTypes.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div></div>
          )}
          {jobPost.educationLevels.length > 0 && (
            <div><p className="text-xs text-muted-foreground mb-1">Niveau d'étude</p><div className="flex flex-wrap gap-1">{jobPost.educationLevels.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div></div>
          )}
          {jobPost.languages.length > 0 && (
            <div><p className="text-xs text-muted-foreground mb-1">Langues</p><div className="flex flex-wrap gap-1">{jobPost.languages.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div></div>
          )}
          <div><p className="text-xs text-muted-foreground">Description</p><p className="whitespace-pre-wrap">{jobPost.description || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Exigences</p><p className="whitespace-pre-wrap">{jobPost.requirements || "—"}</p></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────

const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };

function monthBucketKeys(count: number) {
  const now = new Date();
  const keys: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    keys.push({ key, label: d.toLocaleDateString("fr-FR", { month: "short" }) });
  }
  return keys;
}

export default function AdminBaristaPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fmt = useFormatCurrency();
  useRealtime();

  const isMobile = useIsMobile();
  const [kpiModalOpen, setKpiModalOpen] = useState(false);

  const [section, setSection] = useState("baristas");
  const [selectedBarista, setSelectedBarista] = useState<AdminBarista | null>(null);
  const [selectedJobPost, setSelectedJobPost] = useState<AdminJobPost | null>(null);

  const [baristaSearch, setBaristaSearch] = useState("");
  const [baristaStatus, setBaristaStatus] = useState("all");
  const [baristaLevel, setBaristaLevel] = useState("all");
  const [baristaSearchOpen, setBaristaSearchOpen] = useState(false);
  const baristaSearchInputRef = useRef<HTMLInputElement>(null);

  // ── Offres & Missions (emploi) — the single job-posting interface this page
  // now has (mission-workflow cleanup). A top-level recordType switcher plus
  // status filter and title/café search, mirroring the Baristas tab's own
  // filter bar conventions. ──
  const [jobPostRecordType, setJobPostRecordType] = useState<"OFFER" | "MISSION">("OFFER");
  const [jobPostSearch, setJobPostSearch] = useState("");
  const [jobPostStatus, setJobPostStatus] = useState("all");
  const [jobPostSearchOpen, setJobPostSearchOpen] = useState(false);
  const jobPostSearchInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<Overview>({ queryKey: ["/api/admin/barista"] });
  const { data: pendingReports = [] } = useAdminBaristaReports("PENDING");
  const resolveReport = useResolveBaristaReport();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/barista"] });
    qc.invalidateQueries({ queryKey: ["/api/barista/skills"] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest("PATCH", `/api/admin/users/${id}/status`, { status }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "Statut mis à jour" }); },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const stats = data?.stats;
  // KPIs — mission-workflow cleanup: the legacy "Demandes" count and other
  // request-derived numbers were removed; every KPI below is computed from
  // the current job-posting system (or from account/profile fields that were
  // never part of the legacy workflow). See mission_workflow_cleanup_audit.md
  // Section E for each metric's exact source/definition.
  const kpis = [
    ["Baristas", stats?.totalBaristas ?? 0, Users],
    ["Actifs / approuvés", stats?.activeBaristas ?? 0, CheckCircle],
    ["Disponibles", stats?.availableBaristas ?? 0, Coffee],
    ["Offres d'emploi", stats?.totalJobOffers ?? 0, Briefcase],
    ["Missions publiées", stats?.publishedJobMissions ?? 0, ClipboardList],
    ["Candidatures", stats?.totalJobApplications ?? 0, Send],
    ["Candidatures en attente", stats?.pendingJobApplications ?? 0, Clock],
    ["Entretiens planifiés", stats?.scheduledInterviews ?? 0, CalendarClock],
  ] as const;

  // ── Baristas tab ──
  const baristas = useMemo(() => (data?.baristas ?? []).filter((b) => {
    const haystack = [b.name, b.email, b.location, b.skills.join(" ")].join(" ").toLowerCase();
    return (!baristaSearch || haystack.includes(baristaSearch.toLowerCase()))
      && (baristaStatus === "all" || b.status === baristaStatus)
      && (baristaLevel === "all" || b.level === baristaLevel);
  }), [data?.baristas, baristaSearch, baristaStatus, baristaLevel]);

  const baristaPagination = usePagination(baristas.length);
  useEffect(() => { baristaPagination.resetPage(); }, [baristaSearch, baristaStatus, baristaLevel]);
  const baristaPageItems = baristas.slice(baristaPagination.start, baristaPagination.end);

  // ── Offres & Missions (emploi) tab ──
  const jobPostsFiltered = useMemo(() => (data?.jobPosts ?? []).filter((j) => j.recordType === jobPostRecordType).filter((j) => {
    const haystack = [j.title, j.establishment, j.cafeOwnerName].join(" ").toLowerCase();
    return (!jobPostSearch || haystack.includes(jobPostSearch.toLowerCase()))
      && (jobPostStatus === "all" || j.status === jobPostStatus);
  }), [data?.jobPosts, jobPostRecordType, jobPostSearch, jobPostStatus]);

  const jobPostPagination = usePagination(jobPostsFiltered.length);
  useEffect(() => { jobPostPagination.resetPage(); }, [jobPostRecordType, jobPostSearch, jobPostStatus]);
  const jobPostPageItems = jobPostsFiltered.slice(jobPostPagination.start, jobPostPagination.end);

  // ── Analytics tab — new-system data only (mission-workflow cleanup). Bucketed
  // client-side from the full jobPosts/jobApplications lists, same approach
  // admin/print-page.tsx already uses for its own charts. ──
  const jobPostsByMonth = useMemo(() => {
    const months = monthBucketKeys(6);
    const byMonth = new Map<string, { offers: number; missions: number }>();
    for (const j of data?.jobPosts ?? []) {
      if (!j.createdAt) continue;
      const d = new Date(j.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = byMonth.get(key) ?? { offers: 0, missions: 0 };
      if (j.recordType === "MISSION") entry.missions++; else entry.offers++;
      byMonth.set(key, entry);
    }
    return months.map(({ key, label }) => ({ month: label, ...(byMonth.get(key) ?? { offers: 0, missions: 0 }) }));
  }, [data?.jobPosts]);

  const applicationsByMonth = useMemo(() => {
    const months = monthBucketKeys(6);
    const byMonth = new Map<string, number>();
    for (const a of data?.jobApplications ?? []) {
      if (!a.createdAt) continue;
      const d = new Date(a.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }
    return months.map(({ key, label }) => ({ month: label, count: byMonth.get(key) ?? 0 }));
  }, [data?.jobApplications]);

  const acceptanceRate = stats && stats.totalJobApplications > 0 ? Math.round((stats.acceptedJobApplications / stats.totalJobApplications) * 100) : null;

  // Non-revenue-based ranking (mission-workflow cleanup) — replaces the old
  // "Meilleurs baristas par revenu" (rateInCents-derived) ranking, since the
  // new system only has free-text remuneration with no reliable monetary
  // aggregate. Ranked by rating instead, same reviews data as before.
  const topRatedBaristas = useMemo(
    () => (data?.baristas ?? []).filter((b) => b.reviewCount > 0).slice().sort((a, b) => b.rating - a.rating).slice(0, 5),
    [data?.baristas],
  );

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title={<span className="flex items-center gap-2"><Coffee className="w-6 h-6 text-indigo-600" />BARISTA</span>}
        subtitle="Contrôle centralisé du Marketplace Baristas : profils, offres d'emploi, missions et candidatures."
        gradientClass="bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border-indigo-500/20"
        action={isMobile && <KpiOverviewButton onClick={() => setKpiModalOpen(true)} />}
      />

      {!isMobile && (
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
      )}

      <KpiOverviewModal open={isMobile && kpiModalOpen} onClose={() => setKpiModalOpen(false)}>
        <div className="grid grid-cols-2 gap-3">
          {kpis.map(([label, value, Icon]) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="rounded-xl bg-indigo-500/10 p-2.5"><Icon className="w-4 h-4 text-indigo-600" /></div>
                <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{isLoading ? "…" : value}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </KpiOverviewModal>

      <Tabs value={section} onValueChange={setSection}>
        {/* Switcher — same visual/scrolling design as the Admin System Management switcher:
            hidden-scrollbar horizontal scroll on mobile, pill container, active tab in a
            bg-background/shadow-sm chip. Reduced to 4 tabs (mission-workflow cleanup) —
            the old Demandes/Missions/Finance tabs were removed. */}
        <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          <TabsList className="flex items-center justify-start gap-1 bg-secondary/40 rounded-xl p-1 h-auto w-max min-w-full sm:w-fit">
            <TabsTrigger value="baristas" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Baristas</TabsTrigger>
            <TabsTrigger value="jobposts" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Offres &amp; Missions (emploi)</TabsTrigger>
            <TabsTrigger value="analytics" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Analytics</TabsTrigger>
            <TabsTrigger value="skills" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Compétences</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Baristas ── */}
        <TabsContent value="baristas" className="mt-4 space-y-4">
          {/* Entity-level reports — a Coffee Owner flagging a Barista account
              (distinct from review-reporting, which stays under Admin → Reviews →
              Barista). Relocated here (account-level moderation) now that the
              "Vue d'ensemble" tab that used to host it has been removed. */}
          {pendingReports.length > 0 && (
            <Card className="border-amber-300 dark:border-amber-700">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4" /> Signalements en attente ({pendingReports.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-border/50">
                {pendingReports.map((r) => (
                  <div key={r.id} className="p-3 flex items-start justify-between gap-3" data-testid={`row-barista-report-${r.id}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{r.baristaName} <span className="text-muted-foreground font-normal">signalé par {r.cafeOwnerName}</span></p>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={resolveReport.isPending}
                        onClick={() => resolveReport.mutate({ id: r.id, status: "DISMISSED" })} data-testid={`button-dismiss-report-${r.id}`}>
                        Ignorer
                      </Button>
                      <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white" disabled={resolveReport.isPending}
                        onClick={() => resolveReport.mutate({ id: r.id, status: "RESOLVED" })} data-testid={`button-resolve-report-${r.id}`}>
                        Marquer résolu
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0 sm:mb-0" style={{ scrollbarWidth: "none" }}>
            <div className="relative shrink-0 sm:flex-1 sm:min-w-[220px]">
              {!baristaSearchOpen && (
                <button
                  type="button"
                  className="sm:hidden w-9 h-9 flex items-center justify-center rounded-md border border-input text-muted-foreground"
                  onClick={() => { setBaristaSearchOpen(true); setTimeout(() => baristaSearchInputRef.current?.focus(), 0); }}
                  aria-label="Ouvrir la recherche"
                  data-testid="button-open-baristas-search"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
              <div className={`${baristaSearchOpen ? "flex" : "hidden"} sm:flex items-center relative w-48 sm:w-auto`}>
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={baristaSearchInputRef}
                  className="pl-9"
                  value={baristaSearch}
                  onChange={(e) => setBaristaSearch(e.target.value)}
                  onBlur={() => { if (!baristaSearch) setBaristaSearchOpen(false); }}
                  placeholder="Rechercher un barista…"
                  data-testid="input-search-baristas"
                />
              </div>
            </div>
            <Select value={baristaStatus} onValueChange={setBaristaStatus}>
              <SelectTrigger className="w-[160px] shrink-0"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="approved">Approuvé</SelectItem><SelectItem value="pending">En attente</SelectItem><SelectItem value="rejected">Rejeté</SelectItem></SelectContent>
            </Select>
            <Select value={baristaLevel} onValueChange={setBaristaLevel}>
              <SelectTrigger className="w-[150px] shrink-0"><SelectValue placeholder="Niveau" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous niveaux</SelectItem><SelectItem value="BEGINNER">Débutant</SelectItem><SelectItem value="ADVANCED">Avancé</SelectItem><SelectItem value="EXPERT">Expert</SelectItem></SelectContent>
            </Select>
            {(baristaSearch || baristaStatus !== "all" || baristaLevel !== "all") && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground shrink-0" onClick={() => { setBaristaSearch(""); setBaristaStatus("all"); setBaristaLevel("all"); }} data-testid="button-clear-baristas-filters">
                <X className="w-3.5 h-3.5" /> Effacer
              </Button>
            )}
          </div>
          {baristas.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucun barista correspondant.</CardContent></Card> : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {baristaPageItems.map((barista) => (
                <Card key={barista.userId} className="hover:shadow-md transition-shadow" data-testid={`card-barista-${barista.userId}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3 cursor-pointer" onClick={() => setSelectedBarista(barista)}>
                      <Avatar><AvatarImage src={getAvatarUrl(barista)} alt={barista.name} /><AvatarFallback className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400 font-bold">{barista.initials}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1"><h3 className="font-semibold truncate">{barista.name}</h3><p className="text-xs text-muted-foreground truncate flex items-center gap-1"><MapPin className="h-3 w-3" />{barista.location || "—"}</p></div>
                      <span className={`h-2.5 w-2.5 rounded-full mt-1 ${barista.available ? "bg-green-500" : "bg-gray-300"}`} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">{barista.status}</Badge>
                      <Badge className={`text-xs ${LEVEL_COLORS[barista.level] ?? ""}`} variant="outline">{LEVEL_LABELS[barista.level] ?? barista.level}</Badge>
                      {!barista.marketplaceVisible && <Badge variant="secondary" className="text-xs">Masqué</Badge>}
                      <Badge variant="secondary" className="text-xs">{barista.jobApplicationCount} candidature(s)</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{fmt(barista.dailyRateInCents)}/jour</span><span>{barista.reviewCount > 0 ? `★ ${(barista.rating / 10).toFixed(1)}` : "Aucun avis"}</span></div>
                    {barista.status !== "approved" && (
                      <Button size="sm" className="w-full h-7 text-xs" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: barista.userId, status: "approved" })} data-testid={`button-approve-barista-${barista.userId}`}>Approuver</Button>
                    )}
                    {barista.status === "approved" && (
                      <Button size="sm" variant="outline" className="w-full h-7 text-xs border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: barista.userId, status: "rejected" })} data-testid={`button-suspend-barista-${barista.userId}`}>Suspendre</Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <DataPagination
            page={baristaPagination.page}
            pageSize={baristaPagination.pageSize}
            totalItems={baristas.length}
            totalPages={baristaPagination.totalPages}
            start={baristaPagination.start}
            end={baristaPagination.end}
            onPageChange={baristaPagination.setPage}
            onPageSizeChange={baristaPagination.setPageSize}
            itemLabel="baristas"
          />
        </TabsContent>

        {/* Messages and Avis (Reviews) tabs intentionally removed — Barista conversations
        remain fully manageable via the central Admin → Messages → BARISTA area, and Barista
        reviews via the central Admin → Reviews → Barista tab (see admin/messages-page.tsx
        and admin/reviews-page.tsx). No data was removed — only this page's redundant
        duplicate views into that same data. */}

        {/* ── Offres & Missions (emploi) — the single job-posting system
        (baristaJobPosts): Coffee Owner job listings (Offres) and time-boxed
        engagements (Missions), each with Automatic/Manual publication and real
        applications. Mission-workflow cleanup (see
        mission_workflow_cleanup_audit.md): this used to be a secondary tab
        alongside the legacy "Demandes"/"Missions" tabs — those are gone, and
        this is now the only mission/offer management surface in Admin. A
        recordType switcher divides the dataset/filters/pagination below;
        clicking a row opens its full persisted record. Read-only: Admin
        reviews the same rows the Coffee Owner's "Mes offres d'emploi" modal
        and the Barista's "Offres"/"Missions" pages already manage; no parallel
        admin mutation path is introduced. ── */}
        <TabsContent value="jobposts" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Offres publiées</p><p className="text-xl font-bold">{stats?.publishedJobOffers ?? 0}<span className="text-sm font-normal text-muted-foreground"> / {stats?.totalJobOffers ?? 0}</span></p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Missions publiées</p><p className="text-xl font-bold">{stats?.publishedJobMissions ?? 0}<span className="text-sm font-normal text-muted-foreground"> / {stats?.totalJobMissions ?? 0}</span></p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Candidatures</p><p className="text-xl font-bold">{stats?.totalJobApplications ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Entretiens planifiés</p><p className="text-xl font-bold">{stats?.scheduledInterviews ?? 0}</p></CardContent></Card>
          </div>

          <Tabs value={jobPostRecordType} onValueChange={(v) => setJobPostRecordType(v as "OFFER" | "MISSION")}>
            <TabsList>
              <TabsTrigger value="OFFER" data-testid="tab-admin-jobposts-offers">Offres</TabsTrigger>
              <TabsTrigger value="MISSION" data-testid="tab-admin-jobposts-missions">Missions</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0 sm:mb-0" style={{ scrollbarWidth: "none" }}>
            <div className="relative shrink-0 sm:flex-1 sm:min-w-[220px]">
              {!jobPostSearchOpen && (
                <button
                  type="button"
                  className="sm:hidden w-9 h-9 flex items-center justify-center rounded-md border border-input text-muted-foreground"
                  onClick={() => { setJobPostSearchOpen(true); setTimeout(() => jobPostSearchInputRef.current?.focus(), 0); }}
                  aria-label="Ouvrir la recherche"
                  data-testid="button-open-jobposts-search"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
              <div className={`${jobPostSearchOpen ? "flex" : "hidden"} sm:flex items-center relative w-48 sm:w-auto`}>
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={jobPostSearchInputRef}
                  className="pl-9"
                  value={jobPostSearch}
                  onChange={(e) => setJobPostSearch(e.target.value)}
                  onBlur={() => { if (!jobPostSearch) setJobPostSearchOpen(false); }}
                  placeholder="Rechercher un titre, un café…"
                  data-testid="input-search-jobposts"
                />
              </div>
            </div>
            <Select value={jobPostStatus} onValueChange={setJobPostStatus}>
              <SelectTrigger className="w-[160px] shrink-0"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les statuts</SelectItem>{Object.entries(JOB_POST_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            {(jobPostSearch || jobPostStatus !== "all") && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground shrink-0" onClick={() => { setJobPostSearch(""); setJobPostStatus("all"); }} data-testid="button-clear-jobposts-filters">
                <X className="w-3.5 h-3.5" /> Effacer
              </Button>
            )}
          </div>

          {jobPostsFiltered.length === 0 ? (
            <EmptyState icon={Briefcase} message={jobPostRecordType === "MISSION" ? "Aucune mission correspondante." : "Aucune offre correspondante."} />
          ) : (
            <div className="space-y-2">
              {jobPostPageItems.map((j) => (
                <Card key={j.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedJobPost(j)} data-testid={`row-admin-job-post-${j.id}`}>
                  <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm truncate">{j.title}</p>
                        <Badge variant="secondary" className="text-xs">{PUBLICATION_MODE_LABELS[j.publicationMode] ?? j.publicationMode}</Badge>
                        <JobPostStatusBadge status={j.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{j.establishment} · {j.cafeOwnerName}</p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">{j.applicationCount} candidature{j.applicationCount > 1 ? "s" : ""}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <DataPagination
            page={jobPostPagination.page}
            pageSize={jobPostPagination.pageSize}
            totalItems={jobPostsFiltered.length}
            totalPages={jobPostPagination.totalPages}
            start={jobPostPagination.start}
            end={jobPostPagination.end}
            onPageChange={jobPostPagination.setPage}
            onPageSizeChange={jobPostPagination.setPageSize}
            itemLabel={jobPostRecordType === "MISSION" ? "missions" : "offres"}
          />
        </TabsContent>

        {/* ── Analytics — mission-workflow cleanup: rebuilt entirely on the
        current job-posting system (see mission_workflow_cleanup_audit.md
        Section E for each metric's definition). The old completion/
        cancellation rate (derived from legacy missions), "Demandes en
        attente", and the revenue-by-month chart + revenue-based "Meilleurs
        baristas" ranking were removed — replaced with publication/application
        activity over time and a rating-based ranking (no fabricated
        monetary figures, since the new system has no numeric rate field). ── */}
        <TabsContent value="analytics" className="mt-4 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Candidatures — Offres</p><p className="text-xl font-bold">{stats?.applicationsToJobOffers ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Candidatures — Missions</p><p className="text-xl font-bold">{stats?.applicationsToJobMissions ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Entretiens planifiés</p><p className="text-xl font-bold">{stats?.scheduledInterviews ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">En attente</p><p className="text-xl font-bold">{stats?.pendingJobApplications ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux d'acceptation</p><p className="text-xl font-bold text-green-600">{acceptanceRate != null ? `${acceptanceRate}%` : "—"}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Note moyenne</p><p className="text-xl font-bold">{stats && stats.reviewCount > 0 ? stats.averageRating.toFixed(1) : "—"}</p></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Publications par mois (Offres / Missions)" icon={TrendingUp}>
              {jobPostsByMonth.every((h) => h.offers === 0 && h.missions === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={jobPostsByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="offers" name="Offres" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="missions" name="Missions" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
            <SectionCard title="Candidatures par mois" icon={Send}>
              {applicationsByMonth.every((h) => h.count === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={applicationsByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" name="Candidatures" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Candidatures par statut" icon={ClipboardList}>
              {(stats?.totalJobApplications ?? 0) === 0 ? <EmptyState message="Aucune candidature pour le moment." /> : (
                <div className="divide-y divide-border/40">
                  {(["PENDING", "PRESELECTED", "INTERVIEW_SCHEDULED", "ACCEPTED", "REJECTED"] as const).map((s) => (
                    <div key={s} className="flex items-center justify-between py-2 text-sm">
                      <Badge variant="outline" className={APPLICATION_STATUS_COLORS[s]}>{APPLICATION_STATUS_LABELS[s]}</Badge>
                      <span className="font-semibold">
                        {s === "PENDING" ? stats?.pendingJobApplications ?? 0
                          : s === "PRESELECTED" ? stats?.preselectedJobApplications ?? 0
                          : s === "INTERVIEW_SCHEDULED" ? stats?.interviewScheduledJobApplications ?? 0
                          : s === "ACCEPTED" ? stats?.acceptedJobApplications ?? 0
                          : stats?.rejectedJobApplications ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
            <SectionCard title="Meilleurs baristas (par évaluation)" icon={Award}>
              {topRatedBaristas.length === 0 ? <EmptyState message="Aucun avis pour le moment." /> : (
                <div className="divide-y divide-border/40">
                  {topRatedBaristas.map((b, i) => <RankRow key={b.userId} rank={i + 1} title={b.name} subtitle={`${b.reviewCount} avis`} value={`★ ${(b.rating / 10).toFixed(1)}`} />)}
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* ── Compétences / Niveau d'étude / Langue switcher ── */}
        <TabsContent value="skills" className="mt-4">
          <CompetencesSwitcher skills={data?.skills ?? []} onRefreshSkills={refresh} />
        </TabsContent>
      </Tabs>

      <BaristaDetail barista={selectedBarista} onClose={() => setSelectedBarista(null)} onRefresh={() => qc.invalidateQueries({ queryKey: ["/api/admin/barista"] })} />
      <JobPostDetail jobPost={selectedJobPost} onClose={() => setSelectedJobPost(null)} />
    </div>
  );
}
