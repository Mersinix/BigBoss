import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Clock, CheckCircle, XCircle, Mail, Phone, MapPin, GraduationCap, X, Filter } from "lucide-react";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getAvatarUrl } from "@/lib/avatar";
import type { AcademyBaristaRegistration, AddressDetails } from "@shared/schema";

type AdminAcademyBaristaRegistration = AcademyBaristaRegistration & { academyName: string; academyEmail: string };

const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
  PENDING: { label: "En attente", className: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/30", icon: Clock },
  APPROVED: { label: "Approuvé", className: "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30", icon: CheckCircle },
  REJECTED: { label: "Rejeté", className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30", icon: XCircle },
};

const REGISTRATIONS_KEY = ["/api/admin/academy-barista-registrations"];

// ── Reject modal — simple optional reason, keeps the request row (never deletes it) so
// the Academy can see why and resubmit. Same shape as Supplier Café Registration's own
// RejectModal. ─────────────────────────────────────────────────────────────────────────────
function RejectModal({ registration, onClose }: { registration: AdminAcademyBaristaRegistration | null; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const rejectMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/academy-barista-registrations/${registration!.id}/reject`, { reason: reason.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REGISTRATIONS_KEY });
      toast({ title: "Inscription rejetée" });
      setReason("");
      onClose();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  if (!registration) return null;
  return (
    <Dialog open={!!registration} onOpenChange={(v) => { if (!v) { setReason(""); onClose(); } }}>
      <DialogContent hideClose className="sm:max-w-sm">
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={() => { setReason(""); onClose(); }} aria-label="Close" data-testid="button-close-reject-barista-registration">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader><DialogTitle>Rejeter "{registration.baristaName}" ?</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">L'académie pourra soumettre une nouvelle demande.</p>
          <div className="space-y-1.5">
            <Label>Motif (optionnel)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Expliquez pourquoi cette inscription est refusée…" data-testid="textarea-reject-barista-reason" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setReason(""); onClose(); }}>Annuler</Button>
            <Button variant="destructive" disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate()} data-testid="button-confirm-reject-barista-registration">
              Rejeter
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Approve modal — "complete and approve": the Admin finishes whatever the Academy left
// out (password, exact phone/WhatsApp, profile picture, precise location) before the real
// BARISTA_MARKETPLACE account is created. Prepopulated from the Academy's own submission;
// reuses the same LocationPickerModal flow as Admin → Utilisateurs / Supplier utilisateurs.
function ApproveModal({ registration, onClose }: { registration: AdminAcademyBaristaRegistration | null; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [form, setForm] = useState({
    baristaName: "", email: "", phone: "", isWhatsapp: false, profileImageUrl: "", password: "",
    address: "", locationLat: "", locationLng: "", locationPlaceId: "", locationDetails: undefined as AddressDetails | undefined,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Prepopulate once per registration opened (not on every re-render).
  const [seededId, setSeededId] = useState<number | null>(null);
  if (registration && registration.id !== seededId) {
    setSeededId(registration.id);
    setForm({
      baristaName: registration.baristaName, email: registration.email, phone: registration.phone ?? "",
      isWhatsapp: false, profileImageUrl: "", password: "",
      address: registration.address ?? "", locationLat: "", locationLng: "", locationPlaceId: "", locationDetails: undefined,
    });
    setErrors({});
  }

  const approveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/academy-barista-registrations/${registration!.id}/approve`, {
      baristaName: form.baristaName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      isWhatsapp: form.isWhatsapp,
      profileImageUrl: form.profileImageUrl.trim() || null,
      password: form.password,
      address: form.address.trim() || null,
      locationLat: form.locationLat || null,
      locationLng: form.locationLng || null,
      locationPlaceId: form.locationPlaceId || null,
      locationDetails: form.locationDetails ?? null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REGISTRATIONS_KEY });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Barista approuvé", description: "Le compte BARISTA_MARKETPLACE a été créé." });
      onClose();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.baristaName.trim()) e.baristaName = "Nom du barista requis";
    if (!form.email.trim() || !form.email.includes("@")) e.email = "Email valide requis";
    if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password) || !/[!@#$%^&*(),.?":{}|<>[\]\\/~`_+=;'-]/.test(form.password)) {
      e.password = "Au moins 8 caractères, une majuscule, un chiffre et un symbole";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    approveMutation.mutate();
  };

  if (!registration) return null;

  return (
    <Dialog open={!!registration} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent hideClose className="sm:max-w-lg max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose} aria-label="Close" data-testid="button-close-approve-barista-registration">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader><DialogTitle>Compléter et approuver "{registration.baristaName}"</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-1">
          <div className="space-y-1.5">
            <Label>Nom du barista *</Label>
            <Input value={form.baristaName} onChange={(e) => setForm((f) => ({ ...f, baristaName: e.target.value }))} data-testid="input-approve-barista-name" />
            {errors.baristaName && <p className="text-xs text-destructive">{errors.baristaName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} data-testid="input-approve-barista-email" />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Téléphone</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" className="w-3.5 h-3.5 rounded border-border/50 accent-primary"
                  checked={form.isWhatsapp} onChange={(e) => setForm((f) => ({ ...f, isWhatsapp: e.target.checked }))} />
                WhatsApp
              </label>
            </div>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+216 xx xxx xxx" data-testid="input-approve-barista-phone" />
          </div>
          <div className="space-y-1.5">
            <Label>Photo de profil (URL)</Label>
            <Input type="url" value={form.profileImageUrl} onChange={(e) => setForm((f) => ({ ...f, profileImageUrl: e.target.value }))} placeholder="https://…" data-testid="input-approve-barista-picture" />
          </div>
          <div className="space-y-1.5">
            <Label>Mot de passe *</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min. 8 car., 1 majuscule, 1 chiffre, 1 symbole" data-testid="input-approve-barista-password" />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Adresse</Label>
              <Button type="button" size="sm" variant="outline" className="h-6 text-xs gap-1"
                onClick={() => setLocationModalOpen(true)} data-testid="button-approve-barista-edit-location">
                <MapPin className="w-3 h-3" /> Choisir la localisation
              </Button>
            </div>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Adresse complète" data-testid="input-approve-barista-address" />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button className="flex-1" disabled={approveMutation.isPending} onClick={submit} data-testid="button-submit-approve-barista-registration">
              {approveMutation.isPending ? "Création…" : "Approuver et créer le compte"}
            </Button>
          </div>
        </div>
      </DialogContent>

      <LocationPickerModal
        open={locationModalOpen}
        mode="account"
        title="Choisissez l'adresse du barista"
        initialAddress={form.address}
        initialLat={form.locationLat}
        initialLng={form.locationLng}
        initialDetails={form.locationDetails}
        onClose={() => setLocationModalOpen(false)}
        onConfirm={(loc: PickedLocation) => {
          setForm((f) => ({
            ...f,
            address: loc.address || f.address,
            locationLat: loc.lat || "",
            locationLng: loc.lng || "",
            locationPlaceId: loc.placeId || "",
            locationDetails: loc.details,
          }));
          setLocationModalOpen(false);
        }}
      />
    </Dialog>
  );
}

