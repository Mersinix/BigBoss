import { useState, useMemo } from "react";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useOrders } from "@/hooks/use-orders";
import { User, Bell, ShieldCheck, MapPin, Navigation, CheckCircle, CreditCard, FileText, ClipboardList, Clock, Truck, Package, Settings } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/format";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import OrderDetailsModal from "@/components/cafe/order-details-modal";

// ── Account / Profile Modal ────────────────────────────────────────────────────

function AccountModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: any }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: user?.name ?? "", phone: (user as any)?.phone ?? "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", { name: form.name, phone: form.phone });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Sauvegardé", description: "Informations du compte mises à jour." });
      onClose();
    } catch {
      toast({ title: "Erreur", description: "Impossible de sauvegarder.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><User className="w-4 h-4" /> Informations du compte</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5"><Label>Prénom / Nom</Label><Input data-testid="input-account-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input value={user?.email ?? ""} disabled className="opacity-60" /></div>
          <div className="space-y-1.5"><Label>Téléphone</Label><Input data-testid="input-account-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+216 XX XXX XXX" /></div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button className="flex-1" onClick={save} disabled={saving} data-testid="button-save-account">{saving ? "Sauvegarde..." : "Sauvegarder"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Billing Info Modal ─────────────────────────────────────────────────────────

function BillingModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: any }) {
  const { toast } = useToast();
  const billing = (user as any)?.billingInfo ?? {};
  const [form, setForm] = useState({
    companyName: billing.companyName ?? user?.name ?? "",
    taxId: billing.taxId ?? "",
    country: billing.country ?? "Tunisie",
    street: billing.street ?? billing.address ?? (user as any)?.locationAddress ?? "",
    floorDoor: billing.floorDoor ?? "",
    province: billing.province ?? "",
    city: billing.city ?? "",
    postalCode: billing.postalCode ?? "",
  });
  const [saving, setSaving] = useState(false);
  const f = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/billing", { ...billing, ...form });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Sauvegardé", description: "Informations de facturation mises à jour." });
      onClose();
    } catch {
      toast({ title: "Erreur", description: "Impossible de sauvegarder.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="w-4 h-4" /> Informations de facturation</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1.5"><Label>Nom / Raison sociale</Label><Input data-testid="input-billing-name" value={form.companyName} onChange={f("companyName")} placeholder="Café Central SARL" /></div>
          <div className="space-y-1.5"><Label>Numéro fiscal (MF)</Label><Input data-testid="input-billing-taxid" value={form.taxId} onChange={f("taxId")} placeholder="TN000000A/P/M/000" /></div>
          <div className="space-y-1.5"><Label>Pays</Label><Input data-testid="input-billing-country" value={form.country} onChange={f("country")} placeholder="Tunisie" /></div>
          <div className="space-y-1.5"><Label>Rue / Adresse</Label><Input data-testid="input-billing-street" value={form.street} onChange={f("street")} placeholder="12 Rue de la République" /></div>
          <div className="space-y-1.5"><Label>Étage / Porte / Appartement <span className="text-muted-foreground text-xs">(optionnel)</span></Label><Input data-testid="input-billing-floor" value={form.floorDoor} onChange={f("floorDoor")} placeholder="Étage 2, Porte 5" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Province / Gouvernorat</Label><Input data-testid="input-billing-province" value={form.province} onChange={f("province")} placeholder="Tunis" /></div>
            <div className="space-y-1.5"><Label>Ville</Label><Input data-testid="input-billing-city" value={form.city} onChange={f("city")} placeholder="Tunis" /></div>
          </div>
          <div className="space-y-1.5"><Label>Code postal</Label><Input data-testid="input-billing-postal" value={form.postalCode} onChange={f("postalCode")} placeholder="1000" /></div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button className="flex-1" onClick={save} disabled={saving} data-testid="button-save-billing">{saving ? "Sauvegarde..." : "Sauvegarder"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Payment Methods Modal ──────────────────────────────────────────────────────

function PaymentMethodsModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: any }) {
  const { toast } = useToast();
  const billing = (user as any)?.billingInfo ?? {};
  const [preferredMethod, setPreferredMethod] = useState<string>(billing.preferredPayment ?? "cash");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/billing", { ...billing, preferredPayment: preferredMethod });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Sauvegardé", description: "Préférences de paiement mises à jour." });
      onClose();
    } catch {
      toast({ title: "Erreur", description: "Impossible de sauvegarder.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const methods = [
    { id: "cash", label: "Espèces à la livraison", desc: "Paiement en liquide lors de la réception" },
    { id: "virement", label: "Virement bancaire", desc: "Transfert bancaire avant expédition" },
    { id: "cheque", label: "Chèque", desc: "Chèque à l'ordre du fournisseur" },
  ];
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Moyens de paiement préférés</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              data-testid={`payment-method-${m.id}`}
              onClick={() => setPreferredMethod(m.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${preferredMethod === m.id ? "border-primary bg-primary/5" : "border-border/40 hover:border-primary/30 hover:bg-secondary/20"}`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${preferredMethod === m.id ? "border-primary" : "border-muted-foreground"}`}>
                {preferredMethod === m.id && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <div>
                <p className="text-sm font-medium">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </div>
            </button>
          ))}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button className="flex-1" onClick={save} disabled={saving} data-testid="button-save-payment">{saving ? "Sauvegarde..." : "Sauvegarder"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Change Password Modal ──────────────────────────────────────────────────────

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (form.next !== form.confirm) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas.", variant: "destructive" });
      return;
    }
    if (form.next.length < 6) {
      toast({ title: "Erreur", description: "Le mot de passe doit faire au moins 6 caractères.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", { password: form.next, currentPassword: form.current });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Sauvegardé", description: "Mot de passe modifié." });
      onClose();
    } catch {
      toast({ title: "Erreur", description: "Impossible de modifier le mot de passe.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Modifier le mot de passe</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5"><Label>Mot de passe actuel</Label><Input type="password" data-testid="input-current-pw" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} placeholder="••••••••" /></div>
          <div className="space-y-1.5"><Label>Nouveau mot de passe</Label><Input type="password" data-testid="input-new-pw" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} placeholder="••••••••" /></div>
          <div className="space-y-1.5"><Label>Confirmer le nouveau mot de passe</Label><Input type="password" data-testid="input-confirm-pw" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} placeholder="••••••••" /></div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button className="flex-1" onClick={save} disabled={saving} data-testid="button-save-password">{saving ? "Sauvegarde..." : "Modifier"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  PENDING:     { label: "En attente",     color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300" },
  CONFIRMED:   { label: "Confirmée",      color: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300" },
  PREPARING:   { label: "En préparation", color: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300" },
  READY:       { label: "Prête",          color: "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300" },
  IN_DELIVERY: { label: "En livraison",   color: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300" },
  DELIVERED:   { label: "Livrée",         color: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300" },
  CANCELLED:   { label: "Annulée",        color: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300" },
};

export default function CafeSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const activeTab = new URLSearchParams(search).get("tab") === "orders" ? "orders" : "settings";

  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const { data: orders = [], isLoading: ordersLoading } = useOrders();

  const orderStats = useMemo(() => ({
    total: orders.length,
    pending: orders.filter(o => ["PENDING","CONFIRMED","PREPARING","READY"].includes(o.status)).length,
    inDelivery: orders.filter(o => o.status === "IN_DELIVERY").length,
    delivered: orders.filter(o => o.status === "DELIVERED").length,
  }), [orders]);

  const [notifs, setNotifs] = useState({
    orderUpdates: true,
    promotions: false,
    newSuppliers: true,
    weeklyReport: true,
  });

  const handleLocationConfirm = async (loc: PickedLocation) => {
    try {
      await apiRequest("PATCH", "/api/auth/me/location", {
        address: loc.address,
        lat: loc.lat,
        lng: loc.lng,
        placeId: loc.placeId,
        details: loc.details,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocationPickerOpen(false);
      toast({ title: "Adresse mise à jour", description: loc.address });
    } catch {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de sauvegarder l'adresse." });
      setLocationPickerOpen(false);
    }
  };

  const hasLocation = !!(user as any)?.locationAddress;
  const locationAddress = (user as any)?.locationAddress as string | undefined;
  const locationDetails = (user as any)?.locationDetails as import("@shared/schema").AddressDetails | undefined;
  const billing = (user as any)?.billingInfo ?? {};

  const sections = [
    { icon: User,         title: "Compte",                    desc: "Prénom, email, téléphone",            onClick: () => setAccountOpen(true),  testId: "button-account-section" },
    { icon: FileText,     title: "Informations de facturation", desc: "Raison sociale, adresse, numéro fiscal", onClick: () => setBillingOpen(true),  testId: "button-billing-section" },
    { icon: CreditCard,   title: "Moyens de paiement",         desc: "Espèces, virement, chèque",          onClick: () => setPaymentOpen(true),  testId: "button-payment-section" },
    { icon: ShieldCheck,  title: "Confidentialité & Sécurité",  desc: "Modifier le mot de passe",           onClick: () => setPasswordOpen(true), testId: "button-privacy-section" },
  ];

  // ── Tab nav items ───────────────────────────────────────────────────────────
  const tabs = [
    { id: "settings", label: "Paramètres", icon: Settings },
    { id: "orders",   label: `Commandes${orderStats.total > 0 ? ` (${orderStats.total})` : ""}`, icon: ClipboardList },
  ];

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mon Compte</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gérez votre profil et suivez vos commandes.</p>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 border-b border-border/50">
          {tabs.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={id === "orders" ? "/cafe/settings?tab=orders" : "/cafe/settings"}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? "border-amber-500 text-amber-600 dark:text-amber-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </a>
          ))}
        </div>

        {/* ── SETTINGS TAB ── */}
        {activeTab === "settings" && (
          <div className="max-w-2xl space-y-6">
            {/* Profile summary */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-4">
                  <Avatar className="w-14 h-14 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
                      {(user?.name ?? "C").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-foreground">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">Café · {user?.status === "approved" ? "Vérifié" : "En attente"}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account sections */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Mon compte</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sections.map((section) => (
                  <button
                    key={section.title}
                    data-testid={section.testId}
                    onClick={section.onClick}
                    className="w-full flex items-center gap-4 p-3 rounded-xl border border-border/40 hover:border-primary/30 hover:bg-secondary/30 transition-all text-left"
                  >
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                      <section.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{section.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{section.desc}</p>
                    </div>
                    <span className="text-xs text-primary font-medium">Modifier</span>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Location */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Adresse du café
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasLocation ? (
                  <div className="flex items-start gap-3 p-3 bg-teal-50 border border-teal-100 rounded-2xl dark:bg-teal-950/20 dark:border-teal-900">
                    <CheckCircle className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-teal-600 font-medium mb-0.5">Adresse enregistrée</p>
                      <p className="text-sm text-gray-800 dark:text-gray-200 font-semibold leading-snug">{locationAddress}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-2xl dark:bg-amber-950/20 dark:border-amber-900">
                    <Navigation className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Aucune adresse enregistrée</p>
                      <p className="text-xs text-gray-500 mt-0.5">Ajoutez votre adresse pour permettre la livraison.</p>
                    </div>
                  </div>
                )}
                <Button
                  variant="outline"
                  className="rounded-xl border-teal-200 text-teal-700 hover:bg-teal-50 gap-2"
                  onClick={() => setLocationPickerOpen(true)}
                  data-testid="button-change-location"
                >
                  <MapPin className="w-4 h-4" />
                  {hasLocation ? "Modifier l'adresse" : "Ajouter une adresse"}
                </Button>
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2"><Bell className="w-4 h-4" /> Notifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "orderUpdates",  label: "Mises à jour de commandes",  desc: "Recevez les changements de statut de vos commandes." },
                  { key: "promotions",    label: "Promotions et offres",        desc: "Offres spéciales de vos fournisseurs." },
                  { key: "newSuppliers",  label: "Nouveaux fournisseurs",       desc: "Soyez notifié quand un nouveau fournisseur s'inscrit." },
                  { key: "weeklyReport",  label: "Rapport hebdomadaire",        desc: "Résumé de vos achats de la semaine." },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      data-testid={`switch-${key}`}
                      checked={notifs[key as keyof typeof notifs]}
                      onCheckedChange={(v) => setNotifs({ ...notifs, [key]: v })}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Billing summary */}
            {(billing.taxId || billing.companyName) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2"><FileText className="w-4 h-4" /> Facturation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  {billing.companyName && <p><span className="text-muted-foreground">Raison sociale: </span>{billing.companyName}</p>}
                  {billing.taxId && <p><span className="text-muted-foreground">MF: </span>{billing.taxId}</p>}
                  {billing.address && <p><span className="text-muted-foreground">Adresse: </span>{billing.address}</p>}
                  {billing.preferredPayment && <p><span className="text-muted-foreground">Paiement: </span>{billing.preferredPayment}</p>}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── ORDERS TAB ── */}
        {activeTab === "orders" && (
          <div className="space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total", value: orderStats.total,      icon: ClipboardList, cls: "text-amber-500 bg-amber-500/10" },
                { label: "En cours",  value: orderStats.pending,    icon: Clock,        cls: "text-blue-500 bg-blue-500/10" },
                { label: "En livraison", value: orderStats.inDelivery, icon: Truck,     cls: "text-purple-500 bg-purple-500/10" },
                { label: "Livrées",  value: orderStats.delivered, icon: Package,       cls: "text-green-600 bg-green-500/10" },
              ].map(({ label, value, icon: Icon, cls }) => (
                <Card key={label}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`rounded-xl p-2.5 ${cls.split(" ")[1]}`}>
                      <Icon className={`w-4 h-4 ${cls.split(" ")[0]}`} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-xl font-bold">{value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Order list */}
            {ordersLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : orders.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
                  <p className="font-semibold text-lg">Aucune commande</p>
                  <p className="text-sm text-muted-foreground mt-1">Vos commandes apparaîtront ici après votre premier achat.</p>
                  <a href="/products">
                    <Button className="mt-4 bg-amber-500 hover:bg-amber-600">Découvrir les produits</Button>
                  </a>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {[...orders].sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()).map(order => {
                  const s = STATUS_CFG[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-800" };
                  const supplierCount = order.subOrders?.length ?? 0;
                  const priority = (order as any).priority;
                  return (
                    <button
                      key={order.id}
                      className="w-full text-left"
                      onClick={() => setSelectedOrder(order)}
                      data-testid={`button-order-${order.id}`}
                    >
                      <Card className="hover:border-primary/30 hover:shadow-sm transition-all">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="shrink-0">
                                <p className="font-mono text-xs text-muted-foreground">#{String(order.id).padStart(6, "0")}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(order.createdAt as any)}</p>
                              </div>
                              <Separator orientation="vertical" className="h-8" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="secondary" className={`${s.color} text-xs`}>{s.label}</Badge>
                                  {priority && priority !== "NORMAL" && (
                                    <Badge variant="secondary" className={`text-xs ${priority === "URGENT" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                                      {priority === "URGENT" ? "Urgent" : "Haute prio."}
                                    </Badge>
                                  )}
                                </div>
                                {supplierCount > 0 && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {supplierCount} fournisseur{supplierCount > 1 ? "s" : ""}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-bold text-amber-500">{formatCurrency(order.totalAmount)}</p>
                              <p className="text-xs text-primary font-medium mt-0.5">Voir →</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} user={user} />
      <BillingModal open={billingOpen} onClose={() => setBillingOpen(false)} user={user} />
      <PaymentMethodsModal open={paymentOpen} onClose={() => setPaymentOpen(false)} user={user} />
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <LocationPickerModal
        open={locationPickerOpen}
        mode="account"
        title="Choisissez votre adresse"
        onClose={() => setLocationPickerOpen(false)}
        onConfirm={handleLocationConfirm}
        initialAddress={locationAddress}
        initialDetails={locationDetails}
      />
      <OrderDetailsModal
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
      />
    </>
  );
}
