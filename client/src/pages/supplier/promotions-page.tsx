import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Tag, Plus, Calendar, Search, MoreHorizontal, Copy, Pause, Play,
  Trash2, Eye, BarChart3, TrendingUp, Users, Zap, Gift, Truck,
  Percent, DollarSign, ShoppingBag, Star, Filter, ChevronDown,
  Check, X, Edit2, AlertCircle, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import type { Promotion, PromotionType, PromotionStatus } from "@shared/schema";

// ── API helpers ─────────────────────────────────────────────────────────────

const apiBase = "/api/promotions";

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) } });
  if (!res.ok) { const err = await res.json().catch(() => ({ message: "Error" })); throw new Error(err.message); }
  return res.json();
}

// ── Type helpers ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<PromotionType, string> = {
  PERCENTAGE: "% Discount",
  FIXED_AMOUNT: "Fixed Amount",
  BUY_X_GET_Y: "Buy X Get Y",
  QUANTITY_TIER: "Tier Pricing",
  CATEGORY_DISCOUNT: "Category Discount",
  FREE_SHIPPING: "Free Shipping",
  GIFT: "Free Gift",
  MIN_ORDER_AMOUNT: "Min Order Amount",
  MIN_QUANTITY: "Min Quantity",
  FIRST_ORDER: "First Order",
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
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  PAUSED: "bg-yellow-100 text-yellow-700 border-yellow-200",
  SCHEDULED: "bg-blue-100 text-blue-700 border-blue-200",
  EXPIRED: "bg-gray-100 text-gray-600 border-gray-200",
};

