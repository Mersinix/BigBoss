import { useEffect, useMemo, useState } from "react";
import { useAcademyBaristaRegistrations, useCreateAcademyBaristaRegistration } from "@/hooks/use-academy-barista-registrations";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { resolveDateRange, type DateRangePreset } from "@/lib/marketplace-analytics";
import {
  Coffee, Plus, Search, MapPin, Phone, Mail, Loader2, X, Clock, CheckCircle, XCircle,
  User as UserIcon, Filter, ClipboardList, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import type { AcademyBaristaRegistration } from "@shared/schema";

// Academy's own established accent (same indigo used by students.tsx's DashboardHero and
// business.tsx's SubTabSwitcher active-tab color) — deliberately not the Supplier page's
// primary-blue default, per the task's own "keep the current Academy visual identity"
// instruction.
const ACADEMY_HERO_STYLE = {
  gradientClass: "bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border-indigo-500/20",
  iconBgClass: "bg-indigo-500/15",
  iconTextClass: "text-indigo-600 dark:text-indigo-400",
};

const registrationStatusConfig: Record<string, { label: string; className: string; icon: any }> = {
  PENDING: { label: "En attente", className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-500/30", icon: Clock },
  APPROVED: { label: "Approuvé", className: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-500/30", icon: CheckCircle },
  REJECTED: { label: "Rejeté", className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-500/30", icon: XCircle },
};

// ── Add Registration Modal — submits a request for Admin review, never creates an account
// directly. Duplicate email/phone is authoritatively checked server-side (see
// server/storage.ts createAcademyBaristaRegistration); the returned French message is shown
// as an inline banner (same convention as the Supplier Café registration modal / the
// location-picker-modal's own geolocation error) and the modal stays open with every field
// preserved. ──────────────────────────────────────────────────────────────────────────────
function AddBaristaRegistrationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const createRegistration = useCreateAcademyBaristaRegistration();
  const [form, setForm] = useState({ baristaName: "", contactName: "", email: "", address: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setForm({ baristaName: "", contactName: "", email: "", address: "", phone: "" }); setError(null); };

  const handleCreate = () => {
    setError(null);
    createRegistration.mutate(
      { baristaName: form.baristaName, contactName: form.contactName, email: form.email, address: form.address.trim() || null, phone: form.phone.trim() || null },
      {
        onSuccess: () => { toast({ title: "Inscription envoyée", description: "L'équipe admin va examiner cette demande." }); reset(); onClose(); },
        onError: (err: any) => setError(err.message ?? "Une erreur est survenue. Veuillez réessayer."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent hideClose>
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={() => { reset(); onClose(); }} aria-label="Close" data-testid="button-close-add-barista-registration">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader><DialogTitle>Inscrire un barista</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-md px-3 py-2" data-testid="text-barista-registration-error">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Input placeholder="Nom du barista" value={form.baristaName} onChange={(e) => setForm((f) => ({ ...f, baristaName: e.target.value }))} data-testid="input-barista-registration-name" />
          <Input placeholder="Nom du contact" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} data-testid="input-barista-registration-contact-name" />
          <Input placeholder="Adresse e-mail" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} data-testid="input-barista-registration-email" />
          <Input placeholder="Adresse (optionnel)" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} data-testid="input-barista-registration-address" />
          <Input placeholder="Numéro de téléphone (optionnel)" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} data-testid="input-barista-registration-phone" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Annuler</Button>
          <Button
            onClick={handleCreate}
            disabled={!form.baristaName.trim() || !form.contactName.trim() || !form.email.trim() || createRegistration.isPending}
            data-testid="button-submit-barista-registration"
          >
            {createRegistration.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Envoyer la demande"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function matchesSearch(r: AcademyBaristaRegistration, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = q.replace(/\D/g, '');
  if (r.baristaName.toLowerCase().includes(q)) return true;
  if (r.contactName.toLowerCase().includes(q)) return true;
  if (r.email.toLowerCase().includes(q)) return true;
  if (qDigits && r.phone && r.phone.replace(/\D/g, '').includes(qDigits)) return true;
  return false;
}

// Academy Business → Barista — registration requests this Academy has submitted for
// candidate baristas, pending Admin review. Same architecture as the Supplier Cafés →
// Inscriptions page (KPIs, search/status/date filters, pagination), kept as its own,
// separate page/table from Academy Students (academyRegistrations, course signups) per the
// task's explicit instruction never to mix the two.
export default function AcademyBaristaRegistrationsPage() {
  const { data: registrations = [], isLoading } = useAcademyBaristaRegistrations();
  const [addOpen, setAddOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [dateCustom, setDateCustom] = useState({ from: "", to: "" });

  const dateRange = useMemo(() => resolveDateRange(datePreset, dateCustom), [datePreset, dateCustom]);

  const filtered = registrations.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!matchesSearch(r, search)) return false;
    if (dateRange.from || dateRange.to) {
      if (!r.createdAt) return false;
      const d = new Date(r.createdAt as any);
      if (dateRange.from && d < dateRange.from) return false;
      if (dateRange.to && d > dateRange.to) return false;
    }
    return true;
  });

  const pagination = usePagination(filtered.length);
  useEffect(() => { pagination.resetPage(); }, [search, statusFilter, datePreset, dateCustom.from, dateCustom.to]);
  const pageRegistrations = filtered.slice(pagination.start, pagination.end);

  const hasActiveFilters = search.trim() !== "" || statusFilter !== "all" || datePreset !== "all";
  const resetFilters = () => { setSearch(""); setStatusFilter("all"); setDatePreset("all"); setDateCustom({ from: "", to: "" }); };

  // KPIs are always computed from the full, unfiltered list — same convention as the
  // Supplier Cafés → Inscriptions page's own KPI cards.
  const total = registrations.length;
  const pendingCount = registrations.filter((r) => r.status === "PENDING").length;
  const approvedCount = registrations.filter((r) => r.status === "APPROVED").length;
  const rejectedCount = registrations.filter((r) => r.status === "REJECTED").length;

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Baristas"
        subtitle="Inscrivez de nouveaux baristas et suivez le statut de vos demandes d'inscription."
        {...ACADEMY_HERO_STYLE}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-indigo-500/15 rounded-xl p-2.5 shrink-0"><ClipboardList className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" /></div>
            <div className="min-w-0"><p className="text-xs text-muted-foreground truncate">Total des inscriptions</p><p className="text-xl font-bold">{total}</p></div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-amber-500/15 rounded-xl p-2.5 shrink-0"><Clock className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" /></div>
            <div className="min-w-0"><p className="text-xs text-muted-foreground truncate">En attente</p><p className="text-xl font-bold text-amber-600 dark:text-amber-400">{pendingCount}</p></div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-green-500/15 rounded-xl p-2.5 shrink-0"><CheckCircle className="w-4.5 h-4.5 text-green-600 dark:text-green-400" /></div>
            <div className="min-w-0"><p className="text-xs text-muted-foreground truncate">Approuvées</p><p className="text-xl font-bold text-green-600 dark:text-green-400">{approvedCount}</p></div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-red-500/15 rounded-xl p-2.5 shrink-0"><XCircle className="w-4.5 h-4.5 text-red-600 dark:text-red-400" /></div>
            <div className="min-w-0"><p className="text-xs text-muted-foreground truncate">Rejetées</p><p className="text-xl font-bold text-red-600 dark:text-red-400">{rejectedCount}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)} className="gap-1.5" data-testid="button-add-barista-registration"><Plus className="w-4 h-4" />Inscrire un barista</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un barista, contact, email ou téléphone…" className="pl-9" data-testid="input-barista-registration-search" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs w-36" data-testid="select-barista-registration-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="PENDING">En attente</SelectItem>
              <SelectItem value="APPROVED">Approuvées</SelectItem>
              <SelectItem value="REJECTED">Rejetées</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DateRangeFilter preset={datePreset} onPresetChange={setDatePreset} custom={dateCustom} onCustomChange={setDateCustom} />
        {hasActiveFilters && (
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs text-muted-foreground" onClick={resetFilters} data-testid="button-reset-barista-registration-filters">
            <X className="w-3.5 h-3.5" /> Réinitialiser
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}</div>
      ) : pageRegistrations.length === 0 ? (
        <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
          <CardContent className="py-16 text-center">
            <Coffee className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">
              {registrations.length === 0 ? "Aucune inscription pour le moment" : "Aucune inscription ne correspond à ces filtres"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {registrations.length === 0 ? "Inscrivez un barista pour qu'il soit examiné par l'administration." : "Essayez d'ajuster votre recherche ou vos filtres."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pageRegistrations.map((r) => {
            const sc = registrationStatusConfig[r.status] ?? registrationStatusConfig.PENDING;
            const Icon = sc.icon;
            return (
              <Card key={r.id} data-testid={`card-barista-registration-${r.id}`} className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate flex items-center gap-1.5"><Coffee className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />{r.baristaName}</h3>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5"><UserIcon className="w-3 h-3" />{r.contactName}</p>
                    </div>
                    <Badge variant="outline" className={`${sc.className} border text-xs gap-1 shrink-0`}>
                      <Icon className="w-3 h-3" />{sc.label}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5 truncate"><Mail className="w-3 h-3 shrink-0" />{r.email}</p>
                    {r.phone && <p className="flex items-center gap-1.5 truncate"><Phone className="w-3 h-3 shrink-0" />{r.phone}</p>}
                    {r.address && <p className="flex items-center gap-1.5 truncate"><MapPin className="w-3 h-3 shrink-0" />{r.address}</p>}
                  </div>
                  {r.status === "REJECTED" && r.rejectionReason && (
                    <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-md px-2 py-1">{r.rejectionReason}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {r.createdAt ? `Envoyée le ${formatDate(r.createdAt)}` : ""}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!isLoading && (
        <DataPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={filtered.length}
          totalPages={pagination.totalPages}
          start={pagination.start}
          end={pagination.end}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemLabel="inscriptions"
        />
      )}

      <AddBaristaRegistrationModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
