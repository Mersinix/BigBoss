import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User, Bell, CreditCard, MapPin, Building2, FileText, Landmark } from "lucide-react";

// ── Company Details Modal ─────────────────────────────────────────────────────

function CompanyDetailsModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: any }) {
  const { toast } = useToast();
  const billing = (user as any)?.billingInfo ?? {};
  const [form, setForm] = useState({ companyName: user?.name ?? "", taxId: billing.taxId ?? "", website: billing.website ?? "", address: user?.locationAddress ?? "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", { name: form.companyName });
      await apiRequest("PATCH", "/api/auth/me/billing", { ...billing, taxId: form.taxId, website: form.website, companyAddress: form.address });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Sauvegardé", description: "Informations de l'entreprise mises à jour." });
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
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 className="w-4 h-4" /> Informations de l'entreprise</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5"><Label>Nom de l'entreprise</Label><Input data-testid="input-company-name" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Numéro fiscal (MF)</Label><Input data-testid="input-tax-id" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} placeholder="TN000..." /></div>
          <div className="space-y-1.5"><Label>Site web</Label><Input data-testid="input-website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="www.example.com" /></div>
          <div className="space-y-1.5"><Label>Adresse</Label><Input data-testid="input-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button className="flex-1" onClick={save} disabled={saving} data-testid="button-save-company">{saving ? "Sauvegarde..." : "Sauvegarder"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Legal & Tax Modal ─────────────────────────────────────────────────────────

function LegalTaxModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: any }) {
  const { toast } = useToast();
  const billing = (user as any)?.billingInfo ?? {};
  const [form, setForm] = useState({ legalForm: billing.legalForm ?? "SARL", registrationNumber: billing.registrationNumber ?? "", vatNumber: billing.vatNumber ?? "", legalAddress: billing.legalAddress ?? "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/billing", { ...billing, legalForm: form.legalForm, registrationNumber: form.registrationNumber, vatNumber: form.vatNumber, legalAddress: form.legalAddress });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Sauvegardé", description: "Informations légales et fiscales mises à jour." });
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
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="w-4 h-4" /> Informations légales & fiscales</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5"><Label>Forme juridique</Label><Input data-testid="input-legal-form" value={form.legalForm} onChange={(e) => setForm({ ...form, legalForm: e.target.value })} placeholder="SARL, SA, SUARL..." /></div>
          <div className="space-y-1.5"><Label>Numéro d'immatriculation</Label><Input data-testid="input-registration-number" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Numéro TVA</Label><Input data-testid="input-vat-number" value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Adresse légale</Label><Input data-testid="input-legal-address" value={form.legalAddress} onChange={(e) => setForm({ ...form, legalAddress: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button className="flex-1" onClick={save} disabled={saving} data-testid="button-save-legal">{saving ? "Sauvegarde..." : "Sauvegarder"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Banking Details Modal ─────────────────────────────────────────────────────

function BankingModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: any }) {
  const { toast } = useToast();
  const billing = (user as any)?.billingInfo ?? {};
  const [form, setForm] = useState({ bankName: billing.bankName ?? "", iban: billing.iban ?? "", swift: billing.swift ?? "", accountHolder: billing.accountHolder ?? "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/me/billing", { ...billing, bankName: form.bankName, iban: form.iban, swift: form.swift, accountHolder: form.accountHolder });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Sauvegardé", description: "Coordonnées bancaires mises à jour." });
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
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Landmark className="w-4 h-4" /> Coordonnées bancaires</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5"><Label>Nom de la banque</Label><Input data-testid="input-bank-name" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="BNA, Attijari, BH..." /></div>
          <div className="space-y-1.5"><Label>IBAN / RIB</Label><Input data-testid="input-iban" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="TN59 10..." /></div>
          <div className="space-y-1.5"><Label>Code SWIFT / BIC</Label><Input data-testid="input-swift" value={form.swift} onChange={(e) => setForm({ ...form, swift: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Titulaire du compte</Label><Input data-testid="input-account-holder" value={form.accountHolder} onChange={(e) => setForm({ ...form, accountHolder: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button className="flex-1" onClick={save} disabled={saving} data-testid="button-save-banking">{saving ? "Sauvegarde..." : "Sauvegarder"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SupplierSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState({
    name: user?.name || "Premium Beans Co",
    email: user?.email || "",
    phone: (user as any)?.phone || "+216 71 234 567",
  });
  const [notifs, setNotifs] = useState({ newOrders: true, payouts: true, reviews: false, lowStock: true });
  const [companyOpen, setCompanyOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [bankingOpen, setBankingOpen] = useState(false);

  const save = async () => {
    try {
      await apiRequest("PATCH", "/api/auth/me/profile", { name: profile.name, phone: profile.phone });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Sauvegardé", description: "Profil mis à jour." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de sauvegarder.", variant: "destructive" });
    }
  };

  const settingsSections = [
    { icon: Building2, title: "Informations de l'entreprise", desc: "Nom, adresse, site web", onClick: () => setCompanyOpen(true), testId: "button-company-details" },
    { icon: FileText, title: "Informations légales & fiscales", desc: "Forme juridique, numéro fiscal, TVA", onClick: () => setLegalOpen(true), testId: "button-legal-tax" },
    { icon: Landmark, title: "Coordonnées bancaires", desc: "RIB/IBAN pour les virements", onClick: () => setBankingOpen(true), testId: "button-banking-details" },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez votre profil fournisseur et vos préférences.</p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><User className="w-4 h-4" /> Profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 mb-2">
            <Avatar className="w-14 h-14 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">{profile.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-foreground">{profile.name}</p>
              <p className="text-xs text-muted-foreground">Fournisseur · {user?.status === "approved" ? "Vérifié" : "En attente"}</p>
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sname">Nom de contact</Label>
              <Input id="sname" data-testid="input-sname" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="semail">Email</Label>
              <Input id="semail" data-testid="input-semail" value={profile.email} disabled className="opacity-60" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sphone">Téléphone</Label>
              <Input id="sphone" data-testid="input-sphone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business sections */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Informations commerciales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {settingsSections.map((section) => (
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

      {/* Notifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Bell className="w-4 h-4" /> Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "newOrders", label: "Nouvelles commandes" },
            { key: "payouts", label: "Virements" },
            { key: "reviews", label: "Avis clients" },
            { key: "lowStock", label: "Stock bas" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <Switch data-testid={`switch-${key}`} checked={notifs[key as keyof typeof notifs]} onCheckedChange={(v) => setNotifs({ ...notifs, [key]: v })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button data-testid="button-save-settings" onClick={save} className="w-fit">Sauvegarder</Button>

      <CompanyDetailsModal open={companyOpen} onClose={() => setCompanyOpen(false)} user={user} />
      <LegalTaxModal open={legalOpen} onClose={() => setLegalOpen(false)} user={user} />
      <BankingModal open={bankingOpen} onClose={() => setBankingOpen(false)} user={user} />
    </div>
  );
}
