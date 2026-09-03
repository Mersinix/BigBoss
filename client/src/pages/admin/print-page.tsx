import { useMemo, useState } from "react";
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
  Printer, Users, ShoppingBag, Package, Clock, CheckCircle, XCircle, Star, Plus, Pencil,
  Trash2, Snowflake, Search, MapPin, Phone, Mail, Calendar, TrendingUp, Layers, Percent, Wallet,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/use-realtime";
import { useFormatCurrency } from "@/hooks/use-currency";
import { SectionCard, RankRow, EmptyState } from "@/components/dashboard/dashboard-kit";
import { PRINT_ORDER_STATUS_META, formatMonthKey } from "@/lib/print-order-status";
import { printCategoryIcon } from "@/lib/print-category-icons";
import { buildPrintInvoiceRows, PRINT_INVOICE_STATUS_META } from "@/lib/print-financial-rows";
import type { PrintOrderWithParties } from "@shared/schema";

// Mirrors admin/maintenance-page.tsx's architecture exactly: one aggregate
// overview endpoint (/api/admin/print), client-side tabs/filters over it, no
// pagination, no separate per-tab fetch — same philosophy, adapted to PRINT's
// real data (a multi-item catalog per Printer instead of one flat profile).

type TaxonomyItem = { id: number; name: string; icon?: string | null; isActive: boolean; isFrozen: boolean };
type Overview = {
  stats: {
    totalPrinters: number; activePrinters: number; availablePrinters: number;
    totalServices: number; activeServices: number;
    totalOrders: number; pendingOrders: number; inProductionOrders: number;
    completedOrders: number; cancelledOrders: number;
    totalRevenueCents: number; reviewCount: number; averageRating: number;
  };
  categories: { category: string; count: number }[];
  taxonomy: TaxonomyItem[];
  subcategoryTaxonomy: (TaxonomyItem & { categoryId: number })[];
  printers: any[];
  catalogItems: any[];
  orders: PrintOrderWithParties[];
  reviews: any[];
};

function StatusBadge({ status }: { status: string }) {
  const meta = PRINT_ORDER_STATUS_META[status as keyof typeof PRINT_ORDER_STATUS_META];
  return <Badge variant="outline" className={meta?.className ?? ""}>{meta?.label ?? status}</Badge>;
}

// ── Categories taxonomy (mirrors Maintenance's TaxonomyList, single dimension) ──

