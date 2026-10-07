import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  GraduationCap, Users, CheckCircle, XCircle, Star, Search,
  MapPin, Phone, Mail, Calendar, TrendingUp, Wallet, Clock, ClipboardList, BookOpen, Award, CalendarDays, Eye,
  Pencil, Trash2, Snowflake, X, Check, Zap, GripVertical, RefreshCw,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { PublicationStatusBadge } from "@/components/account/publication-status-badge";
import { AcademyProfileModal } from "@/components/academy/academy-profile-modal";
import { AcademyDetailModal } from "@/components/academy/academy-detail-modal";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/use-realtime";
import { useFormatCurrency } from "@/hooks/use-currency";
import { DashboardHero, SectionCard, RankRow, EmptyState, KpiOverviewButton, KpiOverviewModal } from "@/components/dashboard/dashboard-kit";
import { useIsMobile } from "@/hooks/use-mobile";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";

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
  coverImageUrl?: string | null;
  status: string; description: string; location: string; marketplaceVisible: boolean; isFrozen: boolean;
  publicationStatus?: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED"; publicationRejectionReason?: string | null;
  displayOrder?: number; autoApprove?: boolean;
  rating: number; reviewCount: number; courseCount: number; publishedCourseCount: number;
  registrationCount: number; completedRegistrationCount: number; revenueCents: number;
  createdAt: string | null; initials: string;
};
type AdminCourse = {
  id: number; academyUserId: number; title: string; description: string; level: string;
  priceInCents: number; duration: string; hasCertification: boolean; category: string; location: string;
  trainingMode: string; capacity: number | null; isPublished: boolean; createdAt: string | null;
  imageUrl: string | null;
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
  BEGINNER: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400", ADVANCED: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400", EXPERT: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
};
const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente", CONFIRMED: "Confirmée", CANCELLED: "Annulée", COMPLETED: "Terminée",
};
const REGISTRATION_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400", CONFIRMED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400", COMPLETED: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
};
const SESSION_STATUS_LABELS: Record<string, string> = { UPCOMING: "À venir", ACTIVE: "En cours", COMPLETED: "Terminée", CANCELLED: "Annulée" };
const SESSION_STATUS_COLORS: Record<string, string> = {
  UPCOMING: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400", ACTIVE: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400", CANCELLED: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
};

function RegistrationStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={REGISTRATION_STATUS_COLORS[status] ?? ""}>{REGISTRATION_STATUS_LABELS[status] ?? status}</Badge>;
}
function SessionStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={SESSION_STATUS_COLORS[status] ?? ""}>{SESSION_STATUS_LABELS[status] ?? status}</Badge>;
}

// ── Academy detail dialog ──────────────────────────────────────────────────────

