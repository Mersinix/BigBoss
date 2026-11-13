import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Ticket, Copy, Plus, X, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency, useCurrency } from "@/hooks/use-currency";
import {
  useDiscountCodes, useDiscountCodeStats, useCreateDiscountCode, useUpdateDiscountCode, useDeleteDiscountCode,
  type DiscountCodeFormInput,
} from "@/hooks/use-discount-codes";
import { useDiscountCodeSettings } from "@/hooks/use-discount-code-settings";
import type { DiscountCode } from "@shared/schema";
import { DashboardHero, KpiOverviewButton, KpiOverviewModal } from "@/components/dashboard/dashboard-kit";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { useIsMobile } from "@/hooks/use-mobile";

// `EffectiveStatus`'s string values are a stable internal key (compared/used as a
// Record key below), never shown to the user directly — STATUS_LABELS is the
// separate, translatable display label for each, same split-key/label convention
// already used elsewhere in this app (e.g. the Supplier Communication switcher).
type EffectiveStatus = "Active" | "Inactive" | "Expired" | "Limit Reached";

function getEffectiveStatus(c: DiscountCode): EffectiveStatus {
  if (!c.isActive) return "Inactive";
  if (c.expiresAt && new Date(c.expiresAt) < new Date()) return "Expired";
  if (c.maxUses != null && c.usageCount >= c.maxUses) return "Limit Reached";
  return "Active";
}

const statusStyle: Record<EffectiveStatus, string> = {
  Active: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  Inactive: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
  Expired: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
  "Limit Reached": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
};

const STATUS_LABELS: Record<EffectiveStatus, string> = {
  Active: "Actif",
  Inactive: "Inactif",
  Expired: "Expiré",
  "Limit Reached": "Limite atteinte",
};

function discountLabel(c: DiscountCode, fmt: (n: number) => string): string {
  return c.discountType === "PERCENTAGE" ? `${c.discountValue / 100}%` : fmt(c.discountValue);
}

function formatExpiry(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

const EMPTY_FORM: DiscountCodeFormInput = {
  code: "",
  discountType: "PERCENTAGE",
  discountValue: 0,
  maxUses: null,
  minimumOrderAmount: null,
  expiresAt: null,
  isActive: true,
};

function codeToForm(c: DiscountCode): DiscountCodeFormInput & { discountValueInput: string; minimumOrderAmountInput: string; expiresAtInput: string } {
  return {
    code: c.code,
    discountType: c.discountType,
    discountValue: c.discountValue,
    maxUses: c.maxUses,
    minimumOrderAmount: c.minimumOrderAmount,
    expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString() : null,
    isActive: c.isActive,
    discountValueInput: c.discountType === "PERCENTAGE" ? String(c.discountValue / 100) : (c.discountValue / 1000).toFixed(3),
    minimumOrderAmountInput: c.minimumOrderAmount != null ? (c.minimumOrderAmount / 1000).toFixed(3) : "",
    expiresAtInput: c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 16) : "",
  };
}

