import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tag, Plus, Calendar, Search, MoreHorizontal, Copy, Pause, Play,
  Trash2, Zap, Gift, Truck,
  Percent, DollarSign, ShoppingBag, Star, Users, TrendingUp,
  Check, Edit2, Package, BarChart3, Settings2, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency, useCurrency } from "@/hooks/use-currency";
import type { Promotion, PromotionType, PromotionStatus } from "@shared/schema";
import { DashboardHero, KpiOverviewButton, KpiOverviewModal } from "@/components/dashboard/dashboard-kit";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { computeCoverZoomScale, getAdjustmentFor } from "@/lib/image-adjustment";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePromotionSettings } from "@/hooks/use-promotion-settings";
import { usePromotionTypeSettings } from "@/hooks/use-promotion-type-settings";
import { Lock } from "lucide-react";

// ── API helpers ─────────────────────────────────────────────────────────────

const apiBase = "/api/promotions";

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) } });
  if (!res.ok) { const err = await res.json().catch(() => ({ message: "Error" })); throw new Error(err.message); }
  return res.json();
}

// ── Type helpers ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<PromotionType, string> = {
  PERCENTAGE: "Réduction en %",
  FIXED_AMOUNT: "Montant fixe",
  BUY_X_GET_Y: "Achetez X, obtenez Y",
  QUANTITY_TIER: "Tarification par palier",
  CATEGORY_DISCOUNT: "Réduction par catégorie",
  FREE_SHIPPING: "Livraison gratuite",
  GIFT: "Cadeau gratuit",
  MIN_ORDER_AMOUNT: "Montant minimum de commande",
  MIN_QUANTITY: "Quantité minimum",
  FIRST_ORDER: "Première commande",
};

// French display label for the effective promotion status badge — `PromotionStatus`
// itself (the stored enum) is never translated, only its rendered text here.
const STATUS_LABELS: Record<PromotionStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "En pause",
  SCHEDULED: "Programmée",
  EXPIRED: "Expirée",
};

const TYPE_ICONS: Record<PromotionType, JSX.Element> = {
  PERCENTAGE: <Percent className="w-4 h-4" />,
  FIXED_AMOUNT: <DollarSign className="w-4 h-4" />,
  BUY_X_GET_Y: <ShoppingBag className="w-4 h-4" />,
  QUANTITY_TIER: <BarChart3 className="w-4 h-4" />,
  CATEGORY_DISCOUNT: <Tag className="w-4 h-4" />,
  FREE_SHIPPING: <Truck className="w-4 h-4" />,
  GIFT: <Gift className="w-4 h-4" />,
  MIN_ORDER_AMOUNT: <DollarSign className="w-4 h-4" />,
  MIN_QUANTITY: <ShoppingBag className="w-4 h-4" />,
  FIRST_ORDER: <Star className="w-4 h-4" />,
};

function getEffectiveStatus(p: Promotion): PromotionStatus {
  const now = new Date();
  if (p.status === 'PAUSED') return 'PAUSED';
  if (p.endDate && new Date(p.endDate) < now) return 'EXPIRED';
  if (p.startDate && new Date(p.startDate) > now) return 'SCHEDULED';
  return p.status;
}

const STATUS_STYLES: Record<PromotionStatus, string> = {
  ACTIVE: "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30",
  PAUSED: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/30",
  SCHEDULED: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30",
  EXPIRED: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-500/15 dark:text-gray-400 dark:border-gray-500/30",
};

function discountLabel(p: Promotion, fmt: (n: number) => string): string {
  // discountValue (for FIXED_AMOUNT/MIN_ORDER_AMOUNT) and freeShippingMinAmount are
  // stored in cents (shared/schema.ts's own column comments), the same unit fmt()
  // expects — no conversion needed. (A prior pass here incorrectly divided by 10,
  // based on the wrong assumption that these fields were milli-DT; the actual unit
  // bug was in formToPayload/promoToForm below, now fixed — see
  // PROMOTION_MINIMUM_ORDER_ELIGIBILITY_THEME_REALTIME_REPORT.md.)
  switch (p.type) {
    case 'PERCENTAGE':
    case 'CATEGORY_DISCOUNT':
    case 'MIN_QUANTITY':
    case 'FIRST_ORDER': return `${p.discountValue / 100}% de réduction`;
    case 'FIXED_AMOUNT':
    case 'MIN_ORDER_AMOUNT': return `${fmt(p.discountValue)} de réduction`;
    case 'BUY_X_GET_Y': return `Achetez ${p.buyQuantity}, obtenez ${p.getQuantity} gratuit${p.getQuantity !== 1 ? "s" : ""}`;
    case 'QUANTITY_TIER': return 'Tarification par palier';
    case 'FREE_SHIPPING': return p.freeShippingMinAmount ? `Livraison gratuite à partir de ${fmt(p.freeShippingMinAmount)}` : 'Toujours la livraison gratuite';
    case 'GIFT': return 'Cadeau gratuit';
    default: return '';
  }
}

