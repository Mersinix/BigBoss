import { useEffect, useMemo, useState } from "react";
import { useSupplierCafeRegistrations, useCreateSupplierCafeRegistration } from "@/hooks/use-supplier-cafes";
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
import { DashboardHero, KpiOverviewButton, KpiOverviewModal } from "@/components/dashboard/dashboard-kit";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SupplierCafeRegistration } from "@shared/schema";

const registrationStatusConfig: Record<string, { label: string; className: string; icon: any }> = {
  PENDING: { label: "En attente", className: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/30", icon: Clock },
  APPROVED: { label: "Approuvé", className: "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30", icon: CheckCircle },
  REJECTED: { label: "Rejeté", className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30", icon: XCircle },
};

// ── Add Registration Modal — submits a request for Admin review, never creates an account
// directly. Duplicate email/phone is authoritatively checked server-side (see
// server/storage.ts createSupplierCafeRegistration); the returned French message is shown
// as an inline banner (same AlertCircle/red-text convention as location-picker-modal's own
// geolocation error) and the modal stays open with every field preserved. ───────────────────
function AddRegistrationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const createRegistration = useCreateSupplierCafeRegistration();
  const [form, setForm] = useState({ cafeName: "", contactName: "", email: "", address: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setForm({ cafeName: "", contactName: "", email: "", address: "", phone: "" }); setError(null); };

  const handleCreate = () => {
    setError(null);
    createRegistration.mutate(
      { cafeName: form.cafeName, contactName: form.contactName, email: form.email, address: form.address.trim() || null, phone: form.phone.trim() || null },
      {
        onSuccess: () => { toast({ title: "Inscription envoyée", description: "L'équipe admin va examiner cette demande." }); reset(); onClose(); },
        onError: (err: any) => setError(err.message ?? "Une erreur est survenue. Veuillez réessayer."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent hideClose>
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={() => { reset(); onClose(); }} aria-label="Close" data-testid="button-close-add-registration">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader><DialogTitle>Inscrire un café</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-md px-3 py-2" data-testid="text-registration-error">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Input placeholder="Nom du café" value={form.cafeName} onChange={(e) => setForm((f) => ({ ...f, cafeName: e.target.value }))} data-testid="input-registration-cafe-name" />
          <Input placeholder="Nom du contact" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} data-testid="input-registration-contact-name" />
          <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} data-testid="input-registration-email" />
          <Input placeholder="Adresse (optionnel)" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} data-testid="input-registration-address" />
          <Input placeholder="Téléphone (optionnel)" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} data-testid="input-registration-phone" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Annuler</Button>
          <Button
            onClick={handleCreate}
            disabled={!form.cafeName.trim() || !form.contactName.trim() || !form.email.trim() || createRegistration.isPending}
            data-testid="button-submit-registration"
          >
            {createRegistration.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Envoyer la demande"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function matchesSearch(r: SupplierCafeRegistration, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = q.replace(/\D/g, '');
  if (r.cafeName.toLowerCase().includes(q)) return true;
  if (r.contactName.toLowerCase().includes(q)) return true;
  if (r.email.toLowerCase().includes(q)) return true;
  if (qDigits && r.phone && r.phone.replace(/\D/g, '').includes(qDigits)) return true;
  return false;
}

export default function CafesPage() {
  const { data: registrations = [], isLoading } = useSupplierCafeRegistrations();
  const isMobile = useIsMobile();
  const [kpiModalOpen, setKpiModalOpen] = useState(false);
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

  // KPIs are always computed from the full, unfiltered list — an overview of every
  // registration this supplier has ever submitted, same convention as Admin → Utilisateurs'
  // stat cards (which also ignore that page's own role/status filter).
  const total = registrations.length;
  const pendingCount = registrations.filter((r) => r.status === "PENDING").length;
  const approvedCount = registrations.filter((r) => r.status === "APPROVED").length;
  const rejectedCount = registrations.filter((r) => r.status === "REJECTED").length;

  const kpiCards = (
    <>
      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="bg-primary/10 rounded-xl p-3"><ClipboardList className="w-5 h-5 text-primary" /></div>
          <div><p className="text-xs text-muted-foreground">Total des inscriptions</p><p className="text-2xl font-bold">{total}</p></div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="bg-yellow-500/10 rounded-xl p-3"><Clock className="w-5 h-5 text-yellow-600" /></div>
          <div><p className="text-xs text-muted-foreground">En attente</p><p className="text-2xl font-bold text-yellow-600">{pendingCount}</p></div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="bg-green-500/10 rounded-xl p-3"><CheckCircle className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-xs text-muted-foreground">Approuvées</p><p className="text-2xl font-bold text-green-600">{approvedCount}</p></div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="bg-red-500/10 rounded-xl p-3"><XCircle className="w-5 h-5 text-red-600" /></div>
          <div><p className="text-xs text-muted-foreground">Rejetées</p><p className="text-2xl font-bold text-red-600">{rejectedCount}</p></div>
        </CardContent>
      </Card>
    </>
  );

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Cafes"
        subtitle="Inscrivez de nouveaux cafés et suivez le statut de vos demandes d'inscription."
        action={isMobile ? <KpiOverviewButton onClick={() => setKpiModalOpen(true)} /> : undefined}
      />

      {!isMobile && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {kpiCards}
        </div>
      )}
      <KpiOverviewModal open={isMobile && kpiModalOpen} onClose={() => setKpiModalOpen(false)}>
        <div className="grid grid-cols-2 gap-3">{kpiCards}</div>
      </KpiOverviewModal>

      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)} className="gap-1.5" data-testid="button-add-registration"><Plus className="w-4 h-4" />Inscrire un café</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un café, contact, email ou téléphone…" className="pl-9" data-testid="input-registration-search" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs w-36" data-testid="select-registration-status"><SelectValue /></SelectTrigger>
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
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs text-muted-foreground" onClick={resetFilters} data-testid="button-reset-registration-filters">
            <X className="w-3.5 h-3.5" /> Réinitialiser
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : pageRegistrations.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          {registrations.length === 0
            ? "Aucune inscription pour le moment. Inscrivez un café pour qu'il soit examiné par l'administration."
            : "Aucune inscription ne correspond à ces filtres."}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pageRegistrations.map((r) => {
            const sc = registrationStatusConfig[r.status] ?? registrationStatusConfig.PENDING;
            const Icon = sc.icon;
            return (
              <Card key={r.id} data-testid={`card-registration-${r.id}`}>
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate flex items-center gap-1.5"><Coffee className="w-3.5 h-3.5 text-primary shrink-0" />{r.cafeName}</h3>
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

      <AddRegistrationModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
