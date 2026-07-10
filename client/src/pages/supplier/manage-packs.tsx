import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Plus, Package, Pencil, Trash2, Copy, Eye, EyeOff, Layers, ImageOff,
  Archive, ArchiveRestore, Search, Calendar, BoxesIcon, Star
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/format";
import type { SupplierListingWithProduct, PackDetail } from "@shared/schema";

// ── Data hooks ────────────────────────────────────────────────────────────────

function usePackListings() {
  return useQuery<SupplierListingWithProduct[]>({
    queryKey: ["/api/supplier/listings", "__all_for_pack__"],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/listings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

function usePacks() {
  return useQuery<PackDetail[]>({ queryKey: ["/api/supplier/packs"] });
}

type PackItemDraft = { listingId: number; variantId: number | null; quantity: number };

// ── Pack Form Modal ───────────────────────────────────────────────────────────

function PackFormModal({ open, onClose, editing, listings, preSelectedItems = [] }: {
  open: boolean;
  onClose: () => void;
  editing: PackDetail | null;
  listings: SupplierListingWithProduct[];
  preSelectedItems?: PackItemDraft[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [imageUrl, setImageUrl] = useState(editing?.imageUrl ?? "");
  const [price, setPrice] = useState(editing ? String(editing.price / 100) : "");
  const [quantityAvailable, setQuantityAvailable] = useState(editing ? String(editing.quantityAvailable) : "1");
  const [expirationDate, setExpirationDate] = useState(editing?.expirationDate ? new Date(editing.expirationDate).toISOString().slice(0, 10) : "");
  const [items, setItems] = useState<PackItemDraft[]>(
    editing
      ? editing.items.map(i => ({ listingId: i.listingId, variantId: i.variantId, quantity: i.quantity }))
      : preSelectedItems
  );

  // Determine which listings to show in the product selection:
  // - If we have preSelectedItems (coming from Pack Products tab), show only those listings
  // - Otherwise show all pack-eligible listings
  const preSelectedListingIds = useMemo(() =>
    preSelectedItems.length ? new Set(preSelectedItems.map(i => i.listingId)) : null,
    [preSelectedItems]
  );

  const usableListings = useMemo(() => {
    let base = listings.filter(l =>
      (l.variants ?? []).some(v => v.price > 0 && v.quantity > 0) || (l.price > 0 && l.stock > 0)
    );
    // Exclude onlyForMyProducts listings from pack building
    base = base.filter(l => !(l as any).onlyForMyProducts);
    // If coming from Pack Products selection, restrict to selected listings
    if (preSelectedListingIds) {
      base = base.filter(l => preSelectedListingIds.has(l.id));
    }
    return base;
  }, [listings, preSelectedListingIds]);

  const toggleItem = (listingId: number, variantId: number | null) => {
    setItems(prev => {
      const exists = prev.find(i => i.listingId === listingId && i.variantId === variantId);
      if (exists) return prev.filter(i => !(i.listingId === listingId && i.variantId === variantId));
      return [...prev, { listingId, variantId, quantity: 1 }];
    });
  };

  const setQty = (listingId: number, variantId: number | null, quantity: number) => {
    setItems(prev => prev.map(i => (i.listingId === listingId && i.variantId === variantId) ? { ...i, quantity: Math.max(1, quantity) } : i));
  };

  const preview = useMemo(() => {
    const categoryNames = new Set<string>();
    const subCategoryNames = new Set<string>();
    const brandNames = new Set<string>();
    let total = 0;
    const rows = items.map(it => {
      const listing = listings.find(l => l.id === it.listingId);
      if (!listing) return null;
      const variant = it.variantId ? (listing.variants ?? []).find(v => v.id === it.variantId) : null;
      const unitPrice = variant ? variant.price : listing.price;
      total += unitPrice * it.quantity;
      if (listing.product.categoryLabel) categoryNames.add(listing.product.categoryLabel.name);
      if (listing.product.subCategoryLabel) subCategoryNames.add(listing.product.subCategoryLabel.name);
      if (listing.product.brandLabel) brandNames.add(listing.product.brandLabel.name);
      return { ...it, productName: listing.product.name, flavorName: variant?.flavorName, sizeName: variant?.sizeName, unitPrice };
    }).filter(Boolean) as any[];
    return { rows, categoryNames: Array.from(categoryNames), subCategoryNames: Array.from(subCategoryNames), brandNames: Array.from(brandNames), individualTotal: total };
  }, [items, listings]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        description: description || null,
        imageUrl: imageUrl || null,
        price: parseFloat(price) || 0,
        quantityAvailable: parseInt(quantityAvailable) || 0,
        expirationDate: expirationDate || null,
        items: items.map(i => ({ listingId: i.listingId, variantId: i.variantId, quantity: i.quantity })),
      };
      return editing
        ? apiRequest("PATCH", `/api/supplier/packs/${editing.id}`, body)
        : apiRequest("POST", "/api/supplier/packs", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] });
      toast({ title: editing ? "Pack updated" : "Pack created" });
      onClose();
    },
    onError: (err: any) => toast({ title: err?.message ?? "Error saving pack", variant: "destructive" }),
  });

  const canSave = name.trim().length > 0 && items.length >= 2 && parseFloat(price) >= 0 && parseInt(quantityAvailable) >= 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit Pack" : "Create a Pack"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
          <div className="space-y-4">
            <div>
              <Label>Pack name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Café Starter Bundle" data-testid="input-pack-name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What's included and why it's a good deal" />
            </div>
            <div>
              <Label>Image URL</Label>
              <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…" data-testid="input-pack-image" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pack price</Label>
                <Input type="number" min={0} step="0.01" value={price} onChange={e => setPrice(e.target.value)} data-testid="input-pack-price" />
              </div>
              <div>
                <Label>Packs available (stock)</Label>
                <Input type="number" min={0} value={quantityAvailable} onChange={e => setQuantityAvailable(e.target.value)} data-testid="input-pack-quantity" />
              </div>
            </div>
            <div>
              <Label>Expiration date (optional)</Label>
              <Input type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} data-testid="input-pack-expiration" />
            </div>

            <div>
              <Label className="mb-2 block">
                Products in pack
                {items.length < 2 && <span className="text-xs text-amber-600 ml-2">(select at least 2)</span>}
              </Label>
              <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                {usableListings.length === 0 && (
                  <p className="text-sm text-muted-foreground p-3">No pack-eligible products found.</p>
                )}
                {usableListings.map(listing => {
                  const rows = (listing.variants ?? []).length
                    ? (listing.variants ?? []).filter(v => v.price > 0 && v.quantity > 0).map(v => ({ variantId: v.id as number | null, label: [v.flavorName, v.sizeName].filter(Boolean).join(" · ") || "Default", price: v.price, stock: v.quantity }))
                    : [{ variantId: null as number | null, label: "Default", price: listing.price, stock: listing.stock }];
                  return (
                    <div key={listing.id} className="p-2">
                      <div className="flex items-center gap-2 text-sm font-medium mb-1">
                        {listing.product.imageUrl ? <img src={listing.product.imageUrl} className="w-6 h-6 rounded object-cover" /> : <Package className="w-4 h-4 text-muted-foreground" />}
                        {listing.product.name}
                        {(listing as any).onlyForPack && <Badge variant="outline" className="text-[10px]">Pack only</Badge>}
                      </div>
                      <div className="space-y-1 pl-6">
                        {rows.map(r => {
                          const checked = items.some(i => i.listingId === listing.id && i.variantId === r.variantId);
                          const item = items.find(i => i.listingId === listing.id && i.variantId === r.variantId);
                          return (
                            <div key={String(r.variantId)} className="flex items-center gap-2">
                              <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                <input type="checkbox" checked={checked} onChange={() => toggleItem(listing.id, r.variantId)} className="rounded" data-testid={`checkbox-pack-item-${listing.id}-${r.variantId}`} />
                                <span className="text-xs text-muted-foreground">{r.label} — {formatCurrency(r.price)} · {r.stock} in stock</span>
                              </label>
                              {checked && (
                                <Input type="number" min={1} max={r.stock} value={item?.quantity ?? 1} onChange={e => setQty(listing.id, r.variantId, parseInt(e.target.value) || 1)} className="w-16 h-7 text-xs" data-testid={`input-pack-item-qty-${listing.id}-${r.variantId}`} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending || !canSave} data-testid="button-save-pack">
                {save.isPending ? "Saving…" : editing ? "Save Pack" : "Create Pack"}
              </Button>
            </div>
          </div>

          {/* Live preview */}
          <div>
            <Label className="mb-2 block">Live preview</Label>
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="aspect-video bg-secondary rounded-lg overflow-hidden flex items-center justify-center">
                  {imageUrl ? <img src={imageUrl} className="w-full h-full object-cover" /> : <ImageOff className="w-8 h-8 text-muted-foreground" />}
                </div>
                <div>
                  <p className="font-semibold">{name || "Pack name"}</p>
                  <p className="text-sm text-muted-foreground">{description || "Description…"}</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-primary">{formatCurrency((parseFloat(price) || 0) * 100)}</span>
                  {preview.individualTotal > 0 && <span className="text-sm text-muted-foreground line-through">{formatCurrency(preview.individualTotal)}</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {preview.categoryNames.map(n => <Badge key={n} variant="secondary" className="text-xs">{n}</Badge>)}
                  {preview.subCategoryNames.map(n => <Badge key={n} variant="outline" className="text-xs">{n}</Badge>)}
                  {preview.brandNames.map(n => <Badge key={n} className="text-xs">{n}</Badge>)}
                </div>
                <div className="space-y-1 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground">Includes:</p>
                  {preview.rows.length === 0 && <p className="text-xs text-muted-foreground">Select products on the left</p>}
                  {preview.rows.map((r, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{r.quantity}× {r.productName}{r.flavorName ? ` (${r.flavorName})` : ""}{r.sizeName ? ` — ${r.sizeName}` : ""}</span>
                      <span className="text-muted-foreground">{formatCurrency(r.unitPrice * r.quantity)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pack Preview Modal (read-only) ────────────────────────────────────────────

function PackPreviewModal({ pack, open, onClose, listings }: {
  pack: PackDetail | null;
  open: boolean;
  onClose: () => void;
  listings: SupplierListingWithProduct[];
}) {
  if (!pack) return null;
  const maxQty = Math.min(pack.quantityAvailable, pack.maxBuildable);
  const individualTotal = pack.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Pack Preview</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-1">
          <div className="aspect-video bg-secondary rounded-lg overflow-hidden flex items-center justify-center">
            {pack.imageUrl ? <img src={pack.imageUrl} className="w-full h-full object-cover" alt={pack.name} /> : <ImageOff className="w-8 h-8 text-muted-foreground" />}
          </div>
          <div>
            <h3 className="font-bold text-lg">{pack.name}</h3>
            {pack.description && <p className="text-sm text-muted-foreground mt-1">{pack.description}</p>}
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-primary">{formatCurrency(pack.price)}</span>
            {individualTotal > pack.price && (
              <span className="text-sm text-muted-foreground line-through">{formatCurrency(individualTotal)}</span>
            )}
            <span className="text-sm text-muted-foreground">{maxQty} available</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {pack.categoryLabels.map(c => <Badge key={c.id} variant="secondary" className="text-xs">{c.name}</Badge>)}
            {pack.subCategoryLabels.map(c => <Badge key={c.id} variant="outline" className="text-xs">{c.name}</Badge>)}
            {pack.brandLabels.map(b => <Badge key={b.id} className="text-xs">{b.name}</Badge>)}
          </div>
          {pack.expirationDate && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>Expires {new Date(pack.expirationDate).toLocaleDateString()}</span>
            </div>
          )}
          <div className="border rounded-lg divide-y">
            <p className="text-xs font-medium text-muted-foreground px-3 py-2">Includes:</p>
            {pack.items.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                <div className="w-9 h-9 rounded bg-secondary overflow-hidden flex items-center justify-center shrink-0">
                  {item.productImageUrl ? <img src={item.productImageUrl} className="w-full h-full object-cover" alt="" /> : <Package className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.productName}</p>
                  {(item.flavorName || item.sizeName) && (
                    <p className="text-xs text-muted-foreground">{[item.flavorName, item.sizeName].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                <span className="text-xs font-semibold text-muted-foreground shrink-0">×{item.quantity}</span>
                <span className="text-xs text-muted-foreground shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pack Products Tab ─────────────────────────────────────────────────────────

function PackProductsTab({ listings, onCreatePack }: {
  listings: SupplierListingWithProduct[];
  onCreatePack: (preSelected: PackItemDraft[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PackItemDraft[]>([]);

  // Only pack-eligible listings (not onlyForMyProducts)
  const eligible = useMemo(() =>
    listings.filter(l => !(l as any).onlyForMyProducts &&
      ((l.variants ?? []).some(v => v.price > 0 && v.quantity > 0) || (l.price > 0 && l.stock > 0))
    ), [listings]);

  const filtered = useMemo(() => {
    if (!search.trim()) return eligible;
    const q = search.toLowerCase();
    return eligible.filter(l =>
      l.product.name.toLowerCase().includes(q) ||
      l.product.categoryLabel?.name.toLowerCase().includes(q) ||
      l.product.brandLabel?.name.toLowerCase().includes(q)
    );
  }, [eligible, search]);

  const toggleVariant = (listingId: number, variantId: number | null) => {
    setSelected(prev => {
      const exists = prev.find(i => i.listingId === listingId && i.variantId === variantId);
      if (exists) return prev.filter(i => !(i.listingId === listingId && i.variantId === variantId));
      return [...prev, { listingId, variantId, quantity: 1 }];
    });
  };

  const setQty = (listingId: number, variantId: number | null, quantity: number) => {
    setSelected(prev => prev.map(i =>
      i.listingId === listingId && i.variantId === variantId ? { ...i, quantity: Math.max(1, quantity) } : i
    ));
  };

  // Count distinct products selected (not variants) for the ≥2 rule
  const distinctProductsSelected = new Set(selected.map(i => i.listingId)).size;
  const canCreate = distinctProductsSelected >= 2;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search products…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-pack-products-search"
          />
        </div>
        <Button
          onClick={() => onCreatePack(selected)}
          disabled={!canCreate}
          data-testid="button-create-pack-from-selection"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Create Pack
          {selected.length > 0 && <span className="ml-1 bg-white/20 text-xs rounded-full px-1.5">{selected.length}</span>}
        </Button>
      </div>

      {!canCreate && selected.length > 0 && (
        <p className="text-xs text-amber-600">Select at least 2 products to create a Pack.</p>
      )}

      {eligible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <BoxesIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No pack-eligible products yet. Add products to "My Products" first.</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No products match your search.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {filtered.map(listing => {
            const rows = (listing.variants ?? []).length
              ? (listing.variants ?? []).filter(v => v.price > 0 && v.quantity > 0).map(v => ({
                  variantId: v.id as number | null,
                  label: [v.flavorName, v.sizeName].filter(Boolean).join(" · ") || "Default",
                  price: v.price,
                  stock: v.quantity,
                }))
              : [{ variantId: null as number | null, label: "Default", price: listing.price, stock: listing.stock }];

            const anySelected = rows.some(r => selected.some(s => s.listingId === listing.id && s.variantId === r.variantId));

            return (
              <div key={listing.id} className={`p-3 transition-colors ${anySelected ? "bg-primary/5" : ""}`}>
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  {listing.product.imageUrl
                    ? <img src={listing.product.imageUrl} className="w-8 h-8 rounded object-cover" alt="" />
                    : <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground" /></div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{listing.product.name}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {listing.product.categoryLabel && <Badge variant="secondary" className="text-[10px]">{listing.product.categoryLabel.name}</Badge>}
                      {listing.product.brandLabel && <Badge variant="outline" className="text-[10px]">{listing.product.brandLabel.name}</Badge>}
                      {(listing as any).onlyForPack && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-0">Pack only</Badge>}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 pl-10">
                  {rows.map(r => {
                    const isChecked = selected.some(s => s.listingId === listing.id && s.variantId === r.variantId);
                    const item = selected.find(s => s.listingId === listing.id && s.variantId === r.variantId);
                    return (
                      <div key={String(r.variantId)} className="flex items-center gap-2">
                        <label className="flex items-center gap-2 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleVariant(listing.id, r.variantId)}
                            className="rounded"
                            data-testid={`checkbox-pack-product-${listing.id}-${r.variantId}`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {r.label} — {formatCurrency(r.price)} · <span className="text-green-600">{r.stock} in stock</span>
                          </span>
                        </label>
                        {isChecked && (
                          <div className="flex items-center gap-1">
                            <Label className="text-xs">Qty:</Label>
                            <Input
                              type="number"
                              min={1}
                              max={r.stock}
                              value={item?.quantity ?? 1}
                              onChange={e => setQty(listing.id, r.variantId, parseInt(e.target.value) || 1)}
                              className="w-16 h-7 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Active Pack Card ──────────────────────────────────────────────────────────

function ActivePackCard({ pack, onEdit, onPreview, onToggleVisibility, onDuplicate, onArchive, onDelete }: {
  pack: PackDetail;
  onEdit: () => void;
  onPreview: () => void;
  onToggleVisibility: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const maxQty = Math.min(pack.quantityAvailable, pack.maxBuildable);
  const individualTotal = pack.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <Card
      className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
      onClick={onPreview}
      data-testid={`card-pack-${pack.id}`}
    >
      <div className="relative aspect-[16/7] bg-secondary overflow-hidden">
        {pack.imageUrl
          ? <img src={pack.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={pack.name} />
          : <div className="w-full h-full flex items-center justify-center"><Layers className="w-10 h-10 text-muted-foreground/40" /></div>
        }
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge variant={pack.visibility === "VISIBLE" ? "default" : "secondary"} className="text-[10px]">
            {pack.visibility === "VISIBLE" ? "Visible" : "Hidden"}
          </Badge>
          {pack.isExpired && <Badge variant="destructive" className="text-[10px]">Expired</Badge>}
          {!pack.isAvailable && !pack.isExpired && <Badge variant="outline" className="text-[10px] bg-white/80">Out of stock</Badge>}
        </div>
      </div>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base leading-tight">{pack.name}</h3>
            {pack.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{pack.description}</p>}
            <div className="flex flex-wrap gap-1 mt-2">
              {pack.brandLabels.map(b => <Badge key={b.id} className="text-[10px]">{b.name}</Badge>)}
              {pack.categoryLabels.map(c => <Badge key={c.id} variant="secondary" className="text-[10px]">{c.name}</Badge>)}
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div>
                <span className="text-lg font-bold text-primary">{formatCurrency(pack.price)}</span>
                {individualTotal > pack.price && (
                  <span className="text-xs text-muted-foreground line-through ml-1.5">{formatCurrency(individualTotal)}</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <BoxesIcon className="w-3 h-3" />
                {maxQty} available
              </div>
              {pack.expirationDate && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(pack.expirationDate).toLocaleDateString()}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{pack.items.length} item{pack.items.length !== 1 ? "s" : ""} · {pack.packReviewCount} review{pack.packReviewCount !== 1 ? "s" : ""}</p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              onClick={onEdit}
              className="h-8 w-8 p-0"
              title="Edit"
              data-testid={`button-edit-pack-${pack.id}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onToggleVisibility}
              className="h-8 w-8 p-0"
              title={pack.visibility === "VISIBLE" ? "Hide" : "Show"}
              data-testid={`button-toggle-visibility-pack-${pack.id}`}
            >
              {pack.visibility === "VISIBLE" ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDuplicate}
              className="h-8 w-8 p-0"
              title="Duplicate"
              data-testid={`button-duplicate-pack-${pack.id}`}
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onArchive}
              className="h-8 w-8 p-0"
              title="Archive"
              data-testid={`button-archive-pack-${pack.id}`}
            >
              <Archive className="w-3.5 h-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 w-8 p-0"
                  title="Delete"
                  data-testid={`button-delete-pack-${pack.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Pack?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <strong>{pack.name}</strong> and cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Archived Pack Row ─────────────────────────────────────────────────────────

function ArchivedPackRow({ pack, onToggleVisibility, onUnarchive, onDelete }: {
  pack: PackDetail;
  onToggleVisibility: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="overflow-hidden opacity-75" data-testid={`card-pack-archived-${pack.id}`}>
      <CardContent className="p-3 flex gap-3 items-center">
        <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center overflow-hidden shrink-0">
          {pack.imageUrl ? <img src={pack.imageUrl} className="w-full h-full object-cover" alt={pack.name} /> : <Layers className="w-5 h-5 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{pack.name}</p>
          <p className="text-xs text-muted-foreground">
            {pack.items.length} items · {formatCurrency(pack.price)} · {pack.visibility === "VISIBLE" ? "Visible" : "Hidden"}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {pack.categoryLabels.map(c => <Badge key={c.id} variant="secondary" className="text-[10px]">{c.name}</Badge>)}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={onToggleVisibility} className="h-8 w-8 p-0" title={pack.visibility === "VISIBLE" ? "Hide" : "Show"}>
            {pack.visibility === "VISIBLE" ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="outline" onClick={onUnarchive} className="h-8 px-2 gap-1" title="Restore">
            <ArchiveRestore className="w-3.5 h-3.5" />
            <span className="text-xs">Restore</span>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" className="h-8 w-8 p-0" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Pack?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{pack.name}</strong> and cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main PackTab ──────────────────────────────────────────────────────────────

export function PackTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: listings = [], isLoading: loadingListings } = usePackListings();
  const { data: packRows = [], isLoading: loadingPacks } = usePacks();

  const [activeTab, setActiveTab] = useState<"products" | "packs" | "archived">("products");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PackDetail | null>(null);
  const [preSelectedItems, setPreSelectedItems] = useState<PackItemDraft[]>([]);
  const [previewPack, setPreviewPack] = useState<PackDetail | null>(null);
  const [archivedSearch, setArchivedSearch] = useState("");

  const activePacks = packRows.filter(p => !p.isArchived);
  const archivedPacks = packRows.filter(p => p.isArchived);

  const filteredArchived = useMemo(() => {
    if (!archivedSearch.trim()) return archivedPacks;
    const q = archivedSearch.toLowerCase();
    return archivedPacks.filter(p => p.name.toLowerCase().includes(q));
  }, [archivedPacks, archivedSearch]);

  const toggleVisibility = useMutation({
    mutationFn: (p: PackDetail) => apiRequest("PATCH", `/api/supplier/packs/${p.id}`, { visibility: p.visibility === "VISIBLE" ? "HIDDEN" : "VISIBLE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] }); },
    onError: () => toast({ title: "Failed to update visibility", variant: "destructive" }),
  });

  const archive = useMutation({
    mutationFn: (p: PackDetail) => apiRequest("PATCH", `/api/supplier/packs/${p.id}`, { isArchived: !p.isArchived }),
    onSuccess: (_, p) => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] });
      toast({ title: p.isArchived ? "Pack restored" : "Pack archived" });
    },
  });

  const duplicate = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/supplier/packs/${id}/duplicate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] });
      toast({ title: "Pack duplicated" });
      setActiveTab("packs");
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/supplier/packs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] });
      toast({ title: "Pack deleted" });
    },
  });

  const openCreate = (preSelected: PackItemDraft[]) => {
    setEditing(null);
    setPreSelectedItems(preSelected);
    setFormOpen(true);
  };

  const openEdit = (pack: PackDetail) => {
    setEditing(pack);
    setPreSelectedItems([]);
    setFormOpen(true);
  };

  if (loadingListings || loadingPacks) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="products" data-testid="tab-pack-products">
            Pack Products
          </TabsTrigger>
          <TabsTrigger value="packs" data-testid="tab-new-packs">
            New Packs{activePacks.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px]">{activePacks.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="archived" data-testid="tab-old-packs">
            Old Packs{archivedPacks.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px]">{archivedPacks.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── Pack Products ───────────────────────────────────────────────── */}
        <TabsContent value="products" className="mt-4">
          <div className="text-sm text-muted-foreground mb-3">
            Select at least 2 products, then click <strong>Create Pack</strong> to bundle them.
          </div>
          <PackProductsTab listings={listings} onCreatePack={openCreate} />
        </TabsContent>

        {/* ── New Packs ───────────────────────────────────────────────────── */}
        <TabsContent value="packs" className="mt-4">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">Active packs visible in the marketplace.</p>
            <Button size="sm" variant="outline" onClick={() => openCreate([])}>
              <Plus className="w-4 h-4 mr-1.5" />Create Pack
            </Button>
          </div>
          {activePacks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No active packs yet. Select products in the <strong>Pack Products</strong> tab to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activePacks.map(pack => (
                <ActivePackCard
                  key={pack.id}
                  pack={pack}
                  onEdit={() => openEdit(pack)}
                  onPreview={() => setPreviewPack(pack)}
                  onToggleVisibility={() => toggleVisibility.mutate(pack)}
                  onDuplicate={() => duplicate.mutate(pack.id)}
                  onArchive={() => archive.mutate(pack)}
                  onDelete={() => remove.mutate(pack.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Old Packs ───────────────────────────────────────────────────── */}
        <TabsContent value="archived" className="mt-4">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search archived packs…"
                value={archivedSearch}
                onChange={e => setArchivedSearch(e.target.value)}
              />
            </div>
            {archivedPacks.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Archive className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No archived packs.</p>
                </CardContent>
              </Card>
            ) : filteredArchived.length === 0 ? (
              <p className="text-sm text-muted-foreground">No packs match your search.</p>
            ) : (
              <div className="space-y-2">
                {filteredArchived.map(pack => (
                  <ArchivedPackRow
                    key={pack.id}
                    pack={pack}
                    onToggleVisibility={() => toggleVisibility.mutate(pack)}
                    onUnarchive={() => archive.mutate(pack)}
                    onDelete={() => remove.mutate(pack.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Pack Form Modal */}
      {formOpen && (
        <PackFormModal
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditing(null); setPreSelectedItems([]); }}
          editing={editing}
          listings={listings}
          preSelectedItems={preSelectedItems}
        />
      )}

      {/* Pack Preview Modal */}
      <PackPreviewModal
        pack={previewPack}
        open={previewPack !== null}
        onClose={() => setPreviewPack(null)}
        listings={listings}
      />
    </div>
  );
}