export default function DiscountCodesPage() {
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const symbol = useCurrency();

  // Admin → System Management → Supplier → Codes promotionnels (task: "Supplier
  // System Management — Rename Promotion Section & Add Discount Code Visibility
  // Controls"). tabVisible gates the whole page below (mirrors promotions-page.tsx's
  // promotionSettings.globalVisible gate exactly); newCodeButtonVisible independently
  // hides only the "Nouveau code" entry points further down. Reactive — useQuery kept
  // in sync by use-realtime.ts's discount_code_settings_updated handler.
  const { settings: discountCodeSettings } = useDiscountCodeSettings();
  const { data: codes = [], isLoading } = useDiscountCodes(discountCodeSettings.tabVisible);
  const { data: stats } = useDiscountCodeStats(discountCodeSettings.tabVisible);
  const createMut = useCreateDiscountCode();
  const updateMut = useUpdateDiscountCode();
  const deleteMut = useDeleteDiscountCode();
  // Custom removal confirmation (task: "Supplier Module — Custom Removal
  // Confirmation Modals and Discount Code Removal").
  const [removeTarget, setRemoveTarget] = useState<DiscountCode | null>(null);
  const isMobile = useIsMobile();
  const [kpiModalOpen, setKpiModalOpen] = useState(false);

  const pagination = usePagination(codes.length);
  useEffect(() => { pagination.resetPage(); }, [codes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageCodes = codes.slice(pagination.start, pagination.end);

  const [formOpen, setFormOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<DiscountCode | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">("PERCENTAGE");
  const [discountValueInput, setDiscountValueInput] = useState("");
  const [maxUsesInput, setMaxUsesInput] = useState("");
  const [minimumOrderAmountInput, setMinimumOrderAmountInput] = useState("");
  const [expiresAtInput, setExpiresAtInput] = useState("");
  const [isActive, setIsActive] = useState(true);

  const copy = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    toast({ title: "Copié !", description: `Code ${code} copié dans le presse-papiers.` });
  };

  const openCreate = () => {
    setEditingCode(null);
    setCodeInput("");
    setDiscountType("PERCENTAGE");
    setDiscountValueInput("");
    setMaxUsesInput("");
    setMinimumOrderAmountInput("");
    setExpiresAtInput("");
    setIsActive(true);
    setFormOpen(true);
  };

  const openEdit = (c: DiscountCode) => {
    const f = codeToForm(c);
    setEditingCode(c);
    setCodeInput(f.code);
    setDiscountType(f.discountType);
    setDiscountValueInput(f.discountValueInput);
    setMaxUsesInput(f.maxUses != null ? String(f.maxUses) : "");
    setMinimumOrderAmountInput(f.minimumOrderAmountInput);
    setExpiresAtInput(f.expiresAtInput);
    setIsActive(f.isActive);
    setFormOpen(true);
  };

  const isSaving = createMut.isPending || updateMut.isPending;
  // An already-open Create dialog must not be able to complete creation if Admin
  // revokes "Bouton Nouveau code" while it's open (task's realtime requirement,
  // Part 4) — this only ever applies to Create, never Edit, since the setting
  // governs creating new codes, not managing existing ones.
  const creationBlocked = !editingCode && !discountCodeSettings.newCodeButtonVisible;

  const handleSave = () => {
    if (creationBlocked) { toast({ title: "La création de codes promotionnels est temporairement désactivée.", variant: "destructive" }); return; }
    if (!codeInput.trim()) { toast({ title: "Le code est requis", variant: "destructive" }); return; }
    const value = parseFloat(discountValueInput || "0");
    if (!value || value <= 0) { toast({ title: "La valeur de la réduction doit être positive", variant: "destructive" }); return; }
    const payload: DiscountCodeFormInput = {
      code: codeInput.trim().toUpperCase(),
      discountType,
      discountValue: discountType === "PERCENTAGE" ? Math.round(value * 100) : Math.round(value * 1000),
      maxUses: maxUsesInput ? Number(maxUsesInput) : null,
      minimumOrderAmount: minimumOrderAmountInput ? Math.round(parseFloat(minimumOrderAmountInput) * 1000) : null,
      expiresAt: expiresAtInput ? new Date(expiresAtInput).toISOString() : null,
      isActive,
    };
    const onSuccess = () => { setFormOpen(false); toast({ title: editingCode ? "Code mis à jour" : "Code créé" }); };
    const onError = (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" });
    if (editingCode) updateMut.mutate({ id: editingCode.id, data: payload }, { onSuccess, onError });
    else createMut.mutate(payload, { onSuccess, onError });
  };

  const activeCount = stats?.active ?? codes.filter(c => getEffectiveStatus(c) === "Active").length;
  const totalRedemptions = stats?.totalRedemptions ?? codes.reduce((s, c) => s + c.usageCount, 0);
  const expiredCount = (stats?.expired ?? codes.filter(c => getEffectiveStatus(c) === "Expired").length)
    + (stats?.usageLimitReached ?? codes.filter(c => getEffectiveStatus(c) === "Limit Reached").length);

  // Also checked directly through the normal URL, not just via the hidden nav entry
  // (app-sidebar.tsx) — same "clean UX, backend is the real enforcement" principle as
  // promotions-page.tsx's own globalVisible gate. requireDiscountCodesEnabled in
  // shop-catalog.routes.ts independently rejects every Supplier discount-code
  // endpoint with 403 regardless of this page-level check.
  if (!discountCodeSettings.tabVisible) {
    return (
      <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
        <DashboardHero title="Codes promotionnels" subtitle="Créez et gérez des codes promotionnels pour les clients de votre café." />
        <div className="rounded-2xl border border-border/50 p-16 text-center text-muted-foreground">
          <Lock className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Cette fonctionnalité est temporairement indisponible.</p>
          <p className="text-sm mt-1">Contactez votre administrateur pour plus d'informations.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Codes promotionnels"
        subtitle="Créez et gérez des codes promotionnels pour les clients de votre café."
        action={
          <>
            {discountCodeSettings.newCodeButtonVisible && (
              <Button size="sm" onClick={openCreate} data-testid="button-add-code"><Plus className="w-4 h-4 mr-1" /> Nouveau code</Button>
            )}
            {isMobile && <KpiOverviewButton onClick={() => setKpiModalOpen(true)} />}
          </>
        }
      />

      {!isMobile && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Codes actifs", value: activeCount },
            { label: "Utilisations totales", value: totalRedemptions },
            { label: "Codes expirés", value: expiredCount },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="bg-primary/10 rounded-xl p-3"><Ticket className="w-5 h-5 text-primary" /></div>
                <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <KpiOverviewModal open={isMobile && kpiModalOpen} onClose={() => setKpiModalOpen(false)}>
        <div className="grid grid-cols-1 gap-3">
          {[
            { label: "Codes actifs", value: activeCount },
            { label: "Utilisations totales", value: totalRedemptions },
            { label: "Codes expirés", value: expiredCount },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="bg-primary/10 rounded-xl p-3"><Ticket className="w-5 h-5 text-primary" /></div>
                <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </KpiOverviewModal>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Tous les codes</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <div key={i} className="h-36 rounded-2xl bg-secondary/40 animate-pulse" />)}
            </div>
          ) : codes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Ticket className="w-10 h-10 text-muted-foreground mb-3 opacity-40" />
              <p className="font-semibold">Aucun code promotionnel trouvé</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">Créez votre premier code pour permettre aux clients de votre café d'obtenir une réduction à la commande.</p>
              {discountCodeSettings.newCodeButtonVisible && (
                <Button className="mt-5" size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Nouveau code</Button>
              )}
            </div>
          ) : (
            // Clickable cards replace the former table (task: "Supplier Discount
            // Codes — Card Redesign"). The entire card opens Edit on click/Enter/
            // Space — no separate Edit button — mirroring the exact
            // "whole-card-opens-detail" convention already used for Supplier
            // delivery cards (delivery-status-page.tsx's renderDeliveryCard: same
            // border/hover:shadow-md/cursor-pointer treatment, same grid
            // breakpoints). The only nested interactive element (the copy-code
            // button) stops its click from bubbling, exactly like that existing
            // pattern's own action buttons do.
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pageCodes.map((c) => {
                const status = getEffectiveStatus(c);
                return (
                  <Card
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(c)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(c); } }}
                    className="border-border/50 hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    data-testid={`card-discount-code-${c.code}`}
                    aria-label={`Modifier le code ${c.code}`}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono font-bold truncate">{c.code}</code>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); copy(c.code); }}
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            title="Copier le code"
                            data-testid={`button-copy-${c.code}`}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <Badge variant="secondary" className={`text-xs shrink-0 ${statusStyle[status]}`}>{STATUS_LABELS[status]}</Badge>
                      </div>
                      <p className="text-2xl font-bold text-amber-500">{discountLabel(c, fmt)}</p>
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground pt-2 border-t border-border/50">
                        <span>Utilisations : <span className="font-medium text-foreground">{c.usageCount}{c.maxUses != null ? ` / ${c.maxUses}` : ""}</span></span>
                        <span>Expire le : <span className="font-medium text-foreground">{formatExpiry(c.expiresAt)}</span></span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          {codes.length > 0 && (
            <div className="pt-3">
              <DataPagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                totalItems={codes.length}
                totalPages={pagination.totalPages}
                start={pagination.start}
                end={pagination.end}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
                itemLabel="codes"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog — same visual language as the rest of the Supplier account
          (Dialog/Label/Input/Select, matching e.g. the Promotions page's own form dialog). */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent hideClose className="max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
          <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={() => setFormOpen(false)} aria-label="Close" data-testid="button-close-discount-code-dialog">
            <X className="w-4 h-4" />
          </button>
          <DialogHeader>
            <DialogTitle>{editingCode ? "Modifier le code promotionnel" : "Créer un code promotionnel"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 min-w-0">
            <div className="space-y-1.5 min-w-0">
              <Label>Code *</Label>
              <Input
                value={codeInput}
                onChange={e => setCodeInput(e.target.value.toUpperCase())}
                placeholder="ex. SPRING15"
                className="font-mono w-full min-w-0"
                data-testid="input-discount-code"
              />
            </div>
            {/* min-w-0 on each grid cell lets its Label/Input shrink and wrap within
                its own column instead of forcing the row (and therefore the dialog)
                wider than max-w-md — a CSS Grid item's default min-width is "auto"
                (its content's intrinsic width), not 0, so a long label like "Montant
                de la réduction (DT) *" could otherwise push this column, and the
                whole dialog, past its intended width. */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 min-w-0">
                <Label>Type de réduction *</Label>
                <Select value={discountType} onValueChange={v => setDiscountType(v as "PERCENTAGE" | "FIXED_AMOUNT")}>
                  <SelectTrigger data-testid="select-discount-type" className="w-full min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Réduction en %</SelectItem>
                    <SelectItem value="FIXED_AMOUNT">Montant fixe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="block break-words">{discountType === "PERCENTAGE" ? "Pourcentage de réduction" : `Montant de la réduction (${symbol})`} *</Label>
                <Input
                  type="number" min="0" step={discountType === "PERCENTAGE" ? "0.1" : "0.001"}
                  value={discountValueInput}
                  onChange={e => setDiscountValueInput(e.target.value)}
                  placeholder={discountType === "PERCENTAGE" ? "ex. 15" : "ex. 10.000"}
                  className="w-full min-w-0"
                  data-testid="input-discount-value"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 min-w-0">
                <Label className="block break-words">Nombre maximum d'utilisations</Label>
                <Input type="number" min="1" value={maxUsesInput} onChange={e => setMaxUsesInput(e.target.value)} placeholder="Illimité" className="w-full min-w-0" data-testid="input-max-uses" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="block break-words">Valeur minimale de commande ({symbol})</Label>
                <Input type="number" min="0" step="0.001" value={minimumOrderAmountInput} onChange={e => setMinimumOrderAmountInput(e.target.value)} placeholder="Aucun minimum" className="w-full min-w-0" data-testid="input-min-order" />
              </div>
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label>Date d'expiration</Label>
              <Input type="datetime-local" value={expiresAtInput} onChange={e => setExpiresAtInput(e.target.value)} className="w-full min-w-0" data-testid="input-expires-at" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border p-4 min-w-0">
              <div className="min-w-0">
                <p className="font-medium text-sm">Actif</p>
                <p className="text-xs text-muted-foreground">Les clients peuvent utiliser ce code tant qu'il est actif.</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-code-active" />
            </div>
          </div>
          {/* flex-wrap (the DialogFooter base already applies flex flex-col-reverse
              sm:flex-row sm:justify-end sm:space-x-2) lets the three buttons wrap onto
              a second line instead of being forced into one unbreakable row — Button's
              own base class includes whitespace-nowrap, so without wrap, "Supprimer" +
              "Annuler" + "Enregistrer les modifications" together are wider than this
              max-w-md dialog's content box at sm:/md: widths, which is exactly what was
              forcing the horizontal scrollbar (this 3-button row only appears in Edit
              mode — Create's 2-button row already fit, which is why only Edit was
              reported). gap-2 keeps spacing consistent whether wrapped or not. */}
          <DialogFooter className="mt-2 flex-wrap gap-2">
            {editingCode && (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive mr-auto"
                onClick={() => { setFormOpen(false); setRemoveTarget(editingCode); }}
                data-testid="button-remove-code"
              >
                Supprimer
              </Button>
            )}
            {/* <Button variant="outline" onClick={() => setFormOpen(false)}>Annuler</Button> */}
            {creationBlocked && (
              <p className="text-xs text-destructive w-full sm:w-auto sm:mr-auto">La création de codes promotionnels a été désactivée par votre administrateur.</p>
            )}
            <Button onClick={handleSave} disabled={isSaving || creationBlocked} data-testid="button-save-code">
              {isSaving ? "Enregistrement…" : editingCode ? "Enregistrer les modifications" : "Créer le code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le code promotionnel ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cela supprimera le code <strong>{removeTarget?.code}</strong>. Les clients du café ne pourront plus l'utiliser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!removeTarget) return;
                deleteMut.mutate(removeTarget.id, {
                  onSuccess: () => { toast({ title: "Code supprimé" }); setRemoveTarget(null); },
                  onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
                });
              }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-remove-code"
            >
              {deleteMut.isPending ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