function discountLabel(p: Promotion): string {
  switch (p.type) {
    case 'PERCENTAGE':
    case 'CATEGORY_DISCOUNT':
    case 'MIN_QUANTITY':
    case 'FIRST_ORDER': return `${p.discountValue / 100}% off`;
    case 'FIXED_AMOUNT':
    case 'MIN_ORDER_AMOUNT': return `${formatCurrency(p.discountValue)} off`;
    case 'BUY_X_GET_Y': return `Buy ${p.buyQuantity} Get ${p.getQuantity} Free`;
    case 'QUANTITY_TIER': return 'Tier Pricing';
    case 'FREE_SHIPPING': return p.freeShippingMinAmount ? `Free shipping on ${formatCurrency(p.freeShippingMinAmount)}+` : 'Always free shipping';
    case 'GIFT': return 'Free gift';
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
    minimumOrderValue: f.minimumOrderValue ? Math.round(parseFloat(f.minimumOrderValue) * 1000) : null,
    minimumQuantity: f.minimumQuantity ? Number(f.minimumQuantity) : null,
    maximumDiscount: f.maximumDiscount ? Math.round(parseFloat(f.maximumDiscount) * 1000) : null,
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
      base.discountValue = Math.round(parseFloat(f.discountValue || '0') * 1000);
      break;
    case 'BUY_X_GET_Y':
      base.buyQuantity = Number(f.buyQuantity) || 1;
      base.getQuantity = Number(f.getQuantity) || 1;
      break;
    case 'FREE_SHIPPING':
      base.freeShippingMinAmount = f.freeShippingMinAmount ? Math.round(parseFloat(f.freeShippingMinAmount) * 1000) : 0;
      break;
    case 'GIFT':
      base.giftInfo = { description: f.giftDescription || 'Free gift', quantity: Number(f.giftQuantity) || 1 };
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
  f.minimumOrderValue = p.minimumOrderValue ? (p.minimumOrderValue / 1000).toFixed(3) : "";
  f.minimumQuantity = p.minimumQuantity?.toString() ?? "";
  f.maximumDiscount = p.maximumDiscount ? (p.maximumDiscount / 1000).toFixed(3) : "";
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
      f.discountValue = (p.discountValue / 1000).toFixed(3);
      break;
    case 'BUY_X_GET_Y':
      f.buyQuantity = p.buyQuantity?.toString() ?? "1";
      f.getQuantity = p.getQuantity?.toString() ?? "1";
      break;
    case 'FREE_SHIPPING':
      f.freeShippingMinAmount = p.freeShippingMinAmount ? (p.freeShippingMinAmount / 1000).toFixed(3) : "";
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

function PromotionForm({ form, onChange }: { form: FormState; onChange: (f: FormState) => void }) {
  const set = (k: keyof FormState, v: any) => onChange({ ...form, [k]: v });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label>Promotion Name *</Label>
          <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Spring Coffee Sale" />
        </div>
        <div className="space-y-1.5">
          <Label>Type *</Label>
          <Select value={form.type} onValueChange={v => set('type', v as PromotionType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(TYPE_LABELS) as [PromotionType, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => set('status', v as PromotionStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
              <SelectItem value="SCHEDULED">Scheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Type-specific discount fields */}
      {['PERCENTAGE', 'CATEGORY_DISCOUNT', 'MIN_QUANTITY', 'FIRST_ORDER'].includes(form.type) && (
        <div className="space-y-1.5">
          <Label>Discount % *</Label>
          <div className="relative">
            <Input type="number" min="0" max="100" step="0.1" value={form.discountValue} onChange={e => set('discountValue', e.target.value)} placeholder="e.g. 20" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
          </div>
        </div>
      )}
      {['FIXED_AMOUNT', 'MIN_ORDER_AMOUNT'].includes(form.type) && (
        <div className="space-y-1.5">
          <Label>Discount Amount (DT) *</Label>
          <Input type="number" min="0" step="0.001" value={form.discountValue} onChange={e => set('discountValue', e.target.value)} placeholder="e.g. 10.000" />
        </div>
      )}
      {form.type === 'BUY_X_GET_Y' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Buy Quantity *</Label>
            <Input type="number" min="1" value={form.buyQuantity} onChange={e => set('buyQuantity', e.target.value)} placeholder="e.g. 10" />
          </div>
          <div className="space-y-1.5">
            <Label>Get Free Quantity *</Label>
            <Input type="number" min="1" value={form.getQuantity} onChange={e => set('getQuantity', e.target.value)} placeholder="e.g. 1" />
          </div>
        </div>
      )}
      {form.type === 'FREE_SHIPPING' && (
        <div className="space-y-1.5">
          <Label>Minimum Order Amount (DT) — leave empty for always free</Label>
          <Input type="number" min="0" step="0.001" value={form.freeShippingMinAmount} onChange={e => set('freeShippingMinAmount', e.target.value)} placeholder="e.g. 300.000" />
        </div>
      )}
      {form.type === 'GIFT' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Gift Description *</Label>
            <Input value={form.giftDescription} onChange={e => set('giftDescription', e.target.value)} placeholder="e.g. Free sugar sample bag" />
          </div>
          <div className="space-y-1.5">
            <Label>Gift Quantity</Label>
            <Input type="number" min="1" value={form.giftQuantity} onChange={e => set('giftQuantity', e.target.value)} />
          </div>
        </div>
      )}

      <Separator />

      {/* Dates & limits */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Start Date</Label>
          <Input type="datetime-local" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>End Date</Label>
          <Input type="datetime-local" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Max Total Uses</Label>
          <Input type="number" min="1" value={form.maxUses} onChange={e => set('maxUses', e.target.value)} placeholder="Unlimited" />
        </div>
        <div className="space-y-1.5">
          <Label>Max Per Customer</Label>
          <Input type="number" min="1" value={form.maxUsesPerCustomer} onChange={e => set('maxUsesPerCustomer', e.target.value)} placeholder="Unlimited" />
        </div>
      </div>

      {/* Conditions */}
      <div className="grid grid-cols-2 gap-4">
        {['MIN_ORDER_AMOUNT', 'GIFT', 'FREE_SHIPPING'].includes(form.type) === false && (
          <div className="space-y-1.5">
            <Label>Min Order Value (DT)</Label>
            <Input type="number" min="0" step="0.001" value={form.minimumOrderValue} onChange={e => set('minimumOrderValue', e.target.value)} placeholder="No minimum" />
          </div>
        )}
        {!['BUY_X_GET_Y', 'MIN_QUANTITY'].includes(form.type) || true ? (
          <div className="space-y-1.5">
            <Label>Min Quantity</Label>
            <Input type="number" min="0" value={form.minimumQuantity} onChange={e => set('minimumQuantity', e.target.value)} placeholder="No minimum" />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label>Max Discount Cap (DT)</Label>
          <Input type="number" min="0" step="0.001" value={form.maximumDiscount} onChange={e => set('maximumDiscount', e.target.value)} placeholder="No cap" />
        </div>
        <div className="space-y-1.5">
          <Label>Priority (higher = applied first)</Label>
          <Input type="number" value={form.priority} onChange={e => set('priority', Number(e.target.value))} placeholder="0" />
        </div>
      </div>

      {/* Applies to */}
      <div className="space-y-1.5">
        <Label>Applies To</Label>
        <Select value={form.targetType} onValueChange={v => set('targetType', v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All my products</SelectItem>
            <SelectItem value="PRODUCTS">Specific products</SelectItem>
            <SelectItem value="CATEGORIES">Specific categories</SelectItem>
          </SelectContent>
        </Select>
        {form.targetType !== 'ALL' && (
          <p className="text-xs text-muted-foreground mt-1">
            You can configure specific {form.targetType === 'PRODUCTS' ? 'products' : 'categories'} after saving this promotion.
          </p>
        )}
      </div>

      <Separator />

      {/* Stacking & notes */}
      <div className="flex items-center justify-between rounded-xl border p-4">
        <div>
          <p className="font-medium text-sm">Stackable</p>
          <p className="text-xs text-muted-foreground">Can combine with other promotions for the same order</p>
        </div>
        <Switch checked={form.stackable} onCheckedChange={v => set('stackable', v)} />
      </div>

      <div className="space-y-1.5">
        <Label>Description (visible to customers)</Label>
        <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="What customers will see about this promotion" rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label>Internal Notes (not visible to customers)</Label>
        <Textarea value={form.internalNotes} onChange={e => set('internalNotes', e.target.value)} placeholder="Notes for your team" rows={2} />
      </div>
    </div>
  );
}

// ── Promotion Card ──────────────────────────────────────────────────────────

function PromotionCard({
  promo, onEdit, onDuplicate, onDelete, onStatusChange,
}: {
  promo: Promotion;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onStatusChange: (s: PromotionStatus) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const effectiveStatus = getEffectiveStatus(promo);
  const remaining = promo.maxUses != null ? promo.maxUses - promo.usageCount : null;
  const icon = TYPE_ICONS[promo.type];

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="bg-amber-500/10 rounded-xl p-2.5 shrink-0 text-amber-600 mt-0.5">
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="font-semibold text-foreground truncate">{promo.name}</p>
                <Badge className={`text-xs border ${STATUS_STYLES[effectiveStatus]}`} variant="outline">
                  {effectiveStatus}
                </Badge>
                <Badge variant="secondary" className="text-xs bg-primary/5 text-primary border-primary/20">
                  {TYPE_LABELS[promo.type]}
                </Badge>
                {promo.stackable && (
                  <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">Stackable</Badge>
                )}
              </div>
              <p className="text-sm text-amber-600 font-semibold">{discountLabel(promo)}</p>
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
                  <Zap className="w-3 h-3" /> Priority {promo.priority}
                </span>
                <span>{promo.usageCount} uses{remaining != null ? ` · ${remaining} remaining` : ''}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="ghost" onClick={onEdit} className="h-8 w-8 p-0"><Edit2 className="w-3.5 h-3.5" /></Button>
            <div className="relative">
              <Button size="sm" variant="ghost" onClick={() => setShowMenu(!showMenu)} className="h-8 w-8 p-0"><MoreHorizontal className="w-4 h-4" /></Button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-9 z-20 bg-background border border-border rounded-xl shadow-lg py-1 w-44">
                    {effectiveStatus === 'ACTIVE' ? (
                      <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-secondary" onClick={() => { setShowMenu(false); onStatusChange('PAUSED'); }}>
                        <Pause className="w-3.5 h-3.5" /> Pause
                      </button>
                    ) : effectiveStatus === 'PAUSED' ? (
                      <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-secondary" onClick={() => { setShowMenu(false); onStatusChange('ACTIVE'); }}>
                        <Play className="w-3.5 h-3.5" /> Resume
                      </button>
                    ) : null}
                    <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-secondary" onClick={() => { setShowMenu(false); onDuplicate(); }}>
                      <Copy className="w-3.5 h-3.5" /> Duplicate
                    </button>
                    <Separator className="my-1" />
                    <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10" onClick={() => { setShowMenu(false); onDelete(); }}>
                      <Trash2 className="w-3.5 h-3.5" /> Delete
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
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterType, setFilterType] = useState<string>("ALL");

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Data
  const { data: promos = [], isLoading } = useQuery<Promotion[]>({
    queryKey: ["/api/promotions"],
    queryFn: () => fetchJSON(apiBase),
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/promotions/stats"],
    queryFn: () => fetchJSON(`${apiBase}/stats`),
  });

  // Mutations
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["/api/promotions"] }); };

  const createMut = useMutation({
    mutationFn: (data: any) => fetchJSON(apiBase, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["/api/promotions/stats"] }); setFormOpen(false); toast({ title: "Promotion created" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => fetchJSON(`${apiBase}/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { invalidate(); setFormOpen(false); toast({ title: "Promotion updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => fetchJSON(`${apiBase}/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["/api/promotions/stats"] }); toast({ title: "Promotion deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: PromotionStatus }) =>
      fetchJSON(`${apiBase}/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const dupMut = useMutation({
    mutationFn: (id: number) => fetchJSON(`${apiBase}/${id}/duplicate`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast({ title: "Promotion duplicated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => { setEditingPromo(null); setForm(EMPTY_FORM); setFormOpen(true); };
  const openEdit = (p: Promotion) => { setEditingPromo(p); setForm(promoToForm(p)); setFormOpen(true); };

  const handleSave = () => {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
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

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Promotions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create and manage promotional campaigns for your products.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="w-4 h-4 mr-1.5" /> Create Promotion
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active", value: stats?.active ?? promos.filter(p => getEffectiveStatus(p) === 'ACTIVE').length, icon: <Zap className="w-4 h-4 text-green-600" />, color: "bg-green-50" },
          { label: "Paused", value: stats?.paused ?? promos.filter(p => getEffectiveStatus(p) === 'PAUSED').length, icon: <Pause className="w-4 h-4 text-yellow-600" />, color: "bg-yellow-50" },
          { label: "Total Uses", value: stats?.totalUses ?? promos.reduce((s, p) => s + p.usageCount, 0), icon: <Users className="w-4 h-4 text-primary" />, color: "bg-primary/5" },
          { label: "Savings Generated", value: stats?.totalDiscount != null ? formatCurrency(stats.totalDiscount) : "—", icon: <TrendingUp className="w-4 h-4 text-blue-600" />, color: "bg-blue-50" },
        ].map(({ label, value, icon, color }) => (
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Search promotions…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            {(Object.entries(TYPE_LABELS) as [PromotionType, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            {promos.length === 0 ? "No promotions yet" : "No promotions match your filters"}
          </h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            {promos.length === 0
              ? "Create your first promotion to start offering discounts to your customers."
              : "Try adjusting the search or filter criteria."}
          </p>
          {promos.length === 0 && (
            <Button className="mt-5" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" /> Create Promotion
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <PromotionCard
              key={p.id}
              promo={p}
              onEdit={() => openEdit(p)}
              onDuplicate={() => dupMut.mutate(p.id)}
              onDelete={() => setDeleteTarget(p)}
              onStatusChange={s => statusMut.mutate({ id: p.id, status: s })}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPromo ? "Edit Promotion" : "Create Promotion"}</DialogTitle>
          </DialogHeader>
          <PromotionForm form={form} onChange={setForm} />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : editingPromo ? "Save Changes" : "Create Promotion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Promotion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { deleteMut.mutate(deleteTarget.id); setDeleteTarget(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