function AcademyDetail({ academy, onClose, onOpenCourse, onRefresh }: { academy: AdminAcademy | null; onClose: () => void; onOpenCourse: (courseId: number) => void; onRefresh: () => void }) {
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const [profileOpen, setProfileOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startEdit = () => {
    setForm({ name: academy!.name, phone: academy!.phone ?? "", description: academy!.description ?? "" });
    setEditing(true);
  };
  const editMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/academy/accounts/${academy!.userId}`, form),
    onSuccess: () => { setEditing(false); onRefresh(); toast({ title: "Compte mis à jour" }); },
    onError: (e: any) => toast({ title: "Mise à jour impossible", description: e.message, variant: "destructive" }),
  });
  const freezeMutation = useMutation({
    mutationFn: (isFrozen: boolean) => apiRequest("PATCH", `/api/admin/academy/accounts/${academy!.userId}/freeze`, { isFrozen }),
    onSuccess: () => { onRefresh(); toast({ title: academy!.isFrozen ? "Compte dégelé" : "Compte gelé" }); },
    onError: (e: any) => toast({ title: "Action impossible", description: e.message, variant: "destructive" }),
  });
  // GO Live review (Phase 5D) — approve/reject the submitted PROFILE CONTENT,
  // distinct from both account registration approval and the Freeze kill-switch above.
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const publicationMutation = useMutation({
    mutationFn: (data: { decision: "APPROVED" | "REJECTED"; rejectionReason?: string }) =>
      apiRequest("PATCH", `/api/admin/academy/accounts/${academy!.userId}/publication`, data),
    onSuccess: (_d, vars) => { onRefresh(); setRejecting(false); setRejectionReason(""); toast({ title: vars.decision === "APPROVED" ? "Profil approuvé et publié" : "Profil refusé" }); },
    onError: (e: any) => toast({ title: "Action impossible", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/users/${academy!.userId}`),
    onSuccess: () => { onRefresh(); onClose(); toast({ title: "Compte supprimé" }); },
    onError: (e: any) => toast({ title: "Suppression impossible", description: e.message, variant: "destructive" }),
  });
  const autoApproveMutation = useMutation({
    mutationFn: (autoApprove: boolean) => apiRequest("PATCH", `/api/admin/academy/accounts/${academy!.userId}/auto-approve`, { autoApprove }),
    onSuccess: () => { onRefresh(); toast({ title: "Auto Approve mis à jour" }); },
    onError: (e: any) => toast({ title: "Action impossible", description: e.message, variant: "destructive" }),
  });

  if (!academy) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Thin scrollbar treatment — matches the existing Admin Order Details modal's own
          scroll container exactly, same thumb/track/hover classes, not a new scrollbar style. */}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
        {/* Cover header — visually synchronized with the existing Preview Detail modal
            (AcademyProfileModal's own cover + close/preview buttons), see
            docs/service_card_reorder_and_detail_modal_audit.md Part 3. */}
        <div className="w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden bg-gray-100 dark:bg-gray-800">
          {academy.coverImageUrl ? (
            <img src={academy.coverImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-600 to-violet-700">
              <GraduationCap className="w-16 h-16 text-white" />
            </div>
          )}
          <div className="absolute top-3 right-3 flex gap-2">
            <button type="button" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform" onClick={() => setProfileOpen(true)} title="Aperçu marketplace" aria-label="Aperçu marketplace" data-testid="button-preview-academy-marketplace">
              <Eye className="w-4 h-4 text-white" />
            </button>
            <button type="button" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform" onClick={onClose} aria-label="Close" data-testid="button-close-academy-detail">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
        <div className="p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar><AvatarImage src={getAvatarUrl(academy)} alt={academy.name} /><AvatarFallback className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400 font-bold">{academy.initials}</AvatarFallback></Avatar>
            <span className="flex-1">{academy.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4 text-sm mt-4">
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Badge variant="outline">{academy.status}</Badge>
            <Badge variant={academy.publishedCourseCount > 0 ? "default" : "secondary"}>{academy.publishedCourseCount > 0 ? "Formations actives" : "Aucune formation publiée"}</Badge>
            {!academy.marketplaceVisible && <Badge variant="secondary">Masquée du marketplace</Badge>}
            {academy.isFrozen && <Badge className="bg-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé par l'Admin</Badge>}
            <PublicationStatusBadge status={academy.publicationStatus ?? "DRAFT"} />
          </div>
          {academy.publicationStatus === "REJECTED" && academy.publicationRejectionReason && (
            <div className="sm:col-span-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg p-2">
              Motif du refus précédent : {academy.publicationRejectionReason}
            </div>
          )}

          {editing ? (
            <div className="sm:col-span-2 space-y-2 rounded-lg border p-3">
              <div className="grid sm:grid-cols-2 gap-2">
                <div><label className="text-xs text-muted-foreground">Nom</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground">Téléphone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div><label className="text-xs text-muted-foreground">Description</label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
                <Button size="sm" disabled={editMutation.isPending} onClick={() => editMutation.mutate()}>{editMutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button>
              </div>
            </div>
          ) : <>
            <div className="flex gap-2"><Mail className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Email</p><p>{academy.email}</p></div></div>
            <div className="flex gap-2"><Phone className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Téléphone</p><p>{academy.phone || "—"}</p></div></div>
            <div className="flex gap-2"><MapPin className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Localisation</p><p>{academy.location || "—"}</p></div></div>
            <div className="flex gap-2"><Calendar className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Inscription</p><p>{academy.createdAt ? new Date(academy.createdAt).toLocaleDateString("fr-FR") : "—"}</p></div></div>
            <div className="flex gap-2"><BookOpen className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Formations</p><p>{academy.publishedCourseCount} publiée(s) / {academy.courseCount} au total</p></div></div>
            <div className="flex gap-2"><ClipboardList className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Inscriptions</p><p>{academy.completedRegistrationCount} terminée(s) / {academy.registrationCount} au total</p></div></div>
            <div className="flex gap-2"><Wallet className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Revenu (formations terminées)</p><p>{fmt(academy.revenueCents)}</p></div></div>
            <div className="flex gap-2"><Star className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Évaluation</p><p>{academy.reviewCount > 0 ? `${(academy.rating / 10).toFixed(1)} (${academy.reviewCount} avis)` : "Aucun avis"}</p></div></div>
            {academy.description && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Description</p><p className="whitespace-pre-wrap">{academy.description}</p></div>}
          </>}

          {academy.publicationStatus === "PENDING" && (
            <div className="sm:col-span-2 rounded-lg border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Demande de publication en attente — vérifiez le profil ci-dessus avant de décider.</p>
              {rejecting ? (
                <div className="space-y-2">
                  <Textarea placeholder="Motif du refus (visible par le professionnel)…" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={2} />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setRejectionReason(""); }}>Annuler</Button>
                    <Button size="sm" variant="destructive" disabled={publicationMutation.isPending} onClick={() => publicationMutation.mutate({ decision: "REJECTED", rejectionReason })} data-testid="button-reject-academy-publication">
                      {publicationMutation.isPending ? "…" : "Confirmer le refus"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => setRejecting(true)} data-testid="button-start-reject-academy-publication">
                    <X className="h-3.5 w-3.5 mr-1.5" />Refuser
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={publicationMutation.isPending} onClick={() => publicationMutation.mutate({ decision: "APPROVED" })} data-testid="button-approve-academy-publication">
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
                Lorsqu'activé, cette académie peut modifier son profil sans nécessiter une nouvelle validation Admin.
              </p>
            </div>
            <Switch
              checked={academy.autoApprove ?? false}
              onCheckedChange={(v) => autoApproveMutation.mutate(v)}
              disabled={autoApproveMutation.isPending}
              data-testid={`switch-auto-approve-academy-${academy.userId}`}
            />
          </div>

          <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            {!editing && <Button size="sm" variant="outline" onClick={startEdit} data-testid="button-edit-academy-account"><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Button>}
            <Button size="sm" variant="outline" disabled={freezeMutation.isPending} onClick={() => freezeMutation.mutate(!academy.isFrozen)} data-testid="button-freeze-academy-account">
              <Snowflake className={`h-3.5 w-3.5 mr-1.5 ${academy.isFrozen ? "text-blue-600" : ""}`} />{academy.isFrozen ? "Dégeler" : "Freeze"}
            </Button>
            {!confirmDelete ? (
              <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => setConfirmDelete(true)} data-testid="button-delete-academy-account">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
              </Button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/40 p-2">
                <span className="text-xs text-destructive">Confirmer la suppression définitive ?</span>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Annuler</Button>
                <Button size="sm" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()} data-testid="button-confirm-delete-academy-account">
                  {deleteMutation.isPending ? "Suppression…" : "Confirmer"}
                </Button>
              </div>
            )}
          </div>
        </div>
        </div>
      </DialogContent>
      <AcademyProfileModal
        academyUserId={academy.userId}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onOpenCourse={(courseId) => { setProfileOpen(false); onOpenCourse(courseId); }}
        readOnly
      />
    </Dialog>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────

const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };

export default function AdminAcademyPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fmt = useFormatCurrency();
  useRealtime();

  const isMobile = useIsMobile();
  const [kpiModalOpen, setKpiModalOpen] = useState(false);

  const [section, setSection] = useState("academies");
  const [selectedAcademy, setSelectedAcademy] = useState<AdminAcademy | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

  const [academySearch, setAcademySearch] = useState("");
  const [academyStatus, setAcademyStatus] = useState("all");
  const [academySearchOpen, setAcademySearchOpen] = useState(false);
  const academySearchInputRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop order (mirrors admin/stores-page.tsx's StoreCard pattern) — persisted
  // via displayOrder, which also drives the Coffee Owner /academy Store-card order.
  const [academyOrderedIds, setAcademyOrderedIds] = useState<number[] | null>(null);
  const academyDragIdRef = useRef<number | null>(null);

  const [courseSearch, setCourseSearch] = useState("");
  const [courseStatus, setCourseStatus] = useState("all");
  const [courseCategory, setCourseCategory] = useState("all");
  const [courseAcademy, setCourseAcademy] = useState("all");
  const [courseSearchOpen, setCourseSearchOpen] = useState(false);
  const courseSearchInputRef = useRef<HTMLInputElement>(null);

  const [registrationSearch, setRegistrationSearch] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState("all");
  const [registrationSearchOpen, setRegistrationSearchOpen] = useState(false);
  const registrationSearchInputRef = useRef<HTMLInputElement>(null);

  const [studentSearch, setStudentSearch] = useState("");

  const { data, isLoading } = useQuery<Overview>({ queryKey: ["/api/admin/academy"] });

  // Keep the open AcademyDetail dialog in sync with refetched overview data
  // (same fix as admin/print-page.tsx / admin/maintenance-page.tsx) — otherwise
  // it keeps showing the cached snapshot taken on click, so publication/freeze
  // decisions never appear until the dialog is closed and reopened.
  useEffect(() => {
    if (!selectedAcademy) return;
    const fresh = data?.academies?.find((a) => a.userId === selectedAcademy.userId);
    if (fresh && fresh !== selectedAcademy) setSelectedAcademy(fresh);
  }, [data?.academies, selectedAcademy?.userId]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest("PATCH", `/api/admin/users/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/academy"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Statut mis à jour" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const academyBulkOrderMutation = useMutation({
    mutationFn: (orders: { id: number; displayOrder: number }[]) => apiRequest("PATCH", "/api/admin/academy/accounts/bulk-order", { orders }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/academy"] });
      qc.invalidateQueries({ queryKey: ["/api/academy/companies"] });
      toast({ title: "Ordre enregistré" });
    },
    onError: () => toast({ title: "Échec de l'enregistrement de l'ordre", variant: "destructive" }),
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
  // Use academyOrderedIds (optimistic, after a drag) when available, otherwise fall
  // back to server order (displayOrder) — mirrors admin/stores-page.tsx exactly.
  const sortedAcademies = useMemo(() => {
    const all = data?.academies ?? [];
    return academyOrderedIds
      ? [...all].sort((a, b) => academyOrderedIds.indexOf(a.userId) - academyOrderedIds.indexOf(b.userId))
      : [...all].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [data?.academies, academyOrderedIds]);
  const academies = useMemo(() => sortedAcademies.filter((a) => {
    const haystack = [a.name, a.email, a.location].join(" ").toLowerCase();
    return (!academySearch || haystack.includes(academySearch.toLowerCase()))
      && (academyStatus === "all" || a.status === academyStatus);
  }), [sortedAcademies, academySearch, academyStatus]);
  const academiesPagination = usePagination(academies.length);
  useEffect(() => { academiesPagination.resetPage(); }, [academySearch, academyStatus]);
  const pageAcademies = academies.slice(academiesPagination.start, academiesPagination.end);

  // Drag handlers — identical shape to admin/stores-page.tsx's handleDragStart/Over/Drop.
  const handleAcademyDragStart = (e: React.DragEvent, id: number) => {
    academyDragIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
  };
  const handleAcademyDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleAcademyDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    const fromId = academyDragIdRef.current;
    if (fromId === null || fromId === targetId) return;
    const base = academyOrderedIds ?? sortedAcademies.map((a) => a.userId);
    const from = base.indexOf(fromId);
    const to = base.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...base];
    next.splice(from, 1);
    next.splice(to, 0, fromId);
    setAcademyOrderedIds(next);
    academyBulkOrderMutation.mutate(next.map((id, idx) => ({ id, displayOrder: idx })));
    academyDragIdRef.current = null;
  };

  // ── Formations tab — filters mirror Admin Marketing's "Services Marketing" tab
  // (search/category/agency/status), built from the same real data this tab already
  // fetches (data.courses), no new endpoint/dataset
  // (docs/academy_formations_management_marketing_synchronization_audit.md). ──
  const courseFilterOptions = useMemo(() => {
    const all = data?.courses ?? [];
    return {
      categories: Array.from(new Set(all.map((c) => c.category).filter(Boolean))).sort(),
      academies: Array.from(new Set(all.map((c) => c.academyName).filter(Boolean))).sort(),
    };
  }, [data?.courses]);
  const courses = useMemo(() => (data?.courses ?? []).filter((c) => {
    const haystack = [c.title, c.description, c.academyName, c.category].join(" ").toLowerCase();
    return (!courseSearch || haystack.includes(courseSearch.toLowerCase()))
      && (courseStatus === "all" || (courseStatus === "published" ? c.isPublished : !c.isPublished))
      && (courseCategory === "all" || c.category === courseCategory)
      && (courseAcademy === "all" || c.academyName === courseAcademy);
  }), [data?.courses, courseSearch, courseStatus, courseCategory, courseAcademy]);
  const coursesPagination = usePagination(courses.length);
  useEffect(() => { coursesPagination.resetPage(); }, [courseSearch, courseStatus, courseCategory, courseAcademy]);
  const pageCourses = courses.slice(coursesPagination.start, coursesPagination.end);
  const hasCourseFilters = !!(courseSearch || courseStatus !== "all" || courseCategory !== "all" || courseAcademy !== "all");

  // ── Inscriptions tab ──
  const registrations = useMemo(() => (data?.registrations ?? []).filter((r) => {
    const haystack = [r.courseTitle, r.academyName, r.cafeOwnerName].join(" ").toLowerCase();
    return (!registrationSearch || haystack.includes(registrationSearch.toLowerCase()))
      && (registrationStatus === "all" || r.status === registrationStatus);
  }), [data?.registrations, registrationSearch, registrationStatus]);
  const registrationsPagination = usePagination(registrations.length);
  useEffect(() => { registrationsPagination.resetPage(); }, [registrationSearch, registrationStatus]);
  const pageRegistrations = registrations.slice(registrationsPagination.start, registrationsPagination.end);

  // ── Étudiants tab — derived from registrations, no duplicate student system ──
  const students = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return (data?.registrations ?? [])
      .filter((r) => r.status !== "CANCELLED")
      .filter((r) => !query || [r.cafeOwnerName, r.courseTitle, r.academyName, ...r.participants].join(" ").toLowerCase().includes(query));
  }, [data?.registrations, studentSearch]);
  const studentsPagination = usePagination(students.length);
  useEffect(() => { studentsPagination.resetPage(); }, [studentSearch]);
  const pageStudents = students.slice(studentsPagination.start, studentsPagination.end);

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
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title={<span className="flex items-center gap-2"><GraduationCap className="w-6 h-6 text-indigo-600" />ACADEMY</span>}
        subtitle="Contrôle centralisé du service Academy : académies, formations, inscriptions, étudiants, calendrier, finance et analytics."
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
            bg-background/shadow-sm chip. */}
        <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          <TabsList className="flex items-center justify-start gap-1 bg-secondary/40 rounded-xl p-1 h-auto w-max min-w-full sm:w-fit">
            <TabsTrigger value="academies" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Académies</TabsTrigger>
            <TabsTrigger value="courses" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Formations</TabsTrigger>
            <TabsTrigger value="registrations" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Inscriptions</TabsTrigger>
            <TabsTrigger value="students" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Étudiants</TabsTrigger>
            <TabsTrigger value="calendar" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Calendrier</TabsTrigger>
            <TabsTrigger value="finance" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Finance</TabsTrigger>
            <TabsTrigger value="analytics" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground">Analytics</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Académies ── */}
        <TabsContent value="academies" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0 sm:mb-0" style={{ scrollbarWidth: "none" }}>
            <div className="relative shrink-0 sm:flex-1 sm:min-w-[220px]">
              {!academySearchOpen && (
                <button
                  type="button"
                  className="sm:hidden w-9 h-9 flex items-center justify-center rounded-md border border-input text-muted-foreground"
                  onClick={() => { setAcademySearchOpen(true); setTimeout(() => academySearchInputRef.current?.focus(), 0); }}
                  aria-label="Ouvrir la recherche"
                  data-testid="button-open-academies-search"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
              <div className={`${academySearchOpen ? "flex" : "hidden"} sm:flex items-center relative w-48 sm:w-auto`}>
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={academySearchInputRef}
                  className="pl-9"
                  value={academySearch}
                  onChange={(e) => setAcademySearch(e.target.value)}
                  onBlur={() => { if (!academySearch) setAcademySearchOpen(false); }}
                  placeholder="Rechercher une académie…"
                  data-testid="input-search-academies"
                />
              </div>
            </div>
            <Select value={academyStatus} onValueChange={setAcademyStatus}>
              <SelectTrigger className="w-[160px] shrink-0"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="approved">Approuvée</SelectItem><SelectItem value="pending">En attente</SelectItem><SelectItem value="rejected">Rejetée</SelectItem></SelectContent>
            </Select>
            {(academySearch || academyStatus !== "all") && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground shrink-0" onClick={() => { setAcademySearch(""); setAcademyStatus("all"); }} data-testid="button-clear-academies-filters">
                <X className="w-3.5 h-3.5" /> Effacer
              </Button>
            )}
          </div>
          {academies.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucune académie correspondante.</CardContent></Card> : (
            <>
            {academyBulkOrderMutation.isPending && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />Enregistrement de l'ordre…
              </span>
            )}
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pageAcademies.map((academy) => {
                const borderColor = academy.publicationStatus === "APPROVED" ? "border-indigo-400" : academy.publicationStatus === "REJECTED" ? "border-red-400" : "border-border";
                return (
                <div
                  key={academy.userId}
                  draggable
                  onDragStart={(e) => handleAcademyDragStart(e, academy.userId)}
                  onDragOver={handleAcademyDragOver}
                  onDrop={(e) => handleAcademyDrop(e, academy.userId)}
                  className={`relative bg-card rounded-2xl border-2 ${borderColor} shadow-sm overflow-hidden hover:shadow-md transition-shadow group select-none`}
                  data-testid={`card-academy-${academy.userId}`}
                >
                  <div className="absolute top-2 right-2 z-10">
                    <span className={`w-2.5 h-2.5 rounded-full block shadow-sm border border-white/60 ${academy.marketplaceVisible ? "bg-emerald-500" : "bg-gray-400"}`} title={academy.marketplaceVisible ? "Visible" : "Masquée"} />
                  </div>
                  <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                    <div className="w-6 h-6 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center">
                      <GripVertical className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>
                  <div className="aspect-[16/9] bg-muted overflow-hidden cursor-pointer" onClick={() => setSelectedAcademy(academy)}>
                    {academy.coverImageUrl ? (
                      <img src={academy.coverImageUrl} alt={academy.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><GraduationCap className="w-10 h-10 text-muted-foreground/40" /></div>
                    )}
                  </div>
                  <CardContent className="p-4 space-y-3 cursor-pointer" onClick={() => setSelectedAcademy(academy)}>
                    <div className="flex items-start gap-3 -mt-9">
                      <Avatar className="border-2 border-background shadow-sm"><AvatarImage src={getAvatarUrl(academy)} alt={academy.name} /><AvatarFallback className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400 font-bold">{academy.initials}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1 mt-5"><h3 className="font-semibold truncate">{academy.name}</h3><p className="text-xs text-muted-foreground truncate flex items-center gap-1"><MapPin className="h-3 w-3" />{academy.location || "—"}</p></div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">{academy.status}</Badge>
                      <PublicationStatusBadge status={academy.publicationStatus ?? "DRAFT"} />
                      <Badge variant="secondary" className="text-xs">{academy.publishedCourseCount} formation(s)</Badge>
                      {academy.autoApprove && <span className="flex items-center gap-1 text-[11px] text-amber-600"><Zap className="w-3 h-3" />Auto</span>}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{fmt(academy.revenueCents)}</span><span>{academy.reviewCount > 0 ? `★ ${(academy.rating / 10).toFixed(1)}` : "Aucun avis"}</span></div>
                  </CardContent>
                  <div className="px-4 pb-4">
                    {academy.status !== "approved" && (
                      <Button size="sm" className="w-full h-7 text-xs" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: academy.userId, status: "approved" })} data-testid={`button-approve-academy-${academy.userId}`}>Approuver</Button>
                    )}
                    {academy.status === "approved" && (
                      <Button size="sm" variant="outline" className="w-full h-7 text-xs border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: academy.userId, status: "rejected" })} data-testid={`button-suspend-academy-${academy.userId}`}>Suspendre</Button>
                    )}
                  </div>
                </div>
              );})}
            </div>
            <DataPagination
              page={academiesPagination.page}
              pageSize={academiesPagination.pageSize}
              totalItems={academies.length}
              totalPages={academiesPagination.totalPages}
              start={academiesPagination.start}
              end={academiesPagination.end}
              onPageChange={academiesPagination.setPage}
              onPageSizeChange={academiesPagination.setPageSize}
              itemLabel="académies"
            />
            </>
          )}
        </TabsContent>

        {/* ── Formations ── */}
        <TabsContent value="courses" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0 sm:mb-0" style={{ scrollbarWidth: "none" }}>
            <div className="relative shrink-0 sm:flex-1 sm:min-w-[220px]">
              {!courseSearchOpen && (
                <button
                  type="button"
                  className="sm:hidden w-9 h-9 flex items-center justify-center rounded-md border border-input text-muted-foreground"
                  onClick={() => { setCourseSearchOpen(true); setTimeout(() => courseSearchInputRef.current?.focus(), 0); }}
                  aria-label="Ouvrir la recherche"
                  data-testid="button-open-courses-search"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
              <div className={`${courseSearchOpen ? "flex" : "hidden"} sm:flex items-center relative w-48 sm:w-auto`}>
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={courseSearchInputRef}
                  className="pl-9"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  onBlur={() => { if (!courseSearch) setCourseSearchOpen(false); }}
                  placeholder="Rechercher une formation, une académie…"
                  data-testid="input-search-courses"
                />
              </div>
            </div>
            <Select value={courseCategory} onValueChange={setCourseCategory}>
              <SelectTrigger className="w-[160px] shrink-0" data-testid="select-course-filter-category"><SelectValue placeholder="Catégorie" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toutes catégories</SelectItem>{courseFilterOptions.categories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={courseAcademy} onValueChange={setCourseAcademy}>
              <SelectTrigger className="w-[160px] shrink-0" data-testid="select-course-filter-academy"><SelectValue placeholder="Académie" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toutes académies</SelectItem>{courseFilterOptions.academies.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={courseStatus} onValueChange={setCourseStatus}>
              <SelectTrigger className="w-[150px] shrink-0"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toutes</SelectItem><SelectItem value="published">Publiées</SelectItem><SelectItem value="draft">Brouillons</SelectItem></SelectContent>
            </Select>
            {hasCourseFilters && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground shrink-0" onClick={() => { setCourseSearch(""); setCourseStatus("all"); setCourseCategory("all"); setCourseAcademy("all"); }} data-testid="button-clear-courses-filters">
                <X className="w-3.5 h-3.5" /> Effacer
              </Button>
            )}
          </div>
          {courses.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucune formation correspondante.</CardContent></Card> : (
            <>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pageCourses.map((c) => (
                // Image-on-top + category/status badges mirror Admin Marketing's
                // "Services Marketing" card (docs/academy_formations_management_marketing_synchronization_audit.md).
                <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden" onClick={() => setSelectedCourseId(c.id)} data-testid={`card-course-${c.id}`}>
                  <div className="relative aspect-[16/9] bg-muted overflow-hidden">
                    {c.imageUrl ? <img src={c.imageUrl} alt={c.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><BookOpen className="w-8 h-8 text-muted-foreground/40" /></div>}
                    <span className={`absolute bottom-2 left-2 h-2.5 w-2.5 rounded-full border-2 border-white ${c.isPublished ? "bg-green-500" : "bg-gray-300"}`} title={c.isPublished ? "Publiée" : "Brouillon"} />
                    {c.category && (
                      <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full">
                        <GraduationCap className="w-3 h-3" />{c.category}
                      </span>
                    )}
                  </div>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><h3 className="font-semibold truncate">{c.title}</h3><p className="text-xs text-muted-foreground truncate">{c.academyName}</p></div>
                      <Badge variant={c.isPublished ? "default" : "secondary"} className="text-xs shrink-0">{c.isPublished ? "Publiée" : "Brouillon"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{c.description || "Aucune description"}</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className={`text-xs ${LEVEL_COLORS[c.level] ?? ""}`}>{LEVEL_LABELS[c.level] ?? c.level}</Badge>
                      {c.hasCertification && <Badge variant="secondary" className="text-xs flex items-center gap-1"><Award className="h-3 w-3" />Certifiante</Badge>}
                    </div>
                    <p className="text-sm font-semibold">{fmt(c.priceInCents)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <DataPagination
              page={coursesPagination.page}
              pageSize={coursesPagination.pageSize}
              totalItems={courses.length}
              totalPages={coursesPagination.totalPages}
              start={coursesPagination.start}
              end={coursesPagination.end}
              onPageChange={coursesPagination.setPage}
              onPageSizeChange={coursesPagination.setPageSize}
              itemLabel="formations"
            />
            </>
          )}
        </TabsContent>

        {/* ── Inscriptions ── */}
        <TabsContent value="registrations" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0 sm:mb-0" style={{ scrollbarWidth: "none" }}>
            <div className="relative shrink-0 sm:flex-1 sm:min-w-[220px]">
              {!registrationSearchOpen && (
                <button
                  type="button"
                  className="sm:hidden w-9 h-9 flex items-center justify-center rounded-md border border-input text-muted-foreground"
                  onClick={() => { setRegistrationSearchOpen(true); setTimeout(() => registrationSearchInputRef.current?.focus(), 0); }}
                  aria-label="Ouvrir la recherche"
                  data-testid="button-open-registrations-search"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
              <div className={`${registrationSearchOpen ? "flex" : "hidden"} sm:flex items-center relative w-48 sm:w-auto`}>
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={registrationSearchInputRef}
                  className="pl-9"
                  value={registrationSearch}
                  onChange={(e) => setRegistrationSearch(e.target.value)}
                  onBlur={() => { if (!registrationSearch) setRegistrationSearchOpen(false); }}
                  placeholder="Rechercher une inscription, une académie, un client…"
                  data-testid="input-search-registrations"
                />
              </div>
            </div>
            <Select value={registrationStatus} onValueChange={setRegistrationStatus}>
              <SelectTrigger className="w-[170px] shrink-0"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les statuts</SelectItem>{Object.entries(REGISTRATION_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            {(registrationSearch || registrationStatus !== "all") && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground shrink-0" onClick={() => { setRegistrationSearch(""); setRegistrationStatus("all"); }} data-testid="button-clear-registrations-filters">
                <X className="w-3.5 h-3.5" /> Effacer
              </Button>
            )}
          </div>
          {registrations.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucune inscription correspondante.</CardContent></Card> : (
            <>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pageRegistrations.map((r) => (
                <Card key={r.id} className="hover:shadow-md transition-shadow" data-testid={`card-registration-${r.id}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><h3 className="font-semibold truncate">#{r.id} · {r.courseTitle}</h3><p className="text-xs text-muted-foreground truncate">{r.cafeOwnerName} · {r.academyName}</p></div>
                      <RegistrationStatusBadge status={r.status} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px] font-normal">{r.participantType === "BARISTA_MARKETPLACE" ? "Barista" : "Coffee Owner"}</Badge>
                      <Badge variant="secondary" className="text-xs">{r.participantCount} participant(s)</Badge>
                    </div>
                    <p className="text-sm font-semibold">{fmt(r.priceInCents)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <DataPagination
              page={registrationsPagination.page}
              pageSize={registrationsPagination.pageSize}
              totalItems={registrations.length}
              totalPages={registrationsPagination.totalPages}
              start={registrationsPagination.start}
              end={registrationsPagination.end}
              onPageChange={registrationsPagination.setPage}
              onPageSizeChange={registrationsPagination.setPageSize}
              itemLabel="inscriptions"
            />
            </>
          )}
        </TabsContent>

        {/* ── Étudiants ── */}
        <TabsContent value="students" className="mt-4 space-y-4">
          <div className="relative max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Rechercher un étudiant…" data-testid="input-search-students" /></div>
          {students.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucun étudiant pour le moment.</CardContent></Card> : (
            <>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pageStudents.map((r) => (
                <Card key={r.id} className="hover:shadow-md transition-shadow" data-testid={`card-student-${r.id}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><h3 className="font-semibold truncate">{r.cafeOwnerName}</h3><p className="text-xs text-muted-foreground truncate">{r.courseTitle} · {r.academyName}</p></div>
                      <RegistrationStatusBadge status={r.status} />
                    </div>
                    <div className="flex flex-wrap gap-1"><Badge variant="outline" className="text-[10px] font-normal">{r.participantType === "BARISTA_MARKETPLACE" ? "Barista" : "Coffee Owner"}</Badge></div>
                    <p className="text-xs text-muted-foreground truncate">{r.participants.length > 0 ? r.participants.join(", ") : `${r.participantCount} participant(s)`}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <DataPagination
              page={studentsPagination.page}
              pageSize={studentsPagination.pageSize}
              totalItems={students.length}
              totalPages={studentsPagination.totalPages}
              start={studentsPagination.start}
              end={studentsPagination.end}
              onPageChange={studentsPagination.setPage}
              onPageSizeChange={studentsPagination.setPageSize}
              itemLabel="étudiants"
            />
            </>
          )}
        </TabsContent>

        {/* ── Calendrier ── */}
        <TabsContent value="calendar" className="mt-4">
          {(data?.sessions ?? []).length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucune session pour le moment.</CardContent></Card> : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(data?.sessions ?? []).map((s) => (
                <Card key={s.id} className="hover:shadow-md transition-shadow" data-testid={`card-session-${s.id}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><h3 className="font-semibold truncate">{s.courseTitle}</h3><p className="text-xs text-muted-foreground truncate">{s.academyName}</p></div>
                      <SessionStatusBadge status={s.status} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{s.startDate}{s.endDate ? ` → ${s.endDate}` : ""}</span>
                      <span>{s.registeredCount}{s.capacity ? `/${s.capacity}` : ""} participant(s)</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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

      <AcademyDetail academy={selectedAcademy} onClose={() => setSelectedAcademy(null)} onOpenCourse={(courseId) => setSelectedCourseId(courseId)} onRefresh={() => qc.invalidateQueries({ queryKey: ["/api/admin/academy"] })} />
      {/* Same synchronized Formation details modal used everywhere a formation is shown
          (Part 40) — read-only for Admin, moderation stays via the table's own controls. */}
      <AcademyDetailModal courseId={selectedCourseId} open={selectedCourseId != null} onClose={() => setSelectedCourseId(null)} onEnroll={() => {}} readOnly />
    </div>
  );
}