// ── Form state ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  description: "",
  internalNotes: "",
  type: "PERCENTAGE" as PromotionType,
  status: "ACTIVE" as PromotionStatus,
  priority: 0,
  startDate: "",
  endDate: "",
  maxUses: "",
  maxUsesPerCustomer: "",
  minimumOrderValue: "",
  minimumQuantity: "",
  maximumDiscount: "",
  stackable: false,
  discountValue: "",
  buyQuantity: "",
  getQuantity: "",
  freeShippingMinAmount: "",
  targetType: "ALL" as "ALL" | "PRODUCTS" | "CATEGORIES",
  giftDescription: "",
  giftQuantity: "1",
};

type FormState = typeof EMPTY_FORM;

function formToPayload(f: FormState) {
  // minimumOrderValue/maximumDiscount/freeShippingMinAmount, and discountValue for
  // the FIXED_AMOUNT/MIN_ORDER_AMOUNT types, are all stored in CENTS on the
  // `promotions` row (shared/schema.ts's own column comments) — the same unit as
  // every price elsewhere in the app (`Math.round(dt * 100)`, e.g. the variant price
  // save endpoint). The *1000 used here previously was the Discount Codes feature's
  // unrelated "millimes" convention, copied onto this form by mistake — the root
  // cause of the "10.000 DT -> 100.000 DT" Promotion Details bug. See
  // PROMOTION_MINIMUM_ORDER_ELIGIBILITY_THEME_REALTIME_REPORT.md.
  const base: Record<string, any> = {
    name: f.name.trim(),
    description: f.description.trim() || null,
    internalNotes: f.internalNotes.trim() || null,
    type: f.type,
    status: f.status,
    priority: Number(f.priority) || 0,
    startDate: f.startDate || null,
    endDate: f.endDate || null,
    maxUses: f.maxUses ? Number(f.maxUses) : null,
    maxUsesPerCustomer: f.maxUsesPerCustomer ? Number(f.maxUsesPerCustomer) : null,
    minimumOrderValue: f.minimumOrderValue ? Math.round(parseFloat(f.minimumOrderValue) * 100) : null,
    minimumQuantity: f.minimumQuantity ? Number(f.minimumQuantity) : null,
    maximumDiscount: f.maximumDiscount ? Math.round(parseFloat(f.maximumDiscount) * 100) : null,
    stackable: f.stackable,
    targetType: f.targetType,
    discountValue: 0,
    buyQuantity: null,
    getQuantity: null,
    freeShippingMinAmount: null,
    giftInfo: null,
    tiers: null,
  };

  switch (f.type) {
    case 'PERCENTAGE':
    case 'CATEGORY_DISCOUNT':
    case 'MIN_QUANTITY':
    case 'FIRST_ORDER':
      base.discountValue = Math.round(parseFloat(f.discountValue || '0') * 100);
      break;
    case 'FIXED_AMOUNT':
    case 'MIN_ORDER_AMOUNT':
      base.discountValue = Math.round(parseFloat(f.discountValue || '0') * 100);
      break;
    case 'BUY_X_GET_Y':
      base.buyQuantity = Number(f.buyQuantity) || 1;
      base.getQuantity = Number(f.getQuantity) || 1;
      break;
    case 'FREE_SHIPPING':
      base.freeShippingMinAmount = f.freeShippingMinAmount ? Math.round(parseFloat(f.freeShippingMinAmount) * 100) : 0;
      break;
    case 'GIFT':
      base.giftInfo = { description: f.giftDescription || 'Cadeau gratuit', quantity: Number(f.giftQuantity) || 1 };
      break;
  }
  return base;
}

function promoToForm(p: Promotion): FormState {
  const f: FormState = { ...EMPTY_FORM };
  f.name = p.name;
  f.description = p.description ?? "";
  f.internalNotes = p.internalNotes ?? "";
  f.type = p.type;
  f.status = p.status;
  f.priority = p.priority;
  f.startDate = p.startDate ? new Date(p.startDate).toISOString().slice(0, 16) : "";
  f.endDate = p.endDate ? new Date(p.endDate).toISOString().slice(0, 16) : "";
  f.maxUses = p.maxUses?.toString() ?? "";
  f.maxUsesPerCustomer = p.maxUsesPerCustomer?.toString() ?? "";
  f.minimumOrderValue = p.minimumOrderValue ? (p.minimumOrderValue / 100).toFixed(3) : "";
  f.minimumQuantity = p.minimumQuantity?.toString() ?? "";
  f.maximumDiscount = p.maximumDiscount ? (p.maximumDiscount / 100).toFixed(3) : "";
  f.stackable = p.stackable;
  f.targetType = p.targetType;
  switch (p.type) {
    case 'PERCENTAGE':
    case 'CATEGORY_DISCOUNT':
    case 'MIN_QUANTITY':
    case 'FIRST_ORDER':
      f.discountValue = (p.discountValue / 100).toString();
      break;
    case 'FIXED_AMOUNT':
    case 'MIN_ORDER_AMOUNT':
      f.discountValue = (p.discountValue / 100).toFixed(3);
      break;
    case 'BUY_X_GET_Y':
      f.buyQuantity = p.buyQuantity?.toString() ?? "1";
      f.getQuantity = p.getQuantity?.toString() ?? "1";
      break;
    case 'FREE_SHIPPING':
      f.freeShippingMinAmount = p.freeShippingMinAmount ? (p.freeShippingMinAmount / 100).toFixed(3) : "";
      break;
    case 'GIFT': {
      const gi = p.giftInfo as any;
      f.giftDescription = gi?.description ?? "";
      f.giftQuantity = gi?.quantity?.toString() ?? "1";
      break;
    }
  }
  return f;
}