function CategoryTaxonomy({ items, onRefresh }: { items: TaxonomyItem[]; onRefresh: () => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [draftIcon, setDraftIcon] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [iconEditing, setIconEditing] = useState<number | null>(null);
  const [iconEditValue, setIconEditValue] = useState("");
  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/print/categories", { name: draft.trim(), icon: draftIcon.trim() || null }),
    onSuccess: () => { setDraft(""); setDraftIcon(""); onRefresh(); toast({ title: "Catégorie ajoutée" }); },
    onError: (e: any) => toast({ title: "Impossible d'ajouter", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/print/categories/${id}`, data),
    onSuccess: () => { setEditing(null); setIconEditing(null); onRefresh(); },
    onError: () => toast({ title: "Mise à jour impossible", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/print/categories/${id}`),
    onSuccess: onRefresh,
    onError: () => toast({ title: "Suppression impossible", variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Catégories PRINT</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={draftIcon} onChange={(e) => setDraftIcon(e.target.value)} placeholder="🖨️" className="w-14 text-center text-lg shrink-0" data-testid="input-print-category-draft-icon" />
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ajouter une catégorie" onKeyDown={(e) => e.key === "Enter" && draft.trim() && create.mutate()} data-testid="input-new-print-category" />
          <Button size="sm" disabled={!draft.trim() || create.isPending} onClick={() => create.mutate()} data-testid="button-add-print-category"><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
        </div>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">Aucune catégorie.</p> : items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2" data-testid={`row-print-category-${item.id}`}>
            {iconEditing === item.id ? (
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
                data-testid={`button-edit-print-category-icon-${item.id}`}
              >
                {item.icon || <Printer className="h-4 w-4 text-muted-foreground" />}
              </button>
            )}
            {editing === item.id ? (
              <Input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter" && editValue.trim()) update.mutate({ id: item.id, data: { name: editValue.trim() } });
                if (e.key === "Escape") setEditing(null);
              }} />
            ) : <span className="flex-1 text-sm font-medium">{item.name}</span>}
            {item.isFrozen && <Badge variant="outline" className="text-xs text-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé</Badge>}
            {!item.isActive && <Badge variant="secondary" className="text-xs">Inactif</Badge>}
            {editing === item.id
              ? <Button size="sm" onClick={() => editValue.trim() && update.mutate({ id: item.id, data: { name: editValue.trim() } })}>OK</Button>
              : <Button variant="ghost" size="icon" onClick={() => { setEditing(item.id); setEditValue(item.name); }}><Pencil className="h-3.5 w-3.5" /></Button>}
            <Button variant="ghost" size="icon" title={item.isFrozen ? "Dégeler" : "Geler"} onClick={() => update.mutate({ id: item.id, data: { isFrozen: !item.isFrozen } })}><Snowflake className={`h-3.5 w-3.5 ${item.isFrozen ? "text-blue-600" : ""}`} /></Button>
            <Button variant="ghost" size="icon" title={item.isActive ? "Désactiver" : "Activer"} onClick={() => update.mutate({ id: item.id, data: { isActive: !item.isActive } })}><CheckCircle className={`h-3.5 w-3.5 ${item.isActive ? "text-green-600" : "text-muted-foreground"}`} /></Button>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove.mutate(item.id)} data-testid={`button-delete-print-category-${item.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Subcategories taxonomy — one level below CategoryTaxonomy (e.g. "Flyers" →
// "A5"/"A4"). Same list-row pattern, scoped to a category picked from a Select. ──

function SubCategoryManager({ categories, subcategories, onRefresh }: {
  categories: TaxonomyItem[]; subcategories: (TaxonomyItem & { categoryId: number })[]; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [categoryId, setCategoryId] = useState<number | null>(categories[0]?.id ?? null);
  const [draft, setDraft] = useState("");
  const [draftIcon, setDraftIcon] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [iconEditing, setIconEditing] = useState<number | null>(null);
  const [iconEditValue, setIconEditValue] = useState("");
  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/print/subcategories", { categoryId, name: draft.trim(), icon: draftIcon.trim() || null }),
    onSuccess: () => { setDraft(""); setDraftIcon(""); onRefresh(); toast({ title: "Sous-catégorie ajoutée" }); },
    onError: (e: any) => toast({ title: "Impossible d'ajouter", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/print/subcategories/${id}`, data),
    onSuccess: () => { setEditing(null); setIconEditing(null); onRefresh(); },
    onError: () => toast({ title: "Mise à jour impossible", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/print/subcategories/${id}`),
    onSuccess: onRefresh,
    onError: () => toast({ title: "Suppression impossible", variant: "destructive" }),
  });
  const items = subcategories.filter((s) => s.categoryId === categoryId);

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Sous-catégories PRINT</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {categories.length === 0 ? <p className="text-sm text-muted-foreground">Créez d'abord une catégorie.</p> : (
          <>
            <Select value={categoryId ? String(categoryId) : undefined} onValueChange={(v) => setCategoryId(Number(v))}>
              <SelectTrigger data-testid="select-subcategory-parent"><SelectValue placeholder="Choisir une catégorie" /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input value={draftIcon} onChange={(e) => setDraftIcon(e.target.value)} placeholder="🖨️" className="w-14 text-center text-lg shrink-0" data-testid="input-print-subcategory-draft-icon" />
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ajouter une sous-catégorie" onKeyDown={(e) => e.key === "Enter" && draft.trim() && categoryId && create.mutate()} data-testid="input-new-print-subcategory" />
              <Button size="sm" disabled={!draft.trim() || !categoryId || create.isPending} onClick={() => create.mutate()} data-testid="button-add-print-subcategory"><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
            </div>
            {items.length === 0 ? <p className="text-sm text-muted-foreground">Aucune sous-catégorie pour cette catégorie.</p> : items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2" data-testid={`row-print-subcategory-${item.id}`}>
                {iconEditing === item.id ? (
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
                    data-testid={`button-edit-print-subcategory-icon-${item.id}`}
                  >
                    {item.icon || <Printer className="h-4 w-4 text-muted-foreground" />}
                  </button>
                )}
                {editing === item.id ? (
                  <Input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => {
                    if (e.key === "Enter" && editValue.trim()) update.mutate({ id: item.id, data: { name: editValue.trim() } });
                    if (e.key === "Escape") setEditing(null);
                  }} />
                ) : <span className="flex-1 text-sm font-medium">{item.name}</span>}
                {item.isFrozen && <Badge variant="outline" className="text-xs text-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé</Badge>}
                {!item.isActive && <Badge variant="secondary" className="text-xs">Inactif</Badge>}
                {editing === item.id
                  ? <Button size="sm" onClick={() => editValue.trim() && update.mutate({ id: item.id, data: { name: editValue.trim() } })}>OK</Button>
                  : <Button variant="ghost" size="icon" onClick={() => { setEditing(item.id); setEditValue(item.name); }}><Pencil className="h-3.5 w-3.5" /></Button>}
                <Button variant="ghost" size="icon" title={item.isFrozen ? "Dégeler" : "Geler"} onClick={() => update.mutate({ id: item.id, data: { isFrozen: !item.isFrozen } })}><Snowflake className={`h-3.5 w-3.5 ${item.isFrozen ? "text-blue-600" : ""}`} /></Button>
                <Button variant="ghost" size="icon" title={item.isActive ? "Désactiver" : "Activer"} onClick={() => update.mutate({ id: item.id, data: { isActive: !item.isActive } })}><CheckCircle className={`h-3.5 w-3.5 ${item.isActive ? "text-green-600" : "text-muted-foreground"}`} /></Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove.mutate(item.id)} data-testid={`button-delete-print-subcategory-${item.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Printer detail dialog ──────────────────────────────────────────────────────

function PrinterDetail({ printer, onClose }: { printer: any | null; onClose: () => void }) {
  const fmt = useFormatCurrency();
  if (!printer) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar><AvatarImage src={getAvatarUrl(printer)} alt={printer.name} /><AvatarFallback className="bg-blue-100 text-blue-700 font-bold">{printer.initials}</AvatarFallback></Avatar>
            <span>{printer.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Badge variant="outline">{printer.status}</Badge>
            <Badge variant={printer.activeServiceCount > 0 ? "default" : "secondary"}>{printer.activeServiceCount > 0 ? "Disponible" : "Aucun service actif"}</Badge>
          </div>
          <div className="flex gap-2"><Mail className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Email</p><p>{printer.email}</p></div></div>
          <div className="flex gap-2"><Phone className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Téléphone</p><p>{printer.phone || "—"}</p></div></div>
          <div className="flex gap-2"><MapPin className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Localisation</p><p>{printer.location || "—"}</p></div></div>
          <div className="flex gap-2"><Calendar className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Inscription</p><p>{printer.createdAt ? new Date(printer.createdAt).toLocaleDateString("fr-FR") : "—"}</p></div></div>
          <div className="flex gap-2"><Package className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Services</p><p>{printer.activeServiceCount} actif(s) / {printer.totalServiceCount} au total</p></div></div>
          <div className="flex gap-2"><ShoppingBag className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Commandes</p><p>{printer.totalOrders}</p></div></div>
          <div className="flex gap-2"><Wallet className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Revenu (commandes livrées)</p><p>{fmt(printer.revenueCents)}</p></div></div>
          <div className="flex gap-2"><Star className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Évaluation</p><p>{printer.reviewCount > 0 ? `${(printer.rating / 10).toFixed(1)} (${printer.reviewCount} avis)` : "Aucun avis"}</p></div></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Order detail dialog ────────────────────────────────────────────────────────

function OrderDetail({ order, onClose }: { order: PrintOrderWithParties | null; onClose: () => void }) {
  const fmt = useFormatCurrency();
  if (!order) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Commande #{order.id}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="sm:col-span-2"><StatusBadge status={order.status} /></div>
          <div><p className="text-xs text-muted-foreground">Imprimeur</p><p className="font-medium">{order.printerName}</p></div>
          <div><p className="text-xs text-muted-foreground">Coffee Owner</p><p className="font-medium">{order.cafeOwnerName}</p></div>
          <div><p className="text-xs text-muted-foreground">Service</p><p>{order.itemName}</p></div>
          <div><p className="text-xs text-muted-foreground">Quantité</p><p>{order.quantity}</p></div>
          <div><p className="text-xs text-muted-foreground">Prix unitaire</p><p>{fmt(order.unitPriceInCents)}</p></div>
          <div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold">{fmt(order.totalInCents)}</p></div>
          <div><p className="text-xs text-muted-foreground">Téléphone contact</p><p>{order.contactPhone || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Adresse de livraison</p><p>{order.deliveryAddress || "—"}</p></div>
          <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Notes</p><p className="whitespace-pre-wrap">{order.notes || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Créée le</p><p>{order.createdAt ? new Date(order.createdAt).toLocaleString("fr-FR") : "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Mise à jour</p><p>{order.updatedAt ? new Date(order.updatedAt).toLocaleString("fr-FR") : "—"}</p></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────

const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };

export default function AdminPrintPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fmt = useFormatCurrency();
  useRealtime();

  const [section, setSection] = useState("overview");
  const [selectedPrinter, setSelectedPrinter] = useState<any | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PrintOrderWithParties | null>(null);

  const [printerSearch, setPrinterSearch] = useState("");
  const [printerStatus, setPrinterStatus] = useState("all");

  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceCategory, setServiceCategory] = useState("all");
  const [serviceStatus, setServiceStatus] = useState("all");

  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState("all");
  const [orderPrinter, setOrderPrinter] = useState("all");

  const { data, isLoading } = useQuery<Overview>({ queryKey: ["/api/admin/print"] });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/print"] });
    qc.invalidateQueries({ queryKey: ["/api/print/categories"] });
  };

  const printerStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest("PATCH", `/api/admin/users/${id}/status`, { status }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "Statut mis à jour" }); },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const catalogModeration = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => apiRequest("PATCH", `/api/admin/print/catalog/${id}`, { isActive }),
    onSuccess: () => { refresh(); toast({ title: "Service mis à jour" }); },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const stats = data?.stats;
  const kpis = [
    ["Imprimeurs", stats?.totalPrinters ?? 0, Users],
    ["Actifs / approuvés", stats?.activePrinters ?? 0, CheckCircle],
    ["Disponibles", stats?.availablePrinters ?? 0, Printer],
    ["Services actifs", stats?.activeServices ?? 0, Package],
    ["Commandes", stats?.totalOrders ?? 0, ShoppingBag],
    ["En attente", stats?.pendingOrders ?? 0, Clock],
    ["Terminées", stats?.completedOrders ?? 0, CheckCircle],
    ["Annulées", stats?.cancelledOrders ?? 0, XCircle],
  ] as const;

  // ── Printers tab ──
  const printers = useMemo(() => (data?.printers ?? []).filter((p) => {
    const haystack = [p.name, p.email, p.location].join(" ").toLowerCase();
    return (!printerSearch || haystack.includes(printerSearch.toLowerCase()))
      && (printerStatus === "all" || p.status === printerStatus);
  }), [data?.printers, printerSearch, printerStatus]);

  // ── Services (catalog) tab — every catalog item across every printer,
  // including inactive ones (Admin needs to see/moderate those too, unlike the
  // public marketplace endpoint which only ever returns active items). ──
  const serviceFilterOptions = useMemo(() => ({
    categories: Array.from(new Set((data?.catalogItems ?? []).map((i) => i.category).filter(Boolean))).sort(),
  }), [data?.catalogItems]);
  const services = useMemo(() => (data?.catalogItems ?? []).filter((i) => {
    const haystack = [i.name, i.description, i.printerName, i.category, i.subCategory].join(" ").toLowerCase();
    return (!serviceSearch || haystack.includes(serviceSearch.toLowerCase()))
      && (serviceCategory === "all" || i.category === serviceCategory)
      && (serviceStatus === "all" || (serviceStatus === "active" ? i.isActive : !i.isActive));
  }), [data?.catalogItems, serviceSearch, serviceCategory, serviceStatus]);

  // ── Orders tab ──
  const orderFilterOptions = useMemo(() => ({
    printers: Array.from(new Set((data?.orders ?? []).map((o) => o.printerName))).sort(),
  }), [data?.orders]);
  const orders = useMemo(() => (data?.orders ?? []).filter((o) => {
    const haystack = [o.itemName, o.printerName, o.cafeOwnerName, o.notes].join(" ").toLowerCase();
    return (!orderSearch || haystack.includes(orderSearch.toLowerCase()))
      && (orderStatus === "all" || o.status === orderStatus)
      && (orderPrinter === "all" || o.printerName === orderPrinter);
  }), [data?.orders, orderSearch, orderStatus, orderPrinter]);

  // ── Customers tab — derived from orders, no duplicate customer system ──
  const customers = useMemo(() => {
    const map = new Map<string, { name: string; orders: number; totalCents: number; lastOrder: Date | null }>();
    for (const o of data?.orders ?? []) {
      const cur = map.get(o.cafeOwnerName) ?? { name: o.cafeOwnerName, orders: 0, totalCents: 0, lastOrder: null };
      cur.orders += 1;
      cur.totalCents += o.totalInCents;
      const created = o.createdAt ? new Date(o.createdAt) : null;
      if (created && (!cur.lastOrder || created > cur.lastOrder)) cur.lastOrder = created;
      map.set(o.cafeOwnerName, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.totalCents - a.totalCents);
  }, [data?.orders]);

  // ── Finance tab — reuses the exact PRINT invoice derivation the Printer's own
  // Facturation page uses, computed here across every printer instead of one. ──
  const invoiceRows = useMemo(() => buildPrintInvoiceRows(data?.orders ?? []), [data?.orders]);
  const financeSummary = useMemo(() => ({
    total: invoiceRows.reduce((s, r) => s + r.amount, 0),
    paid: invoiceRows.filter((r) => r.invoiceStatus === "PAID").reduce((s, r) => s + r.amount, 0),
    pending: invoiceRows.filter((r) => r.invoiceStatus === "PENDING").reduce((s, r) => s + r.amount, 0),
  }), [invoiceRows]);

  // ── Analytics tab — bucketed client-side from the full orders list, same
  // approach the admin overview itself already uses for every other stat. ──
  const revenueByMonth = useMemo(() => {
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const now = new Date();
    const byMonth = new Map<string, number>();
    for (const o of data?.orders ?? []) {
      if (o.status !== "DELIVERED" || !o.createdAt) continue;
      const key = monthKey(new Date(o.createdAt));
      byMonth.set(key, (byMonth.get(key) ?? 0) + o.totalInCents);
    }
    const history: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      history.push({ month: formatMonthKey(key), revenue: (byMonth.get(key) ?? 0) / 100 });
    }
    return history;
  }, [data?.orders]);

  const topPrinters = useMemo(
    () => (data?.printers ?? []).slice().sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 5),
    [data?.printers],
  );
  const topCategories = useMemo(() => (data?.categories ?? []).slice(0, 6), [data?.categories]);
  const completionRate = stats && stats.totalOrders > 0 ? Math.round((stats.completedOrders / stats.totalOrders) * 100) : 0;
  const cancellationRate = stats && stats.totalOrders > 0 ? Math.round((stats.cancelledOrders / stats.totalOrders) * 100) : 0;
  const averageOrderValue = orders.length > 0 ? Math.round((data?.orders ?? []).reduce((s, o) => s + o.totalInCents, 0) / (data?.orders?.length || 1)) : 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Printer className="w-6 h-6 text-blue-600" />PRINT</h1>
        <p className="text-muted-foreground text-sm mt-1">Contrôle centralisé du marketplace PRINT : imprimeurs, catalogue, commandes et finance.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(([label, value, Icon]) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-2.5"><Icon className="w-4 h-4 text-blue-600" /></div>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{isLoading ? "…" : value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="categories">Catégories</TabsTrigger>
          <TabsTrigger value="printers">Imprimeurs</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="orders">Commandes</TabsTrigger>
          <TabsTrigger value="customers">Clients</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="reviews">Avis</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Répartition par catégorie</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(data?.categories ?? []).length === 0
                ? <p className="text-sm text-muted-foreground">Aucun service au catalogue.</p>
                : (data?.categories ?? []).map((row) => {
                    const taxonomyMatch = (data?.taxonomy ?? []).find((t) => t.name === row.category);
                    return (
                      <Badge key={row.category} variant="secondary">
                        {printCategoryIcon(row.category, taxonomyMatch?.icon)} {row.category} · {row.count}
                      </Badge>
                    );
                  })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Commandes récentes</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {(data?.orders ?? []).length === 0 ? <p className="p-6 text-center text-muted-foreground text-sm">Aucune commande pour le moment.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">ID</th><th className="p-3">Service</th><th className="p-3">Imprimeur</th><th className="p-3">Coffee Owner</th><th className="p-3">Montant</th><th className="p-3">Statut</th></tr></thead>
                  <tbody>
                    {(data?.orders ?? []).slice(0, 10).map((o) => (
                      <tr key={o.id} className="border-b last:border-0 cursor-pointer hover:bg-secondary/30" onClick={() => setSelectedOrder(o)} data-testid={`row-recent-order-${o.id}`}>
                        <td className="p-3 font-medium">#{o.id}</td>
                        <td className="p-3">{o.itemName} <span className="text-xs text-muted-foreground">×{o.quantity}</span></td>
                        <td className="p-3">{o.printerName}</td>
                        <td className="p-3">{o.cafeOwnerName}</td>
                        <td className="p-3">{fmt(o.totalInCents)}</td>
                        <td className="p-3"><StatusBadge status={o.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Categories ── */}
        <TabsContent value="categories" className="mt-4 grid lg:grid-cols-2 gap-6">
          <CategoryTaxonomy items={data?.taxonomy ?? []} onRefresh={refresh} />
          <SubCategoryManager categories={data?.taxonomy ?? []} subcategories={data?.subcategoryTaxonomy ?? []} onRefresh={refresh} />
        </TabsContent>

        {/* ── Printers ── */}
        <TabsContent value="printers" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={printerSearch} onChange={(e) => setPrinterSearch(e.target.value)} placeholder="Rechercher un imprimeur…" data-testid="input-search-printers" /></div>
            <Select value={printerStatus} onValueChange={setPrinterStatus}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="approved">Approuvé</SelectItem><SelectItem value="pending">En attente</SelectItem><SelectItem value="rejected">Rejeté</SelectItem></SelectContent>
            </Select>
          </div>
          {printers.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucun imprimeur correspondant.</CardContent></Card> : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {printers.map((printer) => (
                <Card key={printer.userId} className="hover:shadow-md transition-shadow" data-testid={`card-printer-${printer.userId}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3 cursor-pointer" onClick={() => setSelectedPrinter(printer)}>
                      <Avatar><AvatarImage src={getAvatarUrl(printer)} alt={printer.name} /><AvatarFallback className="bg-blue-100 text-blue-700 font-bold">{printer.initials}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1"><h3 className="font-semibold truncate">{printer.name}</h3><p className="text-xs text-muted-foreground truncate flex items-center gap-1"><MapPin className="h-3 w-3" />{printer.location || "—"}</p></div>
                      <span className={`h-2.5 w-2.5 rounded-full mt-1 ${printer.activeServiceCount > 0 ? "bg-green-500" : "bg-gray-300"}`} />
                    </div>
                    <div className="flex flex-wrap gap-1"><Badge variant="outline" className="text-xs">{printer.status}</Badge><Badge variant="secondary" className="text-xs">{printer.activeServiceCount} service(s)</Badge><Badge variant="secondary" className="text-xs">{printer.totalOrders} commande(s)</Badge></div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{fmt(printer.revenueCents)}</span><span>{printer.reviewCount > 0 ? `★ ${(printer.rating / 10).toFixed(1)}` : "Aucun avis"}</span></div>
                    {printer.status !== "approved" && (
                      <Button size="sm" className="w-full h-7 text-xs" disabled={printerStatusMutation.isPending} onClick={() => printerStatusMutation.mutate({ id: printer.userId, status: "approved" })} data-testid={`button-approve-printer-${printer.userId}`}>Approuver</Button>
                    )}
                    {printer.status === "approved" && (
                      <Button size="sm" variant="outline" className="w-full h-7 text-xs border-red-200 text-red-600 hover:bg-red-50" disabled={printerStatusMutation.isPending} onClick={() => printerStatusMutation.mutate({ id: printer.userId, status: "rejected" })} data-testid={`button-suspend-printer-${printer.userId}`}>Suspendre</Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Services (global catalog, cross-printer) ── */}
        <TabsContent value="services" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} placeholder="Rechercher un service, un imprimeur…" data-testid="input-search-services" /></div>
            <Select value={serviceCategory} onValueChange={setServiceCategory}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Catégorie" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toutes catégories</SelectItem>{serviceFilterOptions.categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={serviceStatus} onValueChange={setServiceStatus}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous statuts</SelectItem><SelectItem value="active">Actif</SelectItem><SelectItem value="inactive">Inactif</SelectItem></SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {services.length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucun service correspondant.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Service</th><th className="p-3">Imprimeur</th><th className="p-3">Catégorie</th><th className="p-3">Prix</th><th className="p-3">Minimum</th><th className="p-3">Statut</th><th className="p-3 text-right">Action</th></tr></thead>
                  <tbody>
                    {services.map((item) => (
                      <tr key={item.id} className="border-b last:border-0" data-testid={`row-service-${item.id}`}>
                        <td className="p-3 font-medium">{item.name}</td>
                        <td className="p-3">{item.printerName}</td>
                        <td className="p-3">{item.category || "—"}</td>
                        <td className="p-3">{fmt(item.priceInCents)} / {item.unit}</td>
                        <td className="p-3">{item.minQuantity}</td>
                        <td className="p-3"><Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Actif" : "Inactif"}</Badge></td>
                        <td className="p-3 text-right">
                          <Switch
                            checked={item.isActive}
                            disabled={catalogModeration.isPending}
                            onCheckedChange={(checked) => catalogModeration.mutate({ id: item.id, isActive: checked })}
                            data-testid={`switch-service-active-${item.id}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Orders ── */}
        <TabsContent value="orders" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Rechercher une commande, un imprimeur, un client…" data-testid="input-search-orders" /></div>
            <Select value={orderStatus} onValueChange={setOrderStatus}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les statuts</SelectItem>{Object.entries(PRINT_ORDER_STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={orderPrinter} onValueChange={setOrderPrinter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Imprimeur" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les imprimeurs</SelectItem>{orderFilterOptions.printers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {orders.length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucune commande correspondante.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">ID</th><th className="p-3">Service</th><th className="p-3">Imprimeur</th><th className="p-3">Coffee Owner</th><th className="p-3">Qté</th><th className="p-3">Montant</th><th className="p-3">Statut</th><th className="p-3">Date</th></tr></thead>
                  <tbody>
                    {orders.slice(0, 100).map((o) => (
                      <tr key={o.id} className="border-b last:border-0 cursor-pointer hover:bg-secondary/30" onClick={() => setSelectedOrder(o)} data-testid={`row-order-${o.id}`}>
                        <td className="p-3 font-medium">#{o.id}</td>
                        <td className="p-3">{o.itemName}</td>
                        <td className="p-3">{o.printerName}</td>
                        <td className="p-3">{o.cafeOwnerName}</td>
                        <td className="p-3">{o.quantity}</td>
                        <td className="p-3">{fmt(o.totalInCents)}</td>
                        <td className="p-3"><StatusBadge status={o.status} /></td>
                        <td className="p-3 text-muted-foreground">{o.createdAt ? new Date(o.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Customers ── */}
        <TabsContent value="customers" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {customers.length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucun client PRINT pour le moment.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Coffee Owner</th><th className="p-3">Commandes</th><th className="p-3">Total dépensé</th><th className="p-3">Dernière commande</th></tr></thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.name} className="border-b last:border-0" data-testid={`row-customer-${c.name}`}>
                        <td className="p-3 font-medium">{c.name}</td>
                        <td className="p-3">{c.orders}</td>
                        <td className="p-3">{fmt(c.totalCents)}</td>
                        <td className="p-3 text-muted-foreground">{c.lastOrder ? c.lastOrder.toLocaleDateString("fr-FR") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Finance ── */}
        <TabsContent value="finance" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Volume total (GMV)</p><p className="text-xl font-bold">{fmt(financeSummary.total)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Payé (commandes livrées)</p><p className="text-xl font-bold text-green-600">{fmt(financeSummary.paid)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">En attente</p><p className="text-xl font-bold text-amber-600">{fmt(financeSummary.pending)}</p></CardContent></Card>
          </div>
          <p className="text-xs text-muted-foreground">PRINT est une transaction directe Imprimeur ↔ Coffee Owner, sans commission plateforme — les montants ci-dessus correspondent donc intégralement au revenu de l'imprimeur, comme sur sa propre page Facturation.</p>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {invoiceRows.length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucune facture pour le moment.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Facture</th><th className="p-3">Client</th><th className="p-3">Service</th><th className="p-3">Montant</th><th className="p-3">Statut</th><th className="p-3">Date</th></tr></thead>
                  <tbody>
                    {invoiceRows.slice(0, 100).map((r) => (
                      <tr key={r.orderId} className="border-b last:border-0" data-testid={`row-invoice-${r.orderId}`}>
                        <td className="p-3 font-mono text-xs">{r.invoiceNumber}</td>
                        <td className="p-3">{r.cafeOwnerName}</td>
                        <td className="p-3">{r.itemName}</td>
                        <td className="p-3">{fmt(r.amount)}</td>
                        <td className="p-3"><Badge variant="outline" className={PRINT_INVOICE_STATUS_META[r.invoiceStatus].className}>{PRINT_INVOICE_STATUS_META[r.invoiceStatus].label}</Badge></td>
                        <td className="p-3 text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Analytics ── */}
        <TabsContent value="analytics" className="mt-4 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Panier moyen</p><p className="text-xl font-bold">{fmt(averageOrderValue)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux de complétion</p><p className="text-xl font-bold text-green-600">{completionRate}%</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux d'annulation</p><p className="text-xl font-bold text-red-600">{cancellationRate}%</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Note moyenne</p><p className="text-xl font-bold">{stats && stats.reviewCount > 0 ? stats.averageRating.toFixed(1) : "—"}</p></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Chiffre d'affaires du marketplace par mois" icon={TrendingUp}>
              {revenueByMonth.every((h) => h.revenue === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={revenueByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip {...tooltipStyle} formatter={(v: any) => [fmt(Math.round((v as number) * 100)), "Revenu"]} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
            <SectionCard title="Meilleurs imprimeurs" icon={Users}>
              {topPrinters.length === 0 ? <EmptyState message="Aucun imprimeur pour le moment." /> : (
                <div className="divide-y divide-border/40">
                  {topPrinters.map((p, i) => <RankRow key={p.userId} rank={i + 1} title={p.name} subtitle={`${p.totalOrders} commande(s)`} value={fmt(p.revenueCents)} />)}
                </div>
              )}
            </SectionCard>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Meilleures catégories" icon={Layers}>
              {topCategories.length === 0 ? <EmptyState message="Aucune catégorie pour le moment." /> : (
                <div className="divide-y divide-border/40">
                  {topCategories.map((c, i) => {
                    const taxonomyMatch = (data?.taxonomy ?? []).find((t) => t.name === c.category);
                    return <RankRow key={c.category} rank={i + 1} title={`${printCategoryIcon(c.category, taxonomyMatch?.icon)} ${c.category}`} subtitle={`${c.count} service(s)`} value={String(c.count)} />;
                  })}
                </div>
              )}
            </SectionCard>
            <SectionCard title="Répartition des commandes par statut" icon={Percent}>
              {!stats || stats.totalOrders === 0 ? <EmptyState message="Aucune commande pour le moment." /> : (
                <div className="space-y-2">
                  {([
                    ["PENDING", stats.pendingOrders], ["PREPARING", stats.inProductionOrders],
                    ["DELIVERED", stats.completedOrders], ["CANCELLED", stats.cancelledOrders],
                  ] as const).map(([key, count]) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <StatusBadge status={key} />
                      <span className="text-muted-foreground">{count} ({stats.totalOrders > 0 ? Math.round((count / stats.totalOrders) * 100) : 0}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* ── Reviews ── */}
        <TabsContent value="reviews" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {(data?.reviews ?? []).length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucun avis PRINT pour le moment.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Imprimeur</th><th className="p-3">Client</th><th className="p-3">Note</th><th className="p-3">Commentaire</th><th className="p-3">Date</th></tr></thead>
                  <tbody>
                    {(data?.reviews ?? []).map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3">{r.printerName}</td>
                        <td className="p-3">{r.cafeOwnerName || r.cafeName}</td>
                        <td className="p-3 flex items-center gap-1 text-amber-500"><Star className="h-3.5 w-3.5 fill-current" />{r.rating}</td>
                        <td className="p-3 max-w-[280px] truncate">{r.comment || "—"}</td>
                        <td className="p-3 text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PrinterDetail printer={selectedPrinter} onClose={() => setSelectedPrinter(null)} />
      <OrderDetail order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}
