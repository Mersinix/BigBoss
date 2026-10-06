import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import {
  Wrench, Users, Calendar, Clock, CheckCircle, XCircle, Star, Plus, Pencil,
  Trash2, Snowflake, Search, MapPin, Phone, Award, Briefcase, Timer, Image, Zap, Eye, X, Check,
  TrendingUp, Send, ClipboardList, GripVertical, RefreshCw,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/use-realtime";
import { AgentDetailModal } from "@/pages/cafe/maintenance/maintenance-page";
import { useMaintenanceJobTargets, useMaintenanceJobApplicationsForJob } from "@/hooks/use-maintenance-jobs";
import { PublicationStatusBadge } from "@/components/account/publication-status-badge";
import { useThemeStore } from "@/store/theme-store";
import { DashboardHero, SectionCard, RankRow, EmptyState, KpiOverviewButton, KpiOverviewModal } from "@/components/dashboard/dashboard-kit";
import { useIsMobile } from "@/hooks/use-mobile";

type TaxonomyItem = { id: number; name: string; icon?: string | null; isActive: boolean; isFrozen: boolean };
// Admin read-only visibility into the Maintenance job-posting system
// ("Interventions") — mirrors AdminJobPost in admin/barista-page.tsx, adapted
// to Maintenance's simpler field set (no recordType/openPositions/employmentTypes/
// educationLevels/languages/missionStartDate — see
// docs/maintenance_intervention_reservation_cleanup_audit.md Section 11).
type AdminMaintenanceJobPost = {
  id: number; cafeOwnerId: number; title: string; establishment: string; locationAddress: string;
  categories: string[]; urgency: string; description: string; requirements: string; contactPhone: string;
  scheduledDate: string | null; scheduledTime: string | null; expiresAt: string | null;
  publicationMode: "AUTOMATIC" | "MANUAL"; status: "DRAFT" | "PUBLISHED" | "CLOSED";
  createdAt: string | null; updatedAt: string | null;
  cafeOwnerName: string; totalApplications: number; pendingApplications: number;
  acceptedApplications: number; rejectedApplications: number; targetCount: number;
};
type Overview = {
  stats: {
    totalAccounts: number; activeAccounts: number; availableAccounts: number;
    totalReservations: number; pendingReservations: number; completedReservations: number;
    cancelledReservations: number; reviewCount: number; averageRating: number;
    totalInterventions: number; publishedInterventions: number; draftInterventions: number; closedInterventions: number;
    totalInterventionApplications: number; pendingInterventionApplications: number;
    acceptedInterventionApplications: number; rejectedInterventionApplications: number;
    interventionsOngoing: number; interventionsCompleted: number; interventionsCancelled: number;
  };
  categories: { category: string; count: number }[];
  taxonomy: { competencies: TaxonomyItem[]; zones: TaxonomyItem[] };
  accounts: any[];
  reservations: any[];
  reviews: any[];
  jobPosts: AdminMaintenanceJobPost[];
  jobApplications: any[];
};

// Same labels/colors as the Coffee Owner's maintenance-job-management-modal.tsx
// — Admin must read the exact same business states, never invent its own.
const JOB_POST_STATUS_LABELS: Record<string, string> = { DRAFT: "Brouillon", PUBLISHED: "Publiée", CLOSED: "Clôturée" };
const JOB_POST_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
  PUBLISHED: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  CLOSED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};
const PUBLICATION_MODE_LABELS: Record<string, string> = { AUTOMATIC: "Automatique", MANUAL: "Manuelle" };
const URGENCY_LABELS: Record<string, string> = { LOW: "Faible", NORMAL: "Normale", HIGH: "Élevée", URGENT: "Urgente" };
const APPLICATION_STATUS_LABELS: Record<string, string> = { PENDING: "En attente", ACCEPTED: "Acceptée", REJECTED: "Rejetée" };
const APPLICATION_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  ACCEPTED: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

function JobPostStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={JOB_POST_STATUS_COLORS[status] ?? ""}>{JOB_POST_STATUS_LABELS[status] ?? status}</Badge>;
}

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

function fmtPlainDate(value: string | null) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Intervention detail — read-only, mirrors admin/barista-page.tsx's
// JobPostDetail convention exactly ("No mutation path — Admin reviews the
// same rows the Coffee Owner's own job-management modal already manages"),
// extended with full Profils ciblés / Réponses sections per this task's own
// explicit spec (Section 14) rather than Barista's leaner count-only badge —
// uses the same live hooks the Coffee-Owner-facing modal already uses, now
// readable by Admin too (server/routes.ts GET /api/maintenance/jobs/:id/targets
// and /applications, both extended to allow isOwnerOrAdmin). ──