// ── Main tab — Admin → Utilisateurs → "Academy utilisateurs". Lists active (PENDING +
// REJECTED) registration requests from every Academy. APPROVED registrations are
// deliberately never shown here: once approved, the resulting BARISTA_MARKETPLACE account
// is a normal user, findable in the "Utilisateurs" tab like any other account — this tab is
// only a review queue. Same design as Supplier utilisateurs. ───────────────────────────────
export default function AcademyBaristaRegistrationsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [approveTarget, setApproveTarget] = useState<AdminAcademyBaristaRegistration | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminAcademyBaristaRegistration | null>(null);

  const { data: registrations = [], isLoading } = useQuery<AdminAcademyBaristaRegistration[]>({
    queryKey: REGISTRATIONS_KEY,
  });

  const visible = registrations.filter((r) => {
    if (statusFilter === "active") return r.status === "PENDING" || r.status === "REJECTED";
    return r.status === statusFilter;
  });

  const pendingCount = registrations.filter((r) => r.status === "PENDING").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">{pendingCount} inscription(s) en attente de traitement.</p>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-56" data-testid="select-barista-registration-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Toutes les demandes actives</SelectItem>
              <SelectItem value="PENDING">En attente</SelectItem>
              <SelectItem value="REJECTED">Rejeté</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : visible.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Aucune inscription ne correspond à ce filtre.</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {visible.map((r) => {
            const sc = statusConfig[r.status] ?? statusConfig.PENDING;
            const Icon = sc.icon;
            return (
              <Card key={r.id} data-testid={`card-academy-barista-registration-${r.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <Avatar className="w-9 h-9 shrink-0">
                        <AvatarImage src={getAvatarUrl({ name: r.baristaName } as any)} alt={r.baristaName} />
                        <AvatarFallback>{r.baristaName.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{r.baristaName}</h3>
                        <p className="text-xs text-muted-foreground truncate">{r.contactName}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`${sc.className} border text-xs gap-1 shrink-0`}>
                      <Icon className="w-3 h-3" />{sc.label}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5 truncate"><Mail className="w-3 h-3 shrink-0" />{r.email}</p>
                    {r.phone && <p className="flex items-center gap-1.5 truncate"><Phone className="w-3 h-3 shrink-0" />{r.phone}</p>}
                    {r.address && <p className="flex items-center gap-1.5 truncate"><MapPin className="w-3 h-3 shrink-0" />{r.address}</p>}
                    <p className="flex items-center gap-1.5 truncate"><GraduationCap className="w-3 h-3 shrink-0" />Académie : {r.academyName}</p>
                  </div>
                  {r.status === "REJECTED" && r.rejectionReason && (
                    <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-md px-2 py-1">{r.rejectionReason}</p>
                  )}
                  {r.status === "PENDING" && (
                    <div className="flex gap-2 pt-1 border-t">
                      <Button size="sm" variant="outline"
                        className="flex-1 h-7 text-xs border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 gap-1"
                        onClick={() => setApproveTarget(r)} data-testid={`button-approve-barista-registration-${r.id}`}>
                        <CheckCircle className="w-3 h-3" /> Compléter et approuver
                      </Button>
                      <Button size="sm" variant="outline"
                        className="flex-1 h-7 text-xs border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 gap-1"
                        onClick={() => setRejectTarget(r)} data-testid={`button-reject-barista-registration-${r.id}`}>
                        <XCircle className="w-3 h-3" /> Rejeter
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ApproveModal registration={approveTarget} onClose={() => setApproveTarget(null)} />
      <RejectModal registration={rejectTarget} onClose={() => setRejectTarget(null)} />
    </div>
  );
}