// ── Promotion Form ──────────────────────────────────────────────────────────

function PromotionForm({ form, onChange, enabledTypes, originalType }: {
  form: FormState;
  onChange: (f: FormState) => void;
  // Admin → System Management → Promotion's per-type toggle (task: "Admin Promotion
  // Management — Supplier Promotions Visibility and Type Configuration"). Only these
  // types are offered for a NEW selection.
  enabledTypes: Set<PromotionType>;
  // When editing an existing promotion whose type has since been hidden, its type must
  // still display correctly and remain selected — never silently swapped to another
  // type or dropped from the list — even though it can't be chosen for anything else.
  originalType: PromotionType | null;
}) {
  const symbol = useCurrency();
  const set = (k: keyof FormState, v: any) => onChange({ ...form, [k]: v });

  const typeOptions = (Object.entries(TYPE_LABELS) as [PromotionType, string][])
    .filter(([k]) => enabledTypes.has(k) || k === originalType);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label>Nom de la promotion *</Label>
          <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="ex. Promotion café de printemps" />
        </div>
        <div className="space-y-1.5">
          <Label>Type *</Label>
          <Select value={form.type} onValueChange={v => set('type', v as PromotionType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {typeOptions.map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}{k === originalType && !enabledTypes.has(k) ? " (masqué)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Statut</Label>
          <Select value={form.status} onValueChange={v => set('status', v as PromotionStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">En pause</SelectItem>
              <SelectItem value="SCHEDULED">Programmée</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Type-specific discount fields */}
      {['PERCENTAGE', 'CATEGORY_DISCOUNT', 'MIN_QUANTITY', 'FIRST_ORDER'].includes(form.type) && (
        <div className="space-y-1.5">
          <Label>Pourcentage de réduction *</Label>
          <div className="relative">
            <Input type="number" min="0" max="100" step="0.1" value={form.discountValue} onChange={e => set('discountValue', e.target.value)} placeholder="ex. 20" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
          </div>
        </div>
      )}
      {['FIXED_AMOUNT', 'MIN_ORDER_AMOUNT'].includes(form.type) && (
        <div className="space-y-1.5">
          <Label>Montant de la réduction ({symbol}) *</Label>
          <Input type="number" min="0" step="0.001" value={form.discountValue} onChange={e => set('discountValue', e.target.value)} placeholder="ex. 10.000" />
        </div>
      )}
      {form.type === 'BUY_X_GET_Y' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Quantité à acheter *</Label>
            <Input type="number" min="1" value={form.buyQuantity} onChange={e => set('buyQuantity', e.target.value)} placeholder="ex. 10" />
          </div>
          <div className="space-y-1.5">
            <Label>Quantité gratuite obtenue *</Label>
            <Input type="number" min="1" value={form.getQuantity} onChange={e => set('getQuantity', e.target.value)} placeholder="ex. 1" />
          </div>
        </div>
      )}
      {form.type === 'FREE_SHIPPING' && (
        <div className="space-y-1.5">
          <Label>Montant minimum de commande ({symbol}) — laisser vide pour une livraison toujours gratuite</Label>
          <Input type="number" min="0" step="0.001" value={form.freeShippingMinAmount} onChange={e => set('freeShippingMinAmount', e.target.value)} placeholder="ex. 300.000" />
        </div>
      )}
      {form.type === 'GIFT' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Description du cadeau *</Label>
            <Input value={form.giftDescription} onChange={e => set('giftDescription', e.target.value)} placeholder="ex. Sachet d'échantillon de sucre offert" />
          </div>
          <div className="space-y-1.5">
            <Label>Quantité du cadeau</Label>
            <Input type="number" min="1" value={form.giftQuantity} onChange={e => set('giftQuantity', e.target.value)} />
          </div>
        </div>
      )}

      <Separator />

      {/* Dates & limits */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Date de début</Label>
          <Input type="datetime-local" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Date de fin</Label>
          <Input type="datetime-local" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Nombre maximum d'utilisations</Label>
          <Input type="number" min="1" value={form.maxUses} onChange={e => set('maxUses', e.target.value)} placeholder="Illimité" />
        </div>
        <div className="space-y-1.5">
          <Label>Maximum par client</Label>
          <Input type="number" min="1" value={form.maxUsesPerCustomer} onChange={e => set('maxUsesPerCustomer', e.target.value)} placeholder="Illimité" />
        </div>
      </div>

      {/* Conditions */}
      <div className="grid grid-cols-2 gap-4">
        {['MIN_ORDER_AMOUNT', 'GIFT', 'FREE_SHIPPING'].includes(form.type) === false && (
          <div className="space-y-1.5">
            <Label>Valeur minimum de commande ({symbol})</Label>
            <Input type="number" min="0" step="0.001" value={form.minimumOrderValue} onChange={e => set('minimumOrderValue', e.target.value)} placeholder="Aucun minimum" />
          </div>
        )}
        {!['BUY_X_GET_Y', 'MIN_QUANTITY'].includes(form.type) || true ? (
          <div className="space-y-1.5">
            <Label>Quantité minimum</Label>
            <Input type="number" min="0" value={form.minimumQuantity} onChange={e => set('minimumQuantity', e.target.value)} placeholder="Aucun minimum" />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label>Plafond de réduction ({symbol})</Label>
          <Input type="number" min="0" step="0.001" value={form.maximumDiscount} onChange={e => set('maximumDiscount', e.target.value)} placeholder="Aucun plafond" />
        </div>
        <div className="space-y-1.5">
          <Label>Priorité (plus élevé = appliqué en premier)</Label>
          <Input type="number" value={form.priority} onChange={e => set('priority', Number(e.target.value))} placeholder="0" />
        </div>
      </div>

      {/* Applies to */}
      <div className="space-y-1.5">
        <Label>S'applique à</Label>
        <Select value={form.targetType} onValueChange={v => set('targetType', v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous mes produits</SelectItem>
            <SelectItem value="PRODUCTS">Produits spécifiques</SelectItem>
            <SelectItem value="CATEGORIES">Catégories spécifiques</SelectItem>
          </SelectContent>
        </Select>
        {form.targetType !== 'ALL' && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Settings2 className="w-3 h-3 shrink-0" />
            Après l'enregistrement, utilisez le bouton <strong>Gérer les assignations</strong> sur la carte de la promotion pour assigner des {form.targetType === 'PRODUCTS' ? 'produits' : 'catégories'} spécifiques.
          </p>
        )}
      </div>

      <Separator />

      {/* Stacking & notes */}
      <div className="flex items-center justify-between rounded-xl border p-4">
        <div>
          <p className="font-medium text-sm">Cumulable</p>
          <p className="text-xs text-muted-foreground">Peut se combiner avec d'autres promotions pour la même commande</p>
        </div>
        <Switch checked={form.stackable} onCheckedChange={v => set('stackable', v)} />
      </div>

      <div className="space-y-1.5">
        <Label>Description (visible par les clients)</Label>
        <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ce que les clients verront à propos de cette promotion" rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label>Notes internes (non visibles par les clients)</Label>
        <Textarea value={form.internalNotes} onChange={e => set('internalNotes', e.target.value)} placeholder="Notes pour votre équipe" rows={2} />
      </div>
    </div>
  );
}

// ── Listing item type (returned by /api/promotions/my-listings) ───────────────

type ListingItem = {
  listingId: number;
  productId: number;
  productName: string;
  imageUrl: string | null;
  imageAdjustments?: Record<string, number> | null;
  category: string;
  categoryId: number | null;
  price: number;
  stock: number;
};

type CategoryItem = {
  id: number;
  name: string;
  productCount: number;
};

// ── Promotion Assignment Dialog ───────────────────────────────────────────────

function PromotionAssignmentDialog({
  promo,
  onClose,
  onSaved,
}: {
  promo: Promotion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const isProducts = promo.targetType === 'PRODUCTS';
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("__all__");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => {
    const existing = isProducts
      ? (promo.targetListingIds ?? [])
      : (promo.targetCategoryIds ?? []);
    return new Set(existing);
  });
  const [saving, setSaving] = useState(false);

  const { data: listings = [], isLoading: loadingListings } = useQuery<ListingItem[]>({
    queryKey: ["/api/promotions/my-listings"],
    queryFn: () => fetchJSON("/api/promotions/my-listings"),
    enabled: isProducts,
  });

  const { data: categories = [], isLoading: loadingCategories } = useQuery<CategoryItem[]>({
    queryKey: ["/api/promotions/my-categories"],
    queryFn: () => fetchJSON("/api/promotions/my-categories"),
    enabled: !isProducts,
  });

  // Unique categories from listings for filter dropdown
  const categoryOptions = useMemo(() => {
    if (!isProducts) return [];
    const map = new Map<string, string>();
    listings.forEach(l => { if (l.category) map.set(l.category, l.category); });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [listings, isProducts]);

  const filteredListings = useMemo(() => {
    let list = listings;
    if (search.trim()) list = list.filter(l => l.productName.toLowerCase().includes(search.toLowerCase()));
    if (filterCategory !== "__all__") list = list.filter(l => l.category === filterCategory);
    return list;
  }, [listings, search, filterCategory]);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    return categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  }, [categories, search]);

  const toggleId = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (isProducts) setSelectedIds(new Set(filteredListings.map(l => l.listingId)));
    else setSelectedIds(new Set(filteredCategories.map(c => c.id)));
  };

  const deselectAll = () => setSelectedIds(new Set());

  const handleSave = async () => {
    setSaving(true);
    try {
      // Use the dedicated targets PATCH endpoint — only touches the two array fields,
      // never serialises dates or other promotion fields, so no toISOString() risk.
      const payload = isProducts
        ? { targetListingIds: Array.from(selectedIds) }
        : { targetCategoryIds: Array.from(selectedIds) };
      await fetchJSON(`${apiBase}/${promo.id}/targets`, { method: "PATCH", body: JSON.stringify(payload) });
      const count = selectedIds.size;
      const noun = isProducts
        ? `${count} produit${count !== 1 ? "s" : ""}`
        : `${count} catégorie${count !== 1 ? "s" : ""}`;
      toast({ title: "Assignations enregistrées", description: `${noun} assigné(s) à cette promotion.` });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Erreur lors de l'enregistrement", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isLoading = isProducts ? loadingListings : loadingCategories;
  const totalItems = isProducts ? listings.length : categories.length;
  const assignedCount = selectedIds.size;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent hideClose className="max-w-2xl max-h-[90vh] flex flex-col">
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose} aria-label="Close" data-testid="button-close-promotion-assignment">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-amber-600" />
            Gérer les assignations de {isProducts ? "produits" : "catégories"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            <strong>{promo.name}</strong> — sélectionnez les {isProducts ? "produits" : "catégories"} auxquels cette promotion s'applique.
          </p>
        </DialogHeader>

        {/* Summary bar */}
        <div className="flex items-center justify-between rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-2.5 text-sm">
          <span className="text-amber-800 dark:text-amber-400 font-medium">
            {assignedCount} sur {totalItems} {isProducts ? "produits" : "catégories"} assigné(s)
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={selectAll}>Tout sélectionner (visible)</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={deselectAll}>Tout désélectionner</Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder={isProducts ? "Rechercher des produits…" : "Rechercher des catégories…"}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {isProducts && categoryOptions.length > 0 && (
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-8 text-sm w-40">
                <SelectValue placeholder="Toutes les catégories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes les catégories</SelectItem>
                {categoryOptions.map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Item list — thin scrollbar treatment, same thumb/track/hover classes used
            elsewhere in the app, not a new scrollbar style. */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 rounded-lg bg-secondary/40 animate-pulse" />)}
            </div>
          ) : isProducts ? (
            filteredListings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Package className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">Aucun produit trouvé</p>
              </div>
            ) : (
              filteredListings.map(listing => {
                const checked = selectedIds.has(listing.listingId);
                return (
                  <div
                    key={listing.listingId}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors border ${checked ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30" : "border-transparent hover:bg-secondary/40"}`}
                    onClick={() => toggleId(listing.listingId)}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleId(listing.listingId)} className="shrink-0" onClick={e => e.stopPropagation()} />
                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                      {listing.imageUrl ? (
                        <div style={{ width: "100%", height: "100%", transform: `scale(${computeCoverZoomScale(getAdjustmentFor(listing.imageAdjustments, listing.imageUrl))})`, transformOrigin: "center" }}>
                          <img src={listing.imageUrl} alt={listing.productName} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-4 h-4 text-gray-300 dark:text-gray-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{listing.productName}</p>
                      <p className="text-xs text-muted-foreground">{listing.category}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{fmt(listing.price)}</p>
                      <p className={`text-xs ${listing.stock === 0 ? "text-destructive" : listing.stock < 10 ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"}`}>
                        {listing.stock === 0 ? "Rupture de stock" : `${listing.stock} en stock`}
                      </p>
                    </div>
                    {checked && <Check className="w-4 h-4 text-amber-600 shrink-0" />}
                  </div>
                );
              })
            )
          ) : (
            filteredCategories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Tag className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">Aucune catégorie trouvée</p>
              </div>
            ) : (
              filteredCategories.map(cat => {
                const checked = selectedIds.has(cat.id);
                return (
                  <div
                    key={cat.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors border ${checked ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30" : "border-transparent hover:bg-secondary/40"}`}
                    onClick={() => toggleId(cat.id)}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleId(cat.id)} className="shrink-0" onClick={e => e.stopPropagation()} />
                    <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                      <Tag className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{cat.name}</p>
                      <p className="text-xs text-muted-foreground">{cat.productCount} produit{cat.productCount !== 1 ? "s" : ""} dans cette catégorie</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="secondary" className="text-xs">{cat.productCount} produits</Badge>
                    </div>
                    {checked && <Check className="w-4 h-4 text-amber-600 shrink-0" />}
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Footer */}
        {isProducts && (
          <p className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-2.5">
            Seuls les produits actuellement assignés bénéficient de la promotion. Les nouveaux produits que vous ajouterez devront être assignés manuellement.
          </p>
        )}
        {!isProducts && (
          <p className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-2.5">
            Tous les produits des catégories assignées bénéficient automatiquement de la promotion, y compris les nouveaux produits que vous ajouterez ultérieurement à ces catégories.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement…" : `Enregistrer les assignations (${assignedCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Promotion Card ──────────────────────────────────────────────────────────

function PromotionCard({
  promo, onEdit, onDuplicate, onDelete, onStatusChange, onManageAssignments,
}: {
  promo: Promotion;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onStatusChange: (s: PromotionStatus) => void;
  onManageAssignments: () => void;
}) {
  const fmt = useFormatCurrency();
  const [showMenu, setShowMenu] = useState(false);
  const effectiveStatus = getEffectiveStatus(promo);
  const remaining = promo.maxUses != null ? promo.maxUses - promo.usageCount : null;
  const icon = TYPE_ICONS[promo.type];

  const targetBadgeLabel =
    promo.targetType === 'PRODUCTS'
      ? `${(promo.targetListingIds ?? []).length} produit${(promo.targetListingIds ?? []).length !== 1 ? "s" : ""} assigné${(promo.targetListingIds ?? []).length !== 1 ? "s" : ""}`
      : promo.targetType === 'CATEGORIES'
      ? `${(promo.targetCategoryIds ?? []).length} catégorie${(promo.targetCategoryIds ?? []).length !== 1 ? "s" : ""} assignée${(promo.targetCategoryIds ?? []).length !== 1 ? "s" : ""}`
      : null;

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="bg-amber-500/10 rounded-xl p-2.5 shrink-0 text-amber-600 mt-0.5">
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="font-semibold text-foreground truncate">{promo.name}</p>
                <Badge className={`text-xs border ${STATUS_STYLES[effectiveStatus]}`} variant="outline">
                  {STATUS_LABELS[effectiveStatus]}
                </Badge>
                <Badge variant="secondary" className="text-xs bg-primary/5 text-primary border-primary/20">
                  {TYPE_LABELS[promo.type]}
                </Badge>
                {promo.stackable && (
                  <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30">Cumulable</Badge>
                )}
                {promo.targetType !== 'ALL' && (
                  <Badge
                    variant="outline"
                    className={`text-xs cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-500/10 ${(promo.targetListingIds ?? []).length === 0 && (promo.targetCategoryIds ?? []).length === 0 ? "text-destructive border-destructive/30" : "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30"}`}
                    onClick={onManageAssignments}
                  >
                    <Settings2 className="w-3 h-3 mr-1" />
                    {targetBadgeLabel ?? (promo.targetType === 'PRODUCTS' ? "Aucun produit assigné" : "Aucune catégorie assignée")}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-amber-600 font-semibold">{discountLabel(promo, fmt)}</p>
              {promo.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{promo.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                {(promo.startDate || promo.endDate) && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {promo.startDate ? new Date(promo.startDate).toLocaleDateString() : '—'}
                    {' → '}
                    {promo.endDate ? new Date(promo.endDate).toLocaleDateString() : '∞'}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Priorité {promo.priority}
                </span>
                <span>{promo.usageCount} utilisation{promo.usageCount !== 1 ? "s" : ""}{remaining != null ? ` · ${remaining} restante${remaining !== 1 ? "s" : ""}` : ''}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 w-full justify-end sm:w-auto sm:justify-start">
            {promo.targetType !== 'ALL' && (
              <Button size="sm" variant="outline" onClick={onManageAssignments} className="h-8 px-2 text-xs gap-1 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                <Settings2 className="w-3 h-3" /> Gérer
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onEdit} className="h-8 w-8 p-0"><Edit2 className="w-3.5 h-3.5" /></Button>
            <div className="relative">
              <Button size="sm" variant="outline" onClick={() => setShowMenu(!showMenu)} className="h-8 w-8 p-0"><MoreHorizontal className="w-4 h-4" /></Button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-9 z-20 bg-background border border-border rounded-xl shadow-lg py-1 w-44">
                    {effectiveStatus === 'ACTIVE' ? (
                      <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-secondary" onClick={() => { setShowMenu(false); onStatusChange('PAUSED'); }}>
                        <Pause className="w-3.5 h-3.5" /> Mettre en pause
                      </button>
                    ) : effectiveStatus === 'PAUSED' ? (
                      <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-secondary" onClick={() => { setShowMenu(false); onStatusChange('ACTIVE'); }}>
                        <Play className="w-3.5 h-3.5" /> Reprendre
                      </button>
                    ) : null}
                    <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-secondary" onClick={() => { setShowMenu(false); onDuplicate(); }}>
                      <Copy className="w-3.5 h-3.5" /> Dupliquer
                    </button>
                    <Separator className="my-1" />
                    <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10" onClick={() => { setShowMenu(false); onDelete(); }}>
                      <Trash2 className="w-3.5 h-3.5" /> Supprimer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function PromotionsPage() {
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [kpiModalOpen, setKpiModalOpen] = useState(false);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
  const [assigningPromo, setAssigningPromo] = useState<Promotion | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Admin → System Management → Promotion (task: "Admin Promotion Management —
  // Supplier Promotions Visibility and Type Configuration"). globalVisible gates the
  // whole page below; typeSettings drives the Create/Edit form's Type picklist.
  const { settings: promotionSettings } = usePromotionSettings();
  const { settings: typeSettings } = usePromotionTypeSettings();
  const enabledTypes = useMemo(
    () => new Set((Object.keys(TYPE_LABELS) as PromotionType[]).filter(t => typeSettings[t] !== false)),
    [typeSettings],
  );

  // Data — never fetched while the feature is hidden (the server would 403 anyway;
  // this just avoids the pointless request/console error).
  const { data: promos = [], isLoading } = useQuery<Promotion[]>({
    queryKey: ["/api/promotions"],
    queryFn: () => fetchJSON(apiBase),
    enabled: promotionSettings.globalVisible,
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/promotions/stats"],
    queryFn: () => fetchJSON(`${apiBase}/stats`),
    enabled: promotionSettings.globalVisible,
  });

  // Mutations
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/promotions"] });
    // Also invalidate marketplace promotion badges so they reflect changes
    qc.invalidateQueries({ queryKey: ["/api/marketplace/promotions"] });
  };

  const createMut = useMutation({
    mutationFn: (data: any) => fetchJSON(apiBase, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (newPromo: Promotion) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/promotions/stats"] });
      setFormOpen(false);
      toast({ title: "Promotion créée" });
      // If targeting specific products/categories, immediately open assignment dialog
      if (newPromo.targetType !== 'ALL') {
        setTimeout(() => setAssigningPromo(newPromo), 150);
      }
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => fetchJSON(`${apiBase}/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { invalidate(); setFormOpen(false); toast({ title: "Promotion mise à jour" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => fetchJSON(`${apiBase}/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["/api/promotions/stats"] }); toast({ title: "Promotion supprimée" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: PromotionStatus }) =>
      fetchJSON(`${apiBase}/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const dupMut = useMutation({
    mutationFn: (id: number) => fetchJSON(`${apiBase}/${id}/duplicate`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast({ title: "Promotion dupliquée" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditingPromo(null);
    // Default to the first currently-enabled type rather than always "PERCENTAGE" —
    // if PERCENTAGE itself were hidden by the Admin, a new promotion must never
    // silently start on a type the supplier can no longer actually save.
    const firstEnabled = (Object.keys(TYPE_LABELS) as PromotionType[]).find(t => enabledTypes.has(t));
    setForm({ ...EMPTY_FORM, type: firstEnabled ?? EMPTY_FORM.type });
    setFormOpen(true);
  };
  const openEdit = (p: Promotion) => { setEditingPromo(p); setForm(promoToForm(p)); setFormOpen(true); };

  const handleSave = () => {
    if (!form.name.trim()) { toast({ title: "Le nom est requis", variant: "destructive" }); return; }
    const payload = formToPayload(form);
    if (editingPromo) updateMut.mutate({ id: editingPromo.id, data: payload });
    else createMut.mutate(payload);
  };

  // Filtered list
  const filtered = promos.filter(p => {
    const effectiveStatus = getEffectiveStatus(p);
    if (filterStatus !== "ALL" && effectiveStatus !== filterStatus) return false;
    if (filterType !== "ALL" && p.type !== filterType) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const isSaving = createMut.isPending || updateMut.isPending;
  const hasFilters = !!search || filterStatus !== "ALL" || filterType !== "ALL";
  const clearFilters = () => { setSearch(""); setFilterStatus("ALL"); setFilterType("ALL"); };

  const pagination = usePagination(filtered.length);
  useEffect(() => { pagination.resetPage(); }, [search, filterStatus, filterType, filtered.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pagePromos = filtered.slice(pagination.start, pagination.end);

  const kpiItems = [
    { label: "Actives", value: stats?.active ?? promos.filter(p => getEffectiveStatus(p) === 'ACTIVE').length, icon: <Zap className="w-4 h-4 text-green-600 dark:text-green-400" />, color: "bg-green-50 dark:bg-green-500/10" },
    { label: "En pause", value: stats?.paused ?? promos.filter(p => getEffectiveStatus(p) === 'PAUSED').length, icon: <Pause className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />, color: "bg-yellow-50 dark:bg-yellow-500/10" },
    { label: "Utilisations totales", value: stats?.totalUses ?? promos.reduce((s, p) => s + p.usageCount, 0), icon: <Users className="w-4 h-4 text-primary" />, color: "bg-primary/5" },
    { label: "Économies générées", value: stats?.totalDiscount != null ? fmt(stats.totalDiscount) : "—", icon: <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />, color: "bg-blue-50 dark:bg-blue-500/10" },
  ];

  // Admin → System Management → Promotion's global toggle, checked directly through
  // the normal URL too (task: "Prevent ordinary suppliers from accessing the
  // Promotions page directly through its URL... Display an appropriate French
  // message"). Reactive — usePromotionSettings is a useQuery kept in sync by
  // use-realtime.ts's promotion_settings_updated handler, so an Admin disabling this
  // while a Supplier already has this page open shows the message immediately, no
  // refresh needed. The backend independently enforces the same rule on every
  // Supplier-facing promotion endpoint (requirePromotionsEnabled in
  // shop-catalog.routes.ts) — this page-level gate is for a clean UX, not the only
  // protection.
  if (!promotionSettings.globalVisible) {
    return (
      <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
        <DashboardHero title="Promotions" subtitle="Créez et gérez des campagnes promotionnelles pour vos produits." />
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
        title="Promotions"
        subtitle="Créez et gérez des campagnes promotionnelles pour vos produits."
        action={
          <>
            <Button onClick={openCreate} size="sm"><Plus className="w-4 h-4 mr-1.5" /> Créer une promotion</Button>
            {isMobile && <KpiOverviewButton onClick={() => setKpiModalOpen(true)} />}
          </>
        }
      />

      {/* Stats */}
      {!isMobile && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiItems.map(({ label, value, icon, color }) => (
            <Card key={label} className="rounded-xl border-border/60">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`rounded-xl p-2.5 shrink-0 ${color}`}>{icon}</div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <KpiOverviewModal open={isMobile && kpiModalOpen} onClose={() => setKpiModalOpen(false)}>
        <div className="grid grid-cols-2 gap-3">
          {kpiItems.map(({ label, value, icon, color }) => (
            <Card key={label} className="rounded-xl border-border/60">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`rounded-xl p-2.5 shrink-0 ${color}`}>{icon}</div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </KpiOverviewModal>

      {/* Filters */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1 -mb-1 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0 sm:mb-0" style={{ scrollbarWidth: "none" }}>
        <div className="relative shrink-0 sm:flex-1 sm:min-w-48">
          {!searchOpen && (
            <button
              type="button"
              className="sm:hidden w-9 h-9 flex items-center justify-center rounded-md border border-input text-muted-foreground"
              onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
              aria-label="Ouvrir la recherche"
              data-testid="button-open-promotions-search"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
          <div className={`${searchOpen ? "flex" : "hidden"} sm:flex items-center relative w-48 sm:w-auto`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              className="pl-9 h-9"
              placeholder="Rechercher des promotions…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onBlur={() => { if (!search) setSearchOpen(false); }}
            />
          </div>
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9 shrink-0"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les statuts</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">En pause</SelectItem>
            <SelectItem value="SCHEDULED">Programmée</SelectItem>
            <SelectItem value="EXPIRED">Expirée</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44 h-9 shrink-0"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les types</SelectItem>
            {(Object.entries(TYPE_LABELS) as [PromotionType, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="outline" size="sm" className="text-muted-foreground shrink-0" onClick={clearFilters}>
            <X className="w-3.5 h-3.5 mr-1" />Effacer
          </Button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-secondary/40 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Tag className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-semibold text-lg mb-1">
            {promos.length === 0 ? "Aucune promotion pour le moment" : "Aucune promotion ne correspond à vos filtres"}
          </h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            {promos.length === 0
              ? "Créez votre première promotion pour commencer à proposer des réductions à vos clients."
              : "Essayez d'ajuster les critères de recherche ou de filtrage."}
          </p>
          {promos.length === 0 && (
            <Button className="mt-5" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" /> Créer une promotion
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {pagePromos.map(p => (
            <PromotionCard
              key={p.id}
              promo={p}
              onEdit={() => openEdit(p)}
              onDuplicate={() => dupMut.mutate(p.id)}
              onDelete={() => setDeleteTarget(p)}
              onStatusChange={s => statusMut.mutate({ id: p.id, status: s })}
              onManageAssignments={() => setAssigningPromo(p)}
            />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <DataPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={filtered.length}
          totalPages={pagination.totalPages}
          start={pagination.start}
          end={pagination.end}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemLabel="promotions"
        />
      )}

      {/* Create / Edit Dialog — thin scrollbar treatment, same thumb/track/hover
          classes used elsewhere in the app, not a new scrollbar style. */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent hideClose className="max-w-xl max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
          <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={() => setFormOpen(false)} aria-label="Close" data-testid="button-close-promotion-dialog">
            <X className="w-4 h-4" />
          </button>
          <DialogHeader>
            <DialogTitle>{editingPromo ? "Modifier la promotion" : "Créer une promotion"}</DialogTitle>
          </DialogHeader>
          {/* No type available for a NEW promotion — the existing promo being edited
              (if any) always keeps its own type regardless of this, so editing is never
              blocked here (task: "If all promotion types are hidden, display an
              appropriate French empty state instead of an unusable form"). */}
          {!editingPromo && enabledTypes.size === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Lock className="w-8 h-8 mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground max-w-xs">
                Aucun type de promotion n'est actuellement disponible. Veuillez contacter l'administrateur.
              </p>
            </div>
          ) : (
            <>
              <PromotionForm form={form} onChange={setForm} enabledTypes={enabledTypes} originalType={editingPromo?.type ?? null} />
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setFormOpen(false)}>Annuler</Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Enregistrement…" : editingPromo ? "Enregistrer les modifications" : "Créer une promotion"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Assignment Dialog */}
      {assigningPromo && assigningPromo.targetType !== 'ALL' && (
        <PromotionAssignmentDialog
          promo={assigningPromo}
          onClose={() => setAssigningPromo(null)}
          onSaved={() => { invalidate(); }}
        />
      )}

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la promotion</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget?.name}</strong> ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { deleteMut.mutate(deleteTarget.id); setDeleteTarget(null); } }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