function MaintenanceJobPostDetail({ jobPost, onClose }: { jobPost: AdminMaintenanceJobPost | null; onClose: () => void }) {
  const { data: targets = [], isLoading: targetsLoading } = useMaintenanceJobTargets(jobPost && jobPost.publicationMode === "MANUAL" ? jobPost.id : null);
  const { data: applications = [], isLoading: appsLoading } = useMaintenanceJobApplicationsForJob(jobPost?.id ?? null);
  if (!jobPost) return null;
  const expiry = fmtPlainDate(jobPost.expiresAt);
  const scheduled = jobPost.scheduledDate ? `${fmtPlainDate(jobPost.scheduledDate)}${jobPost.scheduledTime ? ` à ${jobPost.scheduledTime}` : ""}` : null;
  const created = fmtPlainDate(jobPost.createdAt);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="flex-1 min-w-0 truncate">{jobPost.title}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <JobPostStatusBadge status={jobPost.status} />
            <Badge variant="secondary" className="text-xs">{PUBLICATION_MODE_LABELS[jobPost.publicationMode] ?? jobPost.publicationMode}</Badge>
            <Badge variant="outline" className="text-xs">{jobPost.totalApplications} réponse{jobPost.totalApplications > 1 ? "s" : ""}</Badge>
            <Badge variant="outline" className="text-xs">{jobPost.pendingApplications} en attente</Badge>
            <Badge variant="outline" className="text-xs">{jobPost.acceptedApplications} acceptée{jobPost.acceptedApplications > 1 ? "s" : ""}</Badge>
            <Badge variant="outline" className="text-xs">{jobPost.rejectedApplications} rejetée{jobPost.rejectedApplications > 1 ? "s" : ""}</Badge>
            {jobPost.publicationMode === "MANUAL" && (
              <Badge variant="outline" className="text-xs">{jobPost.targetCount} profil{jobPost.targetCount > 1 ? "s" : ""} ciblé{jobPost.targetCount > 1 ? "s" : ""}</Badge>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><p className="text-xs text-muted-foreground">Café / Coffee Owner</p><p className="font-medium">{jobPost.cafeOwnerName || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Établissement</p><p className="font-medium">{jobPost.establishment || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Localisation</p><p>{jobPost.locationAddress || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Catégorie</p><p>{jobPost.categories.length ? jobPost.categories.join(", ") : "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Urgence</p><p>{URGENCY_LABELS[jobPost.urgency] ?? jobPost.urgency}</p></div>
            <div><p className="text-xs text-muted-foreground">Date / heure</p><p>{scheduled ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Téléphone de contact</p><p>{jobPost.contactPhone || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Date d'expiration</p><p>{expiry ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Mode de publication</p><p>{PUBLICATION_MODE_LABELS[jobPost.publicationMode] ?? jobPost.publicationMode}</p></div>
            <div><p className="text-xs text-muted-foreground">Créée le</p><p>{created ?? "—"}</p></div>
          </div>
          <div><p className="text-xs text-muted-foreground">Description</p><p className="whitespace-pre-wrap">{jobPost.description || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Exigences</p><p className="whitespace-pre-wrap">{jobPost.requirements || "—"}</p></div>

          {jobPost.publicationMode === "MANUAL" && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Profils ciblés ({targets.length})</p>
              {targetsLoading ? <p className="text-xs text-muted-foreground">Chargement…</p> : targets.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun profil ciblé.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {targets.map((t: any) => (
                    <div key={t.id} className="flex items-center gap-2 rounded-full border pl-1 pr-3 py-1">
                      <Avatar className="w-6 h-6">
                        {t.maintenanceProfileImageUrl && <AvatarImage src={t.maintenanceProfileImageUrl} alt={t.maintenanceName} className="object-cover" />}
                        <AvatarFallback className="bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 text-[10px] font-bold">
                          {t.maintenanceName.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium">{t.maintenanceName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Réponses ({applications.length})</p>
            {appsLoading ? <p className="text-xs text-muted-foreground">Chargement…</p> : applications.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucune réponse pour le moment.</p>
            ) : (
              <div className="space-y-2">
                {applications.map((app: any) => (
                  <div key={app.id} className="rounded-lg border p-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{app.maintenanceName}</p>
                      {app.message && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{app.message}</p>}
                    </div>
                    <Badge variant="secondary" className={`${APPLICATION_STATUS_COLORS[app.status] ?? ""} shrink-0`}>{APPLICATION_STATUS_LABELS[app.status] ?? app.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stars({ value }: { value: number }) {
  return <span className="inline-flex items-center gap-0.5 text-amber-500">
    <Star className="h-3.5 w-3.5 fill-current" /> {value ? (value / 10).toFixed(1) : "—"}
  </span>;
}

function TaxonomyList({ title, items, kind, onRefresh }: {
  title: string; items: TaxonomyItem[]; kind: "competencies" | "zones"; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [draftIcon, setDraftIcon] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [iconEditing, setIconEditing] = useState<number | null>(null);
  const [iconEditValue, setIconEditValue] = useState("");
  const path = kind === "competencies" ? "competencies" : "zones";
  const create = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/maintenance/${path}`, { name: draft.trim(), ...(kind === "competencies" ? { icon: draftIcon.trim() || null } : {}) }),
    onSuccess: () => { setDraft(""); setDraftIcon(""); onRefresh(); toast({ title: "Ajouté" }); },
    onError: (e: any) => toast({ title: "Impossible d'ajouter", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/maintenance/${path}/${id}`, data),
    onSuccess: () => { setEditing(null); setIconEditing(null); onRefresh(); },
    onError: () => toast({ title: "Mise à jour impossible", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/maintenance/${path}/${id}`),
    onSuccess: onRefresh,
    onError: () => toast({ title: "Suppression impossible", variant: "destructive" }),
  });
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex gap-2">
        {kind === "competencies" && (
          <Input value={draftIcon} onChange={(e) => setDraftIcon(e.target.value)} placeholder="☕" className="w-14 text-center text-lg shrink-0" data-testid="input-competency-draft-icon" />
        )}
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Ajouter ${kind === "zones" ? "une zone" : "une compétence"}`} onKeyDown={(e) => e.key === "Enter" && draft.trim() && create.mutate()} />
        <Button size="sm" disabled={!draft.trim() || create.isPending} onClick={() => create.mutate()}><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Aucune donnée.</p> : items.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2">
        {kind === "competencies" && (
          iconEditing === item.id ? (
            <Input autoFocus value={iconEditValue} onChange={(e) => setIconEditValue(e.target.value)} onKeyDown={(e) => {
              if (e.key === "Enter") update.mutate({ id: item.id, data: { icon: iconEditValue.trim() || null } });
              if (e.key === "Escape") setIconEditing(null);
            }} onBlur={() => update.mutate({ id: item.id, data: { icon: iconEditValue.trim() || null } })} className="w-12 text-center text-lg shrink-0 p-1" />
          ) : (
            <button
              type="button"
              title="Modifier l'icône"
              className="w-8 h-8 shrink-0 flex items-center justify-center text-lg rounded-md hover:bg-muted"
              onClick={() => { setIconEditing(item.id); setIconEditValue(item.icon ?? ""); }}
              data-testid={`button-edit-competency-icon-${item.id}`}
            >
              {item.icon || <Wrench className="h-4 w-4 text-muted-foreground" />}
            </button>
          )
        )}
        {editing === item.id ? <Input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => {
          if (e.key === "Enter" && editValue.trim()) update.mutate({ id: item.id, data: { name: editValue.trim() } });
          if (e.key === "Escape") setEditing(null);
        }} /> : <span className="flex-1 text-sm font-medium">{item.name}</span>}
        {item.isFrozen && <Badge variant="outline" className="text-xs text-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé</Badge>}
        {!item.isActive && <Badge variant="secondary" className="text-xs">Inactif</Badge>}
        {editing === item.id ? <Button size="sm" onClick={() => editValue.trim() && update.mutate({ id: item.id, data: { name: editValue.trim() } })}>OK</Button> : <Button variant="ghost" size="icon" onClick={() => { setEditing(item.id); setEditValue(item.name); }}><Pencil className="h-3.5 w-3.5" /></Button>}
        <Button variant="ghost" size="icon" title={item.isFrozen ? "Dégeler" : "Geler"} onClick={() => update.mutate({ id: item.id, data: { isFrozen: !item.isFrozen } })}><Snowflake className={`h-3.5 w-3.5 ${item.isFrozen ? "text-blue-600" : ""}`} /></Button>
        <Button variant="ghost" size="icon" title={item.isActive ? "Désactiver" : "Activer"} onClick={() => update.mutate({ id: item.id, data: { isActive: !item.isActive } })}><CheckCircle className={`h-3.5 w-3.5 ${item.isActive ? "text-green-600" : "text-muted-foreground"}`} /></Button>
        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove.mutate(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>)}
    </CardContent>
  </Card>;
}

function AccountDetail({ account, onClose, onRefresh }: { account: any | null; onClose: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const isDark = useThemeStore((s) => s.isDark);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // "Aperçu marketplace" — reuses the exact same card + modal a Coffee Owner sees
  // (see maintenance/profile.tsx's own self-preview), never a separate Admin-only view.
  const { data: previewData } = useQuery<{ card: any }>({
    queryKey: ["/api/maintenance/profile", account?.userId],
    queryFn: async () => {
      const response = await fetch(`/api/maintenance/profile/${account.userId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load profile");
      return response.json();
    },
    enabled: previewOpen && !!account?.userId,
  });

  const startEdit = () => {
    setForm({
      name: account.name, phone: account.phone ?? "", jobTitle: account.jobTitle,
      dailyRateInCents: String((account.dailyRateInCents ?? 0) / 100), coverageArea: account.coverageArea ?? "",
      description: account.description ?? "", yearsExperience: String(account.yearsExperience ?? 0),
    });
    setEditing(true);
  };
  const editMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/maintenance/accounts/${account.userId}`, {
      name: form.name, phone: form.phone, jobTitle: form.jobTitle, coverageArea: form.coverageArea,
      description: form.description, yearsExperience: Number(form.yearsExperience) || 0,
      dailyRateInCents: Math.round(parseFloat(form.dailyRateInCents || "0") * 100),
    }),
    onSuccess: () => { setEditing(false); onRefresh(); toast({ title: "Compte mis à jour" }); },
    onError: (e: any) => toast({ title: "Mise à jour impossible", description: e.message, variant: "destructive" }),
  });
  const freezeMutation = useMutation({
    mutationFn: (isFrozen: boolean) => apiRequest("PATCH", `/api/admin/maintenance/accounts/${account.userId}/freeze`, { isFrozen }),
    onSuccess: () => { onRefresh(); toast({ title: account.isFrozen ? "Compte dégelé" : "Compte gelé" }); },
    onError: (e: any) => toast({ title: "Action impossible", description: e.message, variant: "destructive" }),
  });
  // GO Live review (Phase 5D) — approve/reject the submitted PROFILE CONTENT,
  // distinct from both account registration approval and the Freeze kill-switch above.
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const publicationMutation = useMutation({
    mutationFn: (data: { decision: "APPROVED" | "REJECTED"; rejectionReason?: string }) =>
      apiRequest("PATCH", `/api/admin/maintenance/accounts/${account.userId}/publication`, data),
    onSuccess: (_d, vars) => { onRefresh(); setRejecting(false); setRejectionReason(""); toast({ title: vars.decision === "APPROVED" ? "Profil approuvé et publié" : "Profil refusé" }); },
    onError: (e: any) => toast({ title: "Action impossible", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/users/${account.userId}`),
    onSuccess: () => { onRefresh(); onClose(); toast({ title: "Compte supprimé" }); },
    onError: (e: any) => toast({ title: "Suppression impossible", description: e.message, variant: "destructive" }),
  });
  const autoApproveMutation = useMutation({
    mutationFn: (autoApprove: boolean) => apiRequest("PATCH", `/api/admin/maintenance/accounts/${account.userId}/auto-approve`, { autoApprove }),
    onSuccess: () => { onRefresh(); toast({ title: "Auto Approve mis à jour" }); },
    onError: (e: any) => toast({ title: "Action impossible", description: e.message, variant: "destructive" }),
  });

  if (!account) return null;
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    {/* Thin scrollbar treatment — matches the existing Admin Order Details modal's own
        scroll container exactly, same thumb/track/hover classes, not a new scrollbar style. */}
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
      {/* Cover header — visually synchronized with the existing Preview Detail modal
          (AgentDetailModal's own cover + close/preview buttons), see
          docs/service_card_reorder_and_detail_modal_audit.md Part 3. */}
      <div className="w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden bg-gray-100 dark:bg-gray-800">
        {account.coverImageUrl ? (
          <img src={account.coverImageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-600 to-amber-700">
            <Wrench className="w-16 h-16 text-white" />
          </div>
        )}
        <div className="absolute top-3 right-3 flex gap-2">
          <button type="button" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform" onClick={() => setPreviewOpen(true)} title="Aperçu marketplace" aria-label="Aperçu marketplace" data-testid="button-preview-maintenance-marketplace">
            <Eye className="w-4 h-4 text-white" />
          </button>
          <button type="button" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform" onClick={onClose} aria-label="Close" data-testid="button-close-maintenance-account-detail">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
      <div className="p-5 sm:p-6">
      <DialogHeader><DialogTitle className="flex items-center gap-3">
        <Avatar><AvatarImage src={getAvatarUrl(account)} alt={account.name} /><AvatarFallback className="bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 font-bold">{account.initials}</AvatarFallback></Avatar>
        <span className="flex-1">{account.name}</span>
      </DialogTitle></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-4 text-sm mt-4">
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <Badge variant="outline">{account.status}</Badge><Badge variant="secondary">{account.profileType}</Badge>
          <Badge className={account.marketplaceVisible ? "bg-green-600" : ""}>{account.marketplaceVisible ? "Visible marketplace" : "Masqué"}</Badge>
          <Badge variant="outline">{account.available ? "Disponible" : "Indisponible"}</Badge>
          {account.isFrozen && <Badge className="bg-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé par l'Admin</Badge>}
          <PublicationStatusBadge status={account.publicationStatus ?? "DRAFT"} />
        </div>
        {account.publicationStatus === "REJECTED" && account.publicationRejectionReason && (
          <div className="sm:col-span-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg p-2">
            Motif du refus précédent : {account.publicationRejectionReason}
          </div>
        )}

        {editing ? (
          <div className="sm:col-span-2 space-y-2 rounded-lg border p-3">
            <div className="grid sm:grid-cols-2 gap-2">
              <div><label className="text-xs text-muted-foreground">Nom</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Téléphone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Poste</label><Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Zone de couverture</label><Input value={form.coverageArea} onChange={(e) => setForm({ ...form, coverageArea: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Expérience (ans)</label><Input type="number" min={0} value={form.yearsExperience} onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Tarif journalier (DT)</label><Input type="number" min={0} value={form.dailyRateInCents} onChange={(e) => setForm({ ...form, dailyRateInCents: e.target.value })} /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">Description</label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
              <Button size="sm" disabled={editMutation.isPending} onClick={() => editMutation.mutate()}>{editMutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button>
            </div>
          </div>
        ) : <>
          <Info icon={Briefcase} label="Poste" value={account.jobTitle} />
          <Info icon={MapPin} label="Zone / localisation" value={account.location || account.coverageArea} />
          <Info icon={Phone} label="Téléphone" value={account.phone} />
          <Info icon={Timer} label="Temps de réponse" value={account.responseTime} />
          <Info icon={Award} label="Expérience" value={`${account.yearsExperience} ans`} />
          <Info icon={Star} label="Évaluation" value={<><Stars value={account.rating} /> ({account.reviewCount} avis)</>} />
          <Info icon={MapPin} label="Zone de couverture" value={account.coverageArea} />
          <div><p className="text-xs text-muted-foreground mb-1">Compétences / catégories</p><div className="flex flex-wrap gap-1">{[...(account.categories ?? []), ...(account.skills ?? [])].map((x: string) => <Badge key={x} variant="secondary" className="text-xs">{x}</Badge>)}</div></div>
          <div><p className="text-xs text-muted-foreground mb-1">Certifications</p><p>{(account.certifications ?? []).join(", ") || "—"}</p></div>
          <div className="sm:col-span-2"><p className="text-xs text-muted-foreground mb-1">Description</p><p className="whitespace-pre-wrap">{account.description || "—"}</p></div>
          <Info icon={Calendar} label="Jours et horaires" value={`${(account.workingDays ?? []).join(", ") || "—"} · ${account.startTime}–${account.endTime}`} />
          <Info icon={Wrench} label="Tarif journalier" value={`${((account.dailyRateInCents ?? 0) / 100).toFixed(2)} DT`} />
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Image className="h-3.5 w-3.5" />Portfolio</p>
            {(account.portfolioImages ?? []).length > 0
              ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{account.portfolioImages.map((src: string, index: number) => <img key={`${src}-${index}`} src={src} alt={`Portfolio ${index + 1}`} className="h-24 w-full rounded-lg object-cover" />)}</div>
              : <p>—</p>}
          </div>
        </>}

        {account.publicationStatus === "PENDING" && (
          <div className="sm:col-span-2 rounded-lg border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-2">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Demande de publication en attente — vérifiez le profil ci-dessus avant de décider.</p>
            {rejecting ? (
              <div className="space-y-2">
                <Textarea placeholder="Motif du refus (visible par le professionnel)…" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={2} />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setRejectionReason(""); }}>Annuler</Button>
                  <Button size="sm" variant="destructive" disabled={publicationMutation.isPending} onClick={() => publicationMutation.mutate({ decision: "REJECTED", rejectionReason })} data-testid="button-reject-maintenance-publication">
                    {publicationMutation.isPending ? "…" : "Confirmer le refus"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => setRejecting(true)} data-testid="button-start-reject-maintenance-publication">
                  <X className="h-3.5 w-3.5 mr-1.5" />Refuser
                </Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={publicationMutation.isPending} onClick={() => publicationMutation.mutate({ decision: "APPROVED" })} data-testid="button-approve-maintenance-publication">
                  <Check className="h-3.5 w-3.5 mr-1.5" />{publicationMutation.isPending ? "…" : "Approuver"}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="sm:col-span-2 flex items-center justify-between rounded-xl border p-3 bg-muted/30">
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />Auto Approve
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lorsqu'activé, ce professionnel de maintenance peut modifier son profil sans nécessiter une nouvelle validation Admin.
            </p>
          </div>
          <Switch
            checked={account.autoApprove ?? false}
            onCheckedChange={(v) => autoApproveMutation.mutate(v)}
            disabled={autoApproveMutation.isPending}
            data-testid={`switch-auto-approve-maintenance-${account.userId}`}
          />
        </div>

        <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          {!editing && <Button size="sm" variant="outline" onClick={startEdit} data-testid="button-edit-maintenance-account"><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Button>}
          <Button size="sm" variant="outline" disabled={freezeMutation.isPending} onClick={() => freezeMutation.mutate(!account.isFrozen)} data-testid="button-freeze-maintenance-account">
            <Snowflake className={`h-3.5 w-3.5 mr-1.5 ${account.isFrozen ? "text-blue-600" : ""}`} />{account.isFrozen ? "Dégeler" : "Freeze"}
          </Button>
          {!confirmDelete ? (
            <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => setConfirmDelete(true)} data-testid="button-delete-maintenance-account">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
            </Button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 p-2">
              <span className="text-xs text-destructive">Confirmer la suppression définitive ?</span>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Annuler</Button>
              <Button size="sm" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()} data-testid="button-confirm-delete-maintenance-account">
                {deleteMutation.isPending ? "Suppression…" : "Confirmer"}
              </Button>
            </div>
          )}
        </div>
      </div>
      </div>
      <AgentDetailModal
        agent={previewData?.card ?? null}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onContact={() => {}}
        isDark={isDark}
        readOnly
      />
    </DialogContent>
  </Dialog>;
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return <div className="flex gap-2"><Icon className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">{label}</p><p>{value || "—"}</p></div></div>;
}

// Part 7 — reuses the existing generic Admin account-creation endpoint
// (POST /api/admin/users, already handles role="MAINTENANCE" by also creating
// the maintenanceProfiles row — see storage.createUser) rather than a second
// Maintenance-specific creation path.
function AddMaintenanceAccountModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", jobTitle: "Technicien de maintenance", profileType: "Freelance" });
  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/users", { ...form, role: "MAINTENANCE" }),
    onSuccess: async (res) => {
      const created = await res.json();
      if (form.jobTitle || form.profileType) {
        await apiRequest("PATCH", `/api/admin/maintenance/accounts/${created.id}`, { jobTitle: form.jobTitle, profileType: form.profileType }).catch(() => {});
      }
      onCreated();
      onClose();
      setForm({ name: "", email: "", password: "", phone: "", jobTitle: "Technicien de maintenance", profileType: "Freelance" });
      toast({ title: "Compte Maintenance créé" });
    },
    onError: (e: any) => toast({ title: "Création impossible", description: e.message, variant: "destructive" }),
  });
  const valid = form.name.trim().length >= 2 && form.email.includes("@") && form.password.length >= 6;
  return <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
    <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
      <DialogHeader><DialogTitle>Ajouter un compte Maintenance</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><label className="text-xs text-muted-foreground">Nom / Structure</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-add-maintenance-name" /></div>
        <div><label className="text-xs text-muted-foreground">Email</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-add-maintenance-email" /></div>
        <div><label className="text-xs text-muted-foreground">Mot de passe</label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="input-add-maintenance-password" /></div>
        <div><label className="text-xs text-muted-foreground">Téléphone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-add-maintenance-phone" /></div>
        <div><label className="text-xs text-muted-foreground">Poste</label><Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
        <div>
          <label className="text-xs text-muted-foreground">Type</label>
          <Select value={form.profileType} onValueChange={(v) => setForm({ ...form, profileType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Freelance">Freelance</SelectItem><SelectItem value="Company">Entreprise</SelectItem><SelectItem value="Agency">Agence</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()} data-testid="button-submit-add-maintenance">{create.isPending ? "Création…" : "Créer le compte"}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

// The old reservation-list cards + Admin-only edit/freeze/delete detail modal
// ("Réservations récentes" tab) were removed here
// (docs/maintenance_pricing_admin_performance_audit.md Section 5/11) — the
// backend routes (PATCH/DELETE /api/admin/maintenance/reservations/:id(/freeze))
// and the underlying maintenanceReservations rows are fully preserved, this
// only removes the dedicated browsing UI in favor of the Interventions tab.

export default function MaintenanceAdminPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  useRealtime();
  const isMobile = useIsMobile();
  const [kpiModalOpen, setKpiModalOpen] = useState(false);
  // Default tab reordered to "accounts" (Comptes Maintenance → Interventions →
  // Compétences & zones → Analytics — docs/maintenance_pricing_admin_performance_audit.md
  // Section 6).
  const [section, setSection] = useState("accounts");
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [selectedJobPost, setSelectedJobPost] = useState<AdminMaintenanceJobPost | null>(null);
  const [jobPostStatusFilter, setJobPostStatusFilter] = useState("all");
  // Interventions tab filters (Section 12 of the audit — only filters backed
  // by real, already-fetched data, no extra queries).
  const [jobPostSearch, setJobPostSearch] = useState("");
  const [jobPostPublicationMode, setJobPostPublicationMode] = useState("all");
  const [jobPostCategory, setJobPostCategory] = useState("all");
  const [jobPostUrgency, setJobPostUrgency] = useState("all");
  const [jobPostLocation, setJobPostLocation] = useState("all");
  const [jobPostSearchOpen, setJobPostSearchOpen] = useState(false);
  const jobPostSearchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [accountSearchOpen, setAccountSearchOpen] = useState(false);
  const accountSearchInputRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop order (mirrors admin/stores-page.tsx's StoreCard pattern) — persisted
  // via displayOrder directly on maintenanceProfiles (no Store), which also drives
  // the Coffee Owner /maintenance professional-card order.
  const [accountOrderedIds, setAccountOrderedIds] = useState<number[] | null>(null);
  const accountDragIdRef = useRef<number | null>(null);
  const [status, setStatus] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [profileType, setProfileType] = useState("all");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("all");
  const [rating, setRating] = useState("all");
  const { data, isLoading } = useQuery<Overview>({ queryKey: ["/api/admin/maintenance"] });
  useEffect(() => {
    if (!selectedAccount) return;
    const freshAccount = data?.accounts?.find((account) => account.userId === selectedAccount.userId);
    if (freshAccount && freshAccount !== selectedAccount) setSelectedAccount(freshAccount);
  }, [data?.accounts, selectedAccount?.userId]);
  useEffect(() => {
    if (!selectedJobPost) return;
    const fresh = data?.jobPosts?.find((row) => row.id === selectedJobPost.id);
    if (fresh && fresh !== selectedJobPost) setSelectedJobPost(fresh);
  }, [data?.jobPosts, selectedJobPost?.id]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/maintenance"] });
    qc.invalidateQueries({ queryKey: ["/api/maintenance/categories"] });
    qc.invalidateQueries({ queryKey: ["/api/maintenance/taxonomy"] });
  };

  const accountBulkOrderMutation = useMutation({
    mutationFn: (orders: { id: number; displayOrder: number }[]) => apiRequest("PATCH", "/api/admin/maintenance/accounts/bulk-order", { orders }),
    onSuccess: () => {
      refresh();
      qc.invalidateQueries({ queryKey: ["/api/maintenance/profiles"] });
      toast({ title: "Ordre enregistré" });
    },
    onError: () => toast({ title: "Échec de l'enregistrement de l'ordre", variant: "destructive" }),
  });
  const stats = data?.stats;
  const filterOptions = useMemo(() => {
    const accounts = data?.accounts ?? [];
    return {
      types: Array.from(new Set(accounts.map((a) => a.profileType).filter(Boolean))).sort(),
      categories: Array.from(new Set(accounts.flatMap((a) => [...(a.categories ?? []), ...(a.skills ?? [])]))).sort(),
      locations: Array.from(new Set(accounts.flatMap((a) => (a.coverageArea || a.location || "").split(",").map((x: string) => x.trim()).filter(Boolean)))).sort(),
    };
  }, [data?.accounts]);
  // Use accountOrderedIds (optimistic, after a drag) when available, otherwise fall
  // back to server order (displayOrder) — mirrors admin/stores-page.tsx exactly.
  const sortedAccounts = useMemo(() => {
    const all = data?.accounts ?? [];
    return accountOrderedIds
      ? [...all].sort((a, b) => accountOrderedIds.indexOf(a.userId) - accountOrderedIds.indexOf(b.userId))
      : [...all].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [data?.accounts, accountOrderedIds]);
  const accounts = useMemo(() => sortedAccounts.filter((a) => {
    const haystack = [a.name, a.jobTitle, a.location, a.coverageArea, ...(a.categories ?? []), ...(a.skills ?? [])].join(" ").toLowerCase();
    const zones = (a.coverageArea || a.location || "").split(",").map((x: string) => x.trim());
    const accountRating = (a.rating ?? 0) / 10;
    return (!search || haystack.includes(search.toLowerCase()))
      && (status === "all" || a.status === status)
      && (availability === "all" || (availability === "available" ? a.available : !a.available))
      && (visibility === "all" || (visibility === "visible" ? a.marketplaceVisible : !a.marketplaceVisible))
      && (profileType === "all" || a.profileType === profileType)
      && (category === "all" || [...(a.categories ?? []), ...(a.skills ?? [])].includes(category))
      && (location === "all" || zones.includes(location))
      && (rating === "all" || (rating === "rated" ? accountRating > 0 : accountRating >= Number(rating)));
  }), [sortedAccounts, search, status, availability, visibility, profileType, category, location, rating]);
  const accountsPagination = usePagination(accounts.length);
  useEffect(() => { accountsPagination.resetPage(); }, [search, status, availability, visibility, profileType, category, location, rating]);
  const pageAccounts = accounts.slice(accountsPagination.start, accountsPagination.end);

  // Drag handlers — identical shape to admin/stores-page.tsx's handleDragStart/Over/Drop.
  const handleAccountDragStart = (e: React.DragEvent, id: number) => {
    accountDragIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
  };
  const handleAccountDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleAccountDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    const fromId = accountDragIdRef.current;
    if (fromId === null || fromId === targetId) return;
    const base = accountOrderedIds ?? sortedAccounts.map((a) => a.userId);
    const from = base.indexOf(fromId);
    const to = base.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...base];
    next.splice(from, 1);
    next.splice(to, 0, fromId);
    setAccountOrderedIds(next);
    accountBulkOrderMutation.mutate(next.map((id, idx) => ({ id, displayOrder: idx })));
    accountDragIdRef.current = null;
  };

  // Interventions tab — filter options derived from already-fetched jobPosts,
  // same comma-split-dropdown convention as the Comptes Maintenance tab above
  // (Section 12 of the audit).
  const jobPostFilterOptions = useMemo(() => {
    const rows = data?.jobPosts ?? [];
    return {
      categories: Array.from(new Set(rows.flatMap((j) => j.categories ?? []))).sort(),
      locations: Array.from(new Set(rows.flatMap((j) => (j.locationAddress || "").split(",").map((x) => x.trim()).filter(Boolean)))).sort(),
    };
  }, [data?.jobPosts]);
  const jobPosts = useMemo(() => {
    const rows = data?.jobPosts ?? [];
    return rows.filter((j) => {
      const haystack = [j.title, j.establishment, j.cafeOwnerName].join(" ").toLowerCase();
      const zones = (j.locationAddress || "").split(",").map((x) => x.trim());
      return (!jobPostSearch || haystack.includes(jobPostSearch.toLowerCase()))
        && (jobPostStatusFilter === "all" || j.status === jobPostStatusFilter)
        && (jobPostPublicationMode === "all" || j.publicationMode === jobPostPublicationMode)
        && (jobPostCategory === "all" || j.categories.includes(jobPostCategory))
        && (jobPostUrgency === "all" || j.urgency === jobPostUrgency)
        && (jobPostLocation === "all" || zones.includes(jobPostLocation));
    });
  }, [data?.jobPosts, jobPostSearch, jobPostStatusFilter, jobPostPublicationMode, jobPostCategory, jobPostUrgency, jobPostLocation]);
  const jobPostsPagination = usePagination(jobPosts.length);
  useEffect(() => { jobPostsPagination.resetPage(); }, [jobPostSearch, jobPostStatusFilter, jobPostPublicationMode, jobPostCategory, jobPostUrgency, jobPostLocation]);
  const pageJobPosts = jobPosts.slice(jobPostsPagination.start, jobPostsPagination.end);

  // ── Analytics tab — bucketed client-side from the full jobPosts/jobApplications
  // lists, same approach admin/barista-page.tsx already uses (Section 9 of the
  // audit). No revenue-based metric — Maintenance's job-posting system has no
  // numeric price field (same reasoning Barista's own cleanup already applied). ──
  const jobPostsByMonth = useMemo(() => {
    const months = monthBucketKeys(6);
    const byMonth = new Map<string, number>();
    for (const j of data?.jobPosts ?? []) {
      if (!j.createdAt) continue;
      const d = new Date(j.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }
    return months.map(({ key, label }) => ({ month: label, count: byMonth.get(key) ?? 0 }));
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
  const acceptanceRate = stats && stats.totalInterventionApplications > 0
    ? Math.round((stats.acceptedInterventionApplications / stats.totalInterventionApplications) * 100) : null;
  // Non-revenue-based ranking — same "rank by rating instead of revenue"
  // precedent already used by admin/barista-page.tsx's own Analytics tab.
  const topRatedAccounts = useMemo(
    () => (data?.accounts ?? []).filter((a) => a.reviewCount > 0).slice().sort((a, b) => b.rating - a.rating).slice(0, 5),
    [data?.accounts],
  );

  const kpis = [
    ["Comptes Maintenance", stats?.totalAccounts ?? 0, Users], ["Actifs / approuvés", stats?.activeAccounts ?? 0, CheckCircle],
    ["Disponibles", stats?.availableAccounts ?? 0, Wrench], ["Interventions", stats?.totalInterventions ?? 0, Briefcase],
    ["En attente", stats?.pendingInterventionApplications ?? 0, Clock], ["En cours", stats?.interventionsOngoing ?? 0, Timer],
    ["Terminées", stats?.interventionsCompleted ?? 0, CheckCircle], ["Annulées", stats?.interventionsCancelled ?? 0, XCircle],
  ] as const;
  return <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
    <DashboardHero
      title={<span className="flex items-center gap-2"><Wrench className="w-6 h-6 text-orange-600" />Maintenance</span>}
      subtitle="Suivi du marketplace Maintenance, des comptes, interventions et avis."
      gradientClass="bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent border-orange-500/20"
      action={isMobile && <KpiOverviewButton onClick={() => setKpiModalOpen(true)} />}
    />
    {!isMobile && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{kpis.map(([label, value, Icon]) => <Card key={label}><CardContent className="p-4 flex items-center gap-3"><div className="rounded-xl bg-orange-500/10 p-2.5"><Icon className="w-4 h-4 text-orange-600" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{isLoading ? "…" : value}</p></div></CardContent></Card>)}</div>
    )}
    <KpiOverviewModal open={isMobile && kpiModalOpen} onClose={() => setKpiModalOpen(false)}>
      <div className="grid grid-cols-2 gap-3">{kpis.map(([label, value, Icon]) => <Card key={label}><CardContent className="p-4 flex items-center gap-3"><div className="rounded-xl bg-orange-500/10 p-2.5"><Icon className="w-4 h-4 text-orange-600" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{isLoading ? "…" : value}</p></div></CardContent></Card>)}</div>
    </KpiOverviewModal>
    <Tabs value={section} onValueChange={setSection}>
      {/* Switcher — same visual/scrolling design as the Admin System Management switcher:
          hidden-scrollbar horizontal scroll on mobile, pill container, active tab in a
          bg-background/shadow-sm chip. */}
      <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        <TabsList className="flex items-center justify-start gap-1 bg-secondary/40 rounded-xl p-1 h-auto w-max min-w-full sm:w-fit">
          <TabsTrigger value="accounts" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Comptes Maintenance</TabsTrigger>
          <TabsTrigger value="interventions" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Interventions</TabsTrigger>
          <TabsTrigger value="taxonomy" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Compétences & zones</TabsTrigger>
          <TabsTrigger value="analytics" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Analytics</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="taxonomy" className="mt-4 grid lg:grid-cols-2 gap-6">
        <TaxonomyList title="Compétences demandées" kind="competencies" items={data?.taxonomy?.competencies ?? []} onRefresh={refresh} />
        <TaxonomyList title="Zone d'intervention" kind="zones" items={data?.taxonomy?.zones ?? []} onRefresh={refresh} />
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Demandes par compétence</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{(data?.categories ?? []).map((row) => <Badge key={row.category} variant="secondary">{row.category} · {row.count}</Badge>)}</CardContent></Card>
      </TabsContent>
      <TabsContent value="accounts" className="mt-4 space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddAccountOpen(true)} data-testid="button-add-maintenance-account"><Plus className="h-4 w-4 mr-1.5" />Ajouter un compte Maintenance</Button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0 sm:mb-0" style={{ scrollbarWidth: "none" }}>
          <div className="relative shrink-0 sm:flex-1 sm:min-w-[220px]">
            {!accountSearchOpen && (
              <button
                type="button"
                className="sm:hidden w-9 h-9 flex items-center justify-center rounded-md border border-input text-muted-foreground"
                onClick={() => { setAccountSearchOpen(true); setTimeout(() => accountSearchInputRef.current?.focus(), 0); }}
                aria-label="Ouvrir la recherche"
                data-testid="button-open-maintenance-account-search"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
            <div className={`${accountSearchOpen ? "flex" : "hidden"} sm:flex items-center relative w-48 sm:w-auto`}>
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={accountSearchInputRef}
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => { if (!search) setAccountSearchOpen(false); }}
                placeholder="Rechercher un compte, une zone, une compétence…"
              />
            </div>
          </div>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[150px] shrink-0"><SelectValue placeholder="Statut" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="approved">Approuvé</SelectItem><SelectItem value="pending">En attente</SelectItem><SelectItem value="rejected">Rejeté</SelectItem></SelectContent></Select>
          <Select value={visibility} onValueChange={setVisibility}><SelectTrigger className="w-[150px] shrink-0"><SelectValue placeholder="Visibilité" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes visibilités</SelectItem><SelectItem value="visible">Visible</SelectItem><SelectItem value="hidden">Masqué</SelectItem></SelectContent></Select>
          <Select value={availability} onValueChange={setAvailability}><SelectTrigger className="w-[160px] shrink-0"><SelectValue placeholder="Disponibilité" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes disponibilités</SelectItem><SelectItem value="available">Disponibles</SelectItem><SelectItem value="unavailable">Indisponibles</SelectItem></SelectContent></Select>
          <Select value={profileType} onValueChange={setProfileType}><SelectTrigger className="w-[140px] shrink-0"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les types</SelectItem>{filterOptions.types.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-[180px] shrink-0"><SelectValue placeholder="Compétence" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes compétences</SelectItem>{filterOptions.categories.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={location} onValueChange={setLocation}><SelectTrigger className="w-[160px] shrink-0"><SelectValue placeholder="Zone" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les zones</SelectItem>{filterOptions.locations.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={rating} onValueChange={setRating}><SelectTrigger className="w-[150px] shrink-0"><SelectValue placeholder="Note" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les notes</SelectItem><SelectItem value="rated">Avec avis</SelectItem><SelectItem value="4">4+ étoiles</SelectItem><SelectItem value="3">3+ étoiles</SelectItem></SelectContent></Select>
          {(search || status !== "all" || visibility !== "all" || availability !== "all" || profileType !== "all" || category !== "all" || location !== "all" || rating !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground shrink-0"
              onClick={() => { setSearch(""); setStatus("all"); setVisibility("all"); setAvailability("all"); setProfileType("all"); setCategory("all"); setLocation("all"); setRating("all"); }}
              data-testid="button-clear-maintenance-account-filters"
            >
              <X className="w-3.5 h-3.5" /> Effacer
            </Button>
          )}
        </div>
        {accounts.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucun compte correspondant.</CardContent></Card> : (<>
          {accountBulkOrderMutation.isPending && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
              <RefreshCw className="w-3 h-3 animate-spin" />Enregistrement de l'ordre…
            </span>
          )}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pageAccounts.map((account) => {
              const borderColor = account.publicationStatus === "APPROVED" ? "border-orange-400" : account.publicationStatus === "REJECTED" ? "border-red-400" : "border-border";
              return (
                <div
                  key={account.userId}
                  draggable
                  onDragStart={(e) => handleAccountDragStart(e, account.userId)}
                  onDragOver={handleAccountDragOver}
                  onDrop={(e) => handleAccountDrop(e, account.userId)}
                  className={`relative bg-card rounded-2xl border-2 ${borderColor} shadow-sm overflow-hidden hover:shadow-md transition-shadow group select-none`}
                  data-testid={`card-maintenance-account-${account.userId}`}
                >
                  <div className="absolute top-2 right-2 z-10">
                    <span className={`w-2.5 h-2.5 rounded-full block shadow-sm border border-white/60 ${account.available ? "bg-emerald-500" : "bg-gray-400"}`} title={account.available ? "Disponible" : "Indisponible"} />
                  </div>
                  <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                    <div className="w-6 h-6 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center">
                      <GripVertical className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>
                  <div className="aspect-[16/9] bg-muted overflow-hidden cursor-pointer" onClick={() => setSelectedAccount(account)}>
                    {account.coverImageUrl ? (
                      <img src={account.coverImageUrl} alt={account.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Wrench className="w-10 h-10 text-muted-foreground/40" /></div>
                    )}
                  </div>
                  <CardContent className="p-4 space-y-3 cursor-pointer" onClick={() => setSelectedAccount(account)}>
                    <div className="flex items-start gap-3 -mt-9">
                      <Avatar className="border-2 border-background shadow-sm"><AvatarImage src={getAvatarUrl(account)} alt={account.name} /><AvatarFallback className="bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 font-bold">{account.initials}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1 mt-5"><h3 className="font-semibold truncate">{account.name}</h3><p className="text-xs text-muted-foreground truncate">{account.jobTitle}</p></div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-xs">{account.profileType}</Badge>
                      <Badge variant="outline" className="text-xs">{account.status}</Badge>
                      <PublicationStatusBadge status={account.publicationStatus ?? "DRAFT"} />
                      {account.autoApprove && <span className="flex items-center gap-1 text-[11px] text-amber-600"><Zap className="w-3 h-3" />Auto</span>}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{account.location || "—"}</div>
                    <div className="flex items-center justify-between text-xs"><Stars value={account.rating} /><span className="text-muted-foreground">{account.reviewCount} avis · {account.yearsExperience} ans exp.</span></div>
                    <div className="flex flex-wrap gap-1">{(account.skills ?? []).slice(0, 4).map((x: string) => <span key={x} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{x}</span>)}</div>
                  </CardContent>
                </div>
              );
            })}
          </div>
        </>)}
        <DataPagination
          page={accountsPagination.page}
          pageSize={accountsPagination.pageSize}
          totalItems={accounts.length}
          totalPages={accountsPagination.totalPages}
          start={accountsPagination.start}
          end={accountsPagination.end}
          onPageChange={accountsPagination.setPage}
          onPageSizeChange={accountsPagination.setPageSize}
          itemLabel="comptes"
        />
      </TabsContent>
      <TabsContent value="interventions" className="mt-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Interventions publiées</p><p className="text-xl font-bold">{isLoading ? "…" : stats?.publishedInterventions ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Réponses</p><p className="text-xl font-bold">{isLoading ? "…" : stats?.totalInterventionApplications ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Acceptées</p><p className="text-xl font-bold">{isLoading ? "…" : stats?.acceptedInterventionApplications ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">En attente</p><p className="text-xl font-bold">{isLoading ? "…" : stats?.pendingInterventionApplications ?? 0}</p></CardContent></Card>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0 sm:mb-0" style={{ scrollbarWidth: "none" }}>
          <div className="relative shrink-0 sm:flex-1 sm:min-w-[220px]">
            {!jobPostSearchOpen && (
              <button
                type="button"
                className="sm:hidden w-9 h-9 flex items-center justify-center rounded-md border border-input text-muted-foreground"
                onClick={() => { setJobPostSearchOpen(true); setTimeout(() => jobPostSearchInputRef.current?.focus(), 0); }}
                aria-label="Ouvrir la recherche"
                data-testid="button-open-maintenance-job-search"
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
                placeholder="Rechercher une intervention, un établissement, un café…"
              />
            </div>
          </div>
          <Select value={jobPostStatusFilter} onValueChange={setJobPostStatusFilter}>
            <SelectTrigger className="w-[150px] shrink-0"><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="DRAFT">Brouillon</SelectItem>
              <SelectItem value="PUBLISHED">Publiée</SelectItem>
              <SelectItem value="CLOSED">Clôturée</SelectItem>
            </SelectContent>
          </Select>
          <Select value={jobPostPublicationMode} onValueChange={setJobPostPublicationMode}>
            <SelectTrigger className="w-[150px] shrink-0"><SelectValue placeholder="Publication" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes publications</SelectItem>
              <SelectItem value="AUTOMATIC">Automatique</SelectItem>
              <SelectItem value="MANUAL">Manuelle</SelectItem>
            </SelectContent>
          </Select>
          <Select value={jobPostCategory} onValueChange={setJobPostCategory}>
            <SelectTrigger className="w-[180px] shrink-0"><SelectValue placeholder="Catégorie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes catégories</SelectItem>
              {jobPostFilterOptions.categories.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={jobPostUrgency} onValueChange={setJobPostUrgency}>
            <SelectTrigger className="w-[140px] shrink-0"><SelectValue placeholder="Urgence" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes urgences</SelectItem>
              <SelectItem value="LOW">Faible</SelectItem>
              <SelectItem value="NORMAL">Normale</SelectItem>
              <SelectItem value="HIGH">Élevée</SelectItem>
              <SelectItem value="URGENT">Urgente</SelectItem>
            </SelectContent>
          </Select>
          <Select value={jobPostLocation} onValueChange={setJobPostLocation}>
            <SelectTrigger className="w-[160px] shrink-0"><SelectValue placeholder="Zone" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les zones</SelectItem>
              {jobPostFilterOptions.locations.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
            </SelectContent>
          </Select>
          {(jobPostSearch || jobPostStatusFilter !== "all" || jobPostPublicationMode !== "all" || jobPostCategory !== "all" || jobPostUrgency !== "all" || jobPostLocation !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground shrink-0"
              onClick={() => { setJobPostSearch(""); setJobPostStatusFilter("all"); setJobPostPublicationMode("all"); setJobPostCategory("all"); setJobPostUrgency("all"); setJobPostLocation("all"); }}
              data-testid="button-clear-maintenance-job-filters"
            >
              <X className="w-3.5 h-3.5" /> Effacer
            </Button>
          )}
        </div>
        {jobPosts.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucune intervention correspondante.</CardContent></Card> : (
          <div className="space-y-2">
            {pageJobPosts.map((j) => (
              <Card key={j.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedJobPost(j)} data-testid={`card-admin-maintenance-job-${j.id}`}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{j.title}</p>
                      <JobPostStatusBadge status={j.status} />
                      <Badge variant="secondary" className="text-xs">{PUBLICATION_MODE_LABELS[j.publicationMode] ?? j.publicationMode}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{j.establishment} · {j.cafeOwnerName}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">{j.totalApplications} réponse{j.totalApplications > 1 ? "s" : ""}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <DataPagination
          page={jobPostsPagination.page}
          pageSize={jobPostsPagination.pageSize}
          totalItems={jobPosts.length}
          totalPages={jobPostsPagination.totalPages}
          start={jobPostsPagination.start}
          end={jobPostsPagination.end}
          onPageChange={jobPostsPagination.setPage}
          onPageSizeChange={jobPostsPagination.setPageSize}
          itemLabel="interventions"
        />
      </TabsContent>
      <TabsContent value="analytics" className="mt-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Interventions totales</p><p className="text-xl font-bold">{stats?.totalInterventions ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Réponses totales</p><p className="text-xl font-bold">{stats?.totalInterventionApplications ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">En attente</p><p className="text-xl font-bold text-amber-600">{stats?.pendingInterventionApplications ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux d'acceptation</p><p className="text-xl font-bold text-green-600">{acceptanceRate != null ? `${acceptanceRate}%` : "—"}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Note moyenne</p><p className="text-xl font-bold">{stats && stats.reviewCount > 0 ? stats.averageRating.toFixed(1) : "—"}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Comptes actifs</p><p className="text-xl font-bold">{stats?.activeAccounts ?? 0}</p></CardContent></Card>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <SectionCard title="Interventions par mois" icon={Briefcase}>
            {jobPostsByMonth.every((h) => h.count === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={jobPostsByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} formatter={(v: any) => [`${v} interventions`, "Interventions"]} />
                  <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
          <SectionCard title="Réponses par mois" icon={Send}>
            {applicationsByMonth.every((h) => h.count === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={applicationsByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} formatter={(v: any) => [`${v} réponses`, "Réponses"]} />
                  <Bar dataKey="count" fill="#fb923c" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <SectionCard title="Réponses par statut" icon={ClipboardList}>
            <div className="divide-y divide-border/40">
              <div className="flex items-center justify-between gap-3 py-2"><span className="text-sm font-medium">{APPLICATION_STATUS_LABELS.PENDING}</span><span className="text-sm font-semibold">{stats?.pendingInterventionApplications ?? 0}</span></div>
              <div className="flex items-center justify-between gap-3 py-2"><span className="text-sm font-medium">{APPLICATION_STATUS_LABELS.ACCEPTED}</span><span className="text-sm font-semibold">{stats?.acceptedInterventionApplications ?? 0}</span></div>
              <div className="flex items-center justify-between gap-3 py-2"><span className="text-sm font-medium">{APPLICATION_STATUS_LABELS.REJECTED}</span><span className="text-sm font-semibold">{stats?.rejectedInterventionApplications ?? 0}</span></div>
            </div>
          </SectionCard>
          <SectionCard title="Meilleurs comptes (par évaluation)" icon={Star}>
            {topRatedAccounts.length === 0 ? <EmptyState message="Aucun compte évalué pour le moment." /> : (
              <div className="divide-y divide-border/40">
                {topRatedAccounts.map((a: any, i: number) => <RankRow key={a.userId} rank={i + 1} title={a.name} subtitle={`${a.reviewCount} avis`} value={(a.rating / 10).toFixed(1)} />)}
              </div>
            )}
          </SectionCard>
        </div>
      </TabsContent>
    </Tabs>
    <AccountDetail account={selectedAccount} onClose={() => setSelectedAccount(null)} onRefresh={refresh} />
    <AddMaintenanceAccountModal open={addAccountOpen} onClose={() => setAddAccountOpen(false)} onCreated={refresh} />
    <MaintenanceJobPostDetail jobPost={selectedJobPost} onClose={() => setSelectedJobPost(null)} />
  </div>;
}