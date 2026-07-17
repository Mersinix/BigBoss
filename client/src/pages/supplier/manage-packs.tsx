import { useState, useMemo, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

// ── Variant grouping helper ───────────────────────────────────────────────────
// Groups individual flavor variants by size so the supplier works with
// "Espresso Shot (Vanilla • Caramel • Hazelnut)" rather than separate rows.
type VariantGroup = {
  key: string;
  sizeName: string | null;
  flavors: string[];
  price: number;
  totalStock: number;
  representativeId: number | null; // first variant's id, used as the pack item variantId
};

function getVariantGroups(listing: SupplierListingWithProduct): VariantGroup[] {
  const variants = (listing.variants ?? []).filter(v => v.price > 0 && v.quantity > 0);
  if (variants.length === 0) {
    if (listing.price > 0 && listing.stock > 0) {
      return [{ key: "__none__", sizeName: null, flavors: [], price: listing.price, totalStock: listing.stock, representativeId: null }];
    }
    return [];
  }
  const map = new Map<string, VariantGroup>();
  for (const v of variants) {
    const key = v.sizeName ?? "__none__";
    if (!map.has(key)) {
      // Representative = first variant in the size group.
      // totalStock = representative's stock to stay consistent with backend maxBuildable
      // (which checks the representative variantId's availableQuantity, not the group sum).
      map.set(key, { key, sizeName: v.sizeName ?? null, flavors: [], price: v.price, totalStock: v.quantity, representativeId: v.id ?? null });
    }
    const g = map.get(key)!;
    if (v.flavorName) g.flavors.push(v.flavorName);
  }
  return Array.from(map.values());
}

function variantGroupLabel(g: VariantGroup): string {
  const flavorPart = g.flavors.length > 0 ? `( ${g.flavors.join(" • ")} )` : "";
  const sizePart = g.sizeName ?? "";
  if (flavorPart && sizePart) return `${flavorPart} · ${sizePart}`;
  return flavorPart || sizePart || "Default";
}

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

type PackItemDraft = { listingId: number; variantId: number | null; quantity: number; packVariantPrice: string };

// ── Pack Form Modal ───────────────────────────────────────────────────────────

function PackFormModal({ open, onClose, editing, listings, preSelectedItems = [], onCreated }: {
  open: boolean;
  onClose: () => void;
  editing: PackDetail | null;
  listings: SupplierListingWithProduct[];
  preSelectedItems?: PackItemDraft[];
  onCreated?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [imageUrl, setImageUrl] = useState(editing?.imageUrl ?? "");
  const [expirationDate, setExpirationDate] = useState(editing?.expirationDate ? new Date(editing.expirationDate).toISOString().slice(0, 10) : "");
  const [items, setItems] = useState<PackItemDraft[]>(
    editing
      ? editing.items.map(i => ({ listingId: i.listingId, variantId: i.variantId, quantity: i.quantity, packVariantPrice: i.packVariantPrice > 0 ? String(i.packVariantPrice / 100) : "" }))
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

  const toggleItem = (listingId: number, variantId: number | null, defaultPrice: number) => {
    setItems(prev => {
      const exists = prev.find(i => i.listingId === listingId && i.variantId === variantId);
      if (exists) return prev.filter(i => !(i.listingId === listingId && i.variantId === variantId));
      // defaultPrice is the original variant price in cents; convert to dollars for the input
      const packVariantPrice = defaultPrice > 0 ? String((defaultPrice / 100).toFixed(2)) : "";
      return [...prev, { listingId, variantId, quantity: 1, packVariantPrice }];
    });
  };

  const setQty = (listingId: number, variantId: number | null, quantity: number) => {
    setItems(prev => prev.map(i => (i.listingId === listingId && i.variantId === variantId) ? { ...i, quantity: Math.max(1, quantity) } : i));
  };

  const setPackVariantPrice = (listingId: number, variantId: number | null, packVariantPrice: string) => {
    setItems(prev => prev.map(i => (i.listingId === listingId && i.variantId === variantId) ? { ...i, packVariantPrice } : i));
  };

  const preview = useMemo(() => {
    const categoryNames = new Set<string>();
    const subCategoryNames = new Set<string>();
    const brandNames = new Set<string>();
    let individualTotal = 0;
    let packTotal = 0;
    let autoQuantity = Infinity;
    const rows = items.map(it => {
      const listing = listings.find(l => l.id === it.listingId);
      if (!listing) return null;
      const variant = it.variantId ? (listing.variants ?? []).find(v => v.id === it.variantId) : null;
      const unitPrice = variant ? variant.price : listing.price;
      const availableQty = variant ? variant.quantity : listing.stock;
      individualTotal += unitPrice * it.quantity;
      const packVariantPriceCents = Math.round((parseFloat(it.packVariantPrice) || 0) * 100);
      packTotal += packVariantPriceCents * it.quantity;
      if (it.quantity > 0) autoQuantity = Math.min(autoQuantity, Math.floor(availableQty / it.quantity));
      if (listing.product.categoryLabel) categoryNames.add(listing.product.categoryLabel.name);
      if (listing.product.subCategoryLabel) subCategoryNames.add(listing.product.subCategoryLabel.name);
      if (listing.product.brandLabel) brandNames.add(listing.product.brandLabel.name);
      return { ...it, productName: listing.product.name, flavorName: variant?.flavorName, sizeName: variant?.sizeName, unitPrice, packVariantPriceCents };
    }).filter(Boolean) as any[];
    return {
      rows,
      categoryNames: Array.from(categoryNames),
      subCategoryNames: Array.from(subCategoryNames),
      brandNames: Array.from(brandNames),
      individualTotal,
      packTotal, // auto-computed total pack price in cents
      autoQuantity: isFinite(autoQuantity) ? autoQuantity : 0,
    };
  }, [items, listings]);

  // Auto-computed pack price from per-variant pack prices
  const autoPackPrice = preview.packTotal / 100; // in dollars
  const priceError = preview.individualTotal > 0 && items.length > 0 && preview.packTotal >= preview.individualTotal
    ? "Pack price must be lower than the total original price of the included products"
    : null;

  const expirationError = expirationDate && new Date(expirationDate) < new Date(new Date().toDateString())
    ? "Expiration date cannot be in the past"
    : null;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        description: description || null,
        imageUrl: imageUrl || null,
        price: autoPackPrice,
        // quantityAvailable is intentionally omitted — the server auto-computes it
        // from the selected variants' current stock.
        expirationDate: expirationDate || null,
        items: items.map(i => ({
          listingId: i.listingId,
          variantId: i.variantId,
          quantity: i.quantity,
          packVariantPrice: parseFloat(i.packVariantPrice) || 0,
        })),
      };
      return editing
        ? apiRequest("PATCH", `/api/supplier/packs/${editing.id}`, body)
        : apiRequest("POST", "/api/supplier/packs", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] });
      toast({ title: editing ? "Pack updated" : "Pack created" });
      if (!editing) onCreated?.();
      onClose();
    },
    onError: (err: any) => toast({ title: err?.message ?? "Error saving pack", variant: "destructive" }),
  });

  // Every selected variant must have its pack variant price filled (> 0)
  const missingPriceCount = items.filter(i => !(parseFloat(i.packVariantPrice) > 0)).length;
  const variantPriceError = missingPriceCount > 0
    ? `${missingPriceCount} selected variant${missingPriceCount > 1 ? "s are" : " is"} missing a Pack Variant Price`
    : null;
  const canSave = name.trim().length > 0 && items.length >= 2 && !variantPriceError && !priceError && !expirationError;
  // items.length >= 2 means at least 2 variants selected (each checkbox = one variant group)

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
                <Label>Pack price (auto)</Label>
                <div className="h-9 flex items-center px-3 rounded-md border bg-secondary/30 text-sm font-medium" data-testid="text-pack-auto-price">
                  {items.length > 0 ? formatCurrency(preview.packTotal) : "—"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Auto-computed from variant pack prices below</p>
              </div>
              <div>
                <Label>Packs available (stock)</Label>
                <div className="h-9 flex items-center px-3 rounded-md border bg-secondary/30 text-sm text-muted-foreground" data-testid="text-pack-auto-quantity">
                  {items.length > 0 ? `${preview.autoQuantity} (auto)` : "—"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Auto-computed from variant stock</p>
              </div>
            </div>
            {variantPriceError && (
              <p className="text-xs text-destructive -mt-2">{variantPriceError}</p>
            )}
            {priceError && (
              <p className="text-xs text-destructive -mt-2">{priceError}</p>
            )}
            <div>
              <Label>Expiration date (optional)</Label>
              <Input type="date" min={new Date().toISOString().slice(0, 10)} value={expirationDate} onChange={e => setExpirationDate(e.target.value)} data-testid="input-pack-expiration" />
              {expirationError && <p className="text-xs text-destructive mt-1">{expirationError}</p>}
            </div>

            <div>
              <Label className="mb-2 block">
                Variants in pack
                {items.length < 2 && <span className="text-xs text-amber-600 ml-2">(select at least 2 variants)</span>}
              </Label>
              <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                {usableListings.length === 0 && (
                  <p className="text-sm text-muted-foreground p-3">No pack-eligible products found.</p>
                )}
                {usableListings.map(listing => {
                  const groups = getVariantGroups(listing);
                  if (groups.length === 0) return null;
                  return (
                    <div key={listing.id} className="p-2">
                      <div className="flex items-center gap-2 text-sm font-medium mb-1">
                        {listing.product.imageUrl ? <img src={listing.product.imageUrl} className="w-6 h-6 rounded object-cover" /> : <Package className="w-4 h-4 text-muted-foreground" />}
                        {listing.product.name}
                        {(listing as any).onlyForPack && <Badge variant="outline" className="text-[10px]">Pack only</Badge>}
                      </div>
                      <div className="space-y-1 pl-6">
                        {groups.map(g => {
                          const checked = items.some(i => i.listingId === listing.id && i.variantId === g.representativeId);
                          const item = items.find(i => i.listingId === listing.id && i.variantId === g.representativeId);
                          return (
                            <div key={g.key} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                  <input type="checkbox" checked={checked} onChange={() => toggleItem(listing.id, g.representativeId, g.price)} className="rounded" data-testid={`checkbox-pack-item-${listing.id}-${g.key}`} />
                                  <span className="text-xs text-muted-foreground">
                                    {variantGroupLabel(g)}
                                    <span className="ml-1 text-gray-400">Original: {formatCurrency(g.price)}</span>
                                    · {g.totalStock} in stock
                                  </span>
                                </label>
                                {checked && (
                                  <Input type="number" min={1} max={g.totalStock} value={item?.quantity ?? 1} onChange={e => setQty(listing.id, g.representativeId, parseInt(e.target.value) || 1)} className="w-16 h-7 text-xs" data-testid={`input-pack-item-qty-${listing.id}-${g.key}`} />
                                )}
                              </div>
                              {checked && (
                                <div className="flex items-center gap-2 pl-5">
                                  <span className="text-xs text-muted-foreground shrink-0">Pack price:</span>
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    placeholder={String((g.price / 100).toFixed(2))}
                                    value={item?.packVariantPrice ?? ""}
                                    onChange={e => setPackVariantPrice(listing.id, g.representativeId, e.target.value)}
                                    className="w-24 h-7 text-xs"
                                    data-testid={`input-pack-variant-price-${listing.id}-${g.key}`}
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
                  <span className="text-xl font-bold text-primary">{formatCurrency(preview.packTotal)}</span>
                  {preview.individualTotal > 0 && preview.packTotal > 0 && preview.packTotal < preview.individualTotal && (
                    <span className="text-sm text-muted-foreground line-through">{formatCurrency(preview.individualTotal)}</span>
                  )}
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

// ── Pack Preview Modal (with full actions) ────────────────────────────────────

function PackPreviewModal({ pack, open, onClose, onEdit, onToggleVisibility, onDuplicate, onArchive, onDelete }: {
  pack: PackDetail | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggleVisibility: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  if (!pack) return null;
  const maxQty = pack.maxBuildable; // always show real synchronized stock
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
            <Badge variant={pack.visibility === "VISIBLE" ? "default" : "secondary"} className="text-[10px] ml-auto">
              {pack.visibility === "VISIBLE" ? "Visible" : "Hidden"}
            </Badge>
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
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        // Filter listingVariants to only those matching this item's size
                        const sameSizeFlavors = (item.listingVariants ?? [])
                          .filter(v => v.sizeName === item.sizeName && v.flavorName)
                          .map(v => v.flavorName as string);
                        if (sameSizeFlavors.length > 1) {
                          return `( ${sameSizeFlavors.join(" • ")} )${item.sizeName ? " · " + item.sizeName : ""}`;
                        }
                        return [item.flavorName, item.sizeName].filter(Boolean).join(" · ");
                      })()}
                    </p>
                  )}
                </div>
                <span className="text-xs font-semibold text-muted-foreground shrink-0">×{item.quantity}</span>
                <span className="text-xs text-muted-foreground shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>

          {/* Pack actions */}
          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Actions</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { onClose(); onEdit(); }} data-testid={`button-edit-pack-${pack.id}`}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
              </Button>
              <Button size="sm" variant="outline" onClick={onToggleVisibility} data-testid={`button-toggle-visibility-pack-${pack.id}`}>
                {pack.visibility === "VISIBLE" ? <><EyeOff className="w-3.5 h-3.5 mr-1.5" />Hide</> : <><Eye className="w-3.5 h-3.5 mr-1.5" />Show</>}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { onClose(); onDuplicate(); }} data-testid={`button-duplicate-pack-${pack.id}`}>
                <Copy className="w-3.5 h-3.5 mr-1.5" />Duplicate
              </Button>
              <Button size="sm" variant="outline" onClick={() => { onClose(); onArchive(); }} data-testid={`button-archive-pack-${pack.id}`}>
                <Archive className="w-3.5 h-3.5 mr-1.5" />{pack.isArchived ? "Restore" : "Archive"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" data-testid={`button-delete-pack-${pack.id}`}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
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
                    <AlertDialogAction onClick={() => { onClose(); onDelete(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pack Products Tab ─────────────────────────────────────────────────────────

function PackProductsTab({ listings, onCreatePack, resetSignal }: {
  listings: SupplierListingWithProduct[];
  onCreatePack: (preSelected: PackItemDraft[]) => void;
  resetSignal: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("__all__");
  const [filterSubCategory, setFilterSubCategory] = useState("__all__");
  const [filterBrand, setFilterBrand] = useState("__all__");
  const [filterFlavor, setFilterFlavor] = useState("__all__");
  const [filterSize, setFilterSize] = useState("__all__");
  const [selected, setSelected] = useState<PackItemDraft[]>([]);

  // Clear the current selection whenever a Pack is successfully created,
  // so the supplier can immediately start selecting for a new one.
  useEffect(() => {
    setSelected([]);
  }, [resetSignal]);

  const removeFromPack = useMutation({
    mutationFn: (listingId: number) => apiRequest("PATCH", `/api/supplier/listings/${listingId}`, { onlyForPack: false, onlyForMyProducts: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/listings"] });
      setSelected(prev => prev.filter(s => s.listingId !== (removeFromPack.variables as number)));
      toast({ title: "Removed from Pack Products" });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Error removing product", variant: "destructive" }),
  });

  // Only pack-eligible listings (not onlyForMyProducts)
  const eligible = useMemo(() =>
    listings.filter(l => !(l as any).onlyForMyProducts &&
      getVariantGroups(l).length > 0
    ), [listings]);

  // Extract unique filter values from eligible listings
  const categories = useMemo(() => Array.from(new Set(eligible.map(l => l.product.categoryLabel?.name).filter((n): n is string => !!n))).sort(), [eligible]);
  const subCategories = useMemo(() => Array.from(new Set(eligible.map(l => l.product.subCategoryLabel?.name).filter((n): n is string => !!n))).sort(), [eligible]);
  const brands = useMemo(() => Array.from(new Set(eligible.map(l => l.product.brandLabel?.name).filter((n): n is string => !!n))).sort(), [eligible]);
  const flavors = useMemo(() => Array.from(new Set(eligible.flatMap(l => (l.variants ?? []).map(v => v.flavorName)).filter((n): n is string => !!n))).sort(), [eligible]);
  const sizes = useMemo(() => Array.from(new Set(eligible.flatMap(l => (l.variants ?? []).map(v => v.sizeName)).filter((n): n is string => !!n))).sort(), [eligible]);

  const filtered = useMemo(() => {
    let result = eligible;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.product.name.toLowerCase().includes(q) ||
        l.product.categoryLabel?.name.toLowerCase().includes(q) ||
        l.product.brandLabel?.name.toLowerCase().includes(q)
      );
    }
    if (filterCategory !== "__all__") result = result.filter(l => l.product.categoryLabel?.name === filterCategory);
    if (filterSubCategory !== "__all__") result = result.filter(l => l.product.subCategoryLabel?.name === filterSubCategory);
    if (filterBrand !== "__all__") result = result.filter(l => l.product.brandLabel?.name === filterBrand);
    if (filterFlavor !== "__all__") result = result.filter(l => (l.variants ?? []).some(v => v.flavorName === filterFlavor));
    if (filterSize !== "__all__") result = result.filter(l => (l.variants ?? []).some(v => v.sizeName === filterSize));
    return result;
  }, [eligible, search, filterCategory, filterSubCategory, filterBrand, filterFlavor, filterSize]);

  const toggleVariant = (listingId: number, variantId: number | null) => {
    setSelected(prev => {
      const exists = prev.find(i => i.listingId === listingId && i.variantId === variantId);
      if (exists) return prev.filter(i => !(i.listingId === listingId && i.variantId === variantId));
      return [...prev, { listingId, variantId, quantity: 1, packVariantPrice: "" }];
    });
  };

  const setQty = (listingId: number, variantId: number | null, quantity: number) => {
    setSelected(prev => prev.map(i =>
      i.listingId === listingId && i.variantId === variantId ? { ...i, quantity: Math.max(1, quantity) } : i
    ));
  };

  // ≥2 selected variant groups (each checkbox = one size variant group)
  const canCreate = selected.length >= 2;

  const hasActiveFilters = filterCategory !== "__all__" || filterSubCategory !== "__all__" || filterBrand !== "__all__" || filterFlavor !== "__all__" || filterSize !== "__all__";

  return (
    <div className="space-y-4">
      {/* Search + Create Pack button */}
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

      {/* Filter bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {categories.length > 0 && (
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 text-xs" data-testid="filter-pack-category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {subCategories.length > 0 && (
          <Select value={filterSubCategory} onValueChange={setFilterSubCategory}>
            <SelectTrigger className="h-8 text-xs" data-testid="filter-pack-subcategory">
              <SelectValue placeholder="Sub Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All sub-categories</SelectItem>
              {subCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {brands.length > 0 && (
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="h-8 text-xs" data-testid="filter-pack-brand">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All brands</SelectItem>
              {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {flavors.length > 0 && (
          <Select value={filterFlavor} onValueChange={setFilterFlavor}>
            <SelectTrigger className="h-8 text-xs" data-testid="filter-pack-flavor">
              <SelectValue placeholder="Flavor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All flavors</SelectItem>
              {flavors.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {sizes.length > 0 && (
          <Select value={filterSize} onValueChange={setFilterSize}>
            <SelectTrigger className="h-8 text-xs" data-testid="filter-pack-size">
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All sizes</SelectItem>
              {sizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs px-2 text-muted-foreground" onClick={() => { setFilterCategory("__all__"); setFilterSubCategory("__all__"); setFilterBrand("__all__"); setFilterFlavor("__all__"); setFilterSize("__all__"); }}>
            Clear filters
          </Button>
        )}
      </div>

      {!canCreate && selected.length > 0 && (
        <p className="text-xs text-amber-600">Select at least 2 variants to create a Pack.</p>
      )}

      {eligible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <BoxesIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No pack-eligible products yet. Add products to "My Products" first.</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No products match your filters.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {filtered.map(listing => {
            const groups = getVariantGroups(listing);
            const anySelected = groups.some(g => selected.some(s => s.listingId === listing.id && s.variantId === g.representativeId));

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
                      {listing.product.subCategoryLabel && <Badge variant="outline" className="text-[10px]">{listing.product.subCategoryLabel.name}</Badge>}
                      {listing.product.brandLabel && <Badge variant="outline" className="text-[10px]">{listing.product.brandLabel.name}</Badge>}
                      {(listing as any).onlyForPack && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-0">Pack only</Badge>}
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive shrink-0"
                        data-testid={`button-remove-pack-product-${listing.id}`}
                      >
                        Remove
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove from Pack Products?</AlertDialogTitle>
                        <AlertDialogDescription>
                          "{listing.product.name}" will no longer be available for new Packs. It stays in My Products, and any Packs already created that include it are not affected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeFromPack.mutate(listing.id)}>Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className="space-y-1.5 pl-10">
                  {groups.map(g => {
                    const isChecked = selected.some(s => s.listingId === listing.id && s.variantId === g.representativeId);
                    const item = selected.find(s => s.listingId === listing.id && s.variantId === g.representativeId);
                    return (
                      <div key={g.key} className="flex items-center gap-2">
                        <label className="flex items-center gap-2 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleVariant(listing.id, g.representativeId)}
                            className="rounded"
                            data-testid={`checkbox-pack-product-${listing.id}-${g.key}`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {variantGroupLabel(g)} — {formatCurrency(g.price)} · <span className="text-green-600">{g.totalStock} in stock</span>
                          </span>
                        </label>
                        {isChecked && (
                          <div className="flex items-center gap-1">
                            <Label className="text-xs">Qty:</Label>
                            <Input
                              type="number"
                              min={1}
                              max={g.totalStock}
                              value={item?.quantity ?? 1}
                              onChange={e => setQty(listing.id, g.representativeId, parseInt(e.target.value) || 1)}
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
// Actions removed from card — click card to open Preview modal, manage from there.

function ActivePackCard({ pack, onPreview }: {
  pack: PackDetail;
  onPreview: () => void;
}) {
  const maxQty = pack.maxBuildable; // always show real synchronized stock
  const individualTotal = pack.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <Card
      className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
      onClick={onPreview}
      data-testid={`card-pack-${pack.id}`}
    >
      <div className="relative aspect-video bg-secondary overflow-hidden">
        {pack.imageUrl
          ? <img src={pack.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={pack.name} />
          : <div className="w-full h-full flex items-center justify-center"><Layers className="w-8 h-8 text-muted-foreground/40" /></div>
        }
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge variant={pack.visibility === "VISIBLE" ? "default" : "secondary"} className="text-[10px]">
            {pack.visibility === "VISIBLE" ? "Visible" : "Hidden"}
          </Badge>
          {!pack.isAvailable && !pack.isExpired && <Badge variant="outline" className="text-[10px] bg-white/80">Out of stock</Badge>}
        </div>
      </div>
      <CardContent className="p-3">
        <h3 className="font-semibold text-sm leading-tight truncate">{pack.name}</h3>
        {pack.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{pack.description}</p>}
        <div className="flex items-center gap-3 mt-2">
          <span className="text-sm font-bold text-primary">{formatCurrency(pack.price)}</span>
          {individualTotal > pack.price && (
            <span className="text-xs text-muted-foreground line-through">{formatCurrency(individualTotal)}</span>
          )}
          <span className="text-xs text-muted-foreground flex items-center gap-0.5 ml-auto">
            <BoxesIcon className="w-3 h-3" />{maxQty}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {pack.categoryLabels.slice(0, 2).map(c => <Badge key={c.id} variant="secondary" className="text-[10px]">{c.name}</Badge>)}
        </div>
        {pack.expirationDate && (
          <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" />{new Date(pack.expirationDate).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Archived Pack Row ─────────────────────────────────────────────────────────

function ArchivedPackRow({ pack, onToggleVisibility, onUnarchive, onDelete, onEdit }: {
  pack: PackDetail;
  onToggleVisibility: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onEdit: () => void;
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
          <Button size="sm" variant="outline" onClick={onEdit} className="h-8 w-8 p-0" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
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
  const [previewPackId, setPreviewPackId] = useState<number | null>(null);
  const [archivedSearch, setArchivedSearch] = useState("");
  const [packCreateResetSignal, setPackCreateResetSignal] = useState(0);

  const [packsSearch, setPacksSearch] = useState("");
  const [packsFilterCategory, setPacksFilterCategory] = useState("__all__");
  const [packsFilterSubCategory, setPacksFilterSubCategory] = useState("__all__");
  const [packsFilterBrand, setPacksFilterBrand] = useState("__all__");
  const [packsFilterFlavor, setPacksFilterFlavor] = useState("__all__");
  const [packsFilterSize, setPacksFilterSize] = useState("__all__");

  // Expired packs automatically appear in "Old Packs" — not in "New Packs"
  const activePacks = packRows.filter(p => !p.isArchived && !p.isExpired);
  const archivedPacks = packRows.filter(p => p.isArchived || p.isExpired);

  const packsCategories = useMemo(() => Array.from(new Set(activePacks.flatMap(p => p.categoryLabels.map(c => c.name)))).sort(), [activePacks]);
  const packsSubCategories = useMemo(() => Array.from(new Set(activePacks.flatMap(p => p.subCategoryLabels.map(c => c.name)))).sort(), [activePacks]);
  const packsBrands = useMemo(() => Array.from(new Set(activePacks.flatMap(p => p.brandLabels.map(c => c.name)))).sort(), [activePacks]);
  const packsFlavors = useMemo(() => Array.from(new Set(activePacks.flatMap(p => p.items.map(i => i.flavorName).filter((n): n is string => !!n)))).sort(), [activePacks]);
  const packsSizes = useMemo(() => Array.from(new Set(activePacks.flatMap(p => p.items.map(i => i.sizeName).filter((n): n is string => !!n)))).sort(), [activePacks]);

  const filteredActivePacks = useMemo(() => {
    let result = activePacks;
    if (packsSearch.trim()) {
      const q = packsSearch.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q));
    }
    if (packsFilterCategory !== "__all__") result = result.filter(p => p.categoryLabels.some(c => c.name === packsFilterCategory));
    if (packsFilterSubCategory !== "__all__") result = result.filter(p => p.subCategoryLabels.some(c => c.name === packsFilterSubCategory));
    if (packsFilterBrand !== "__all__") result = result.filter(p => p.brandLabels.some(c => c.name === packsFilterBrand));
    if (packsFilterFlavor !== "__all__") result = result.filter(p => p.items.some(i => i.flavorName === packsFilterFlavor));
    if (packsFilterSize !== "__all__") result = result.filter(p => p.items.some(i => i.sizeName === packsFilterSize));
    return result;
  }, [activePacks, packsSearch, packsFilterCategory, packsFilterSubCategory, packsFilterBrand, packsFilterFlavor, packsFilterSize]);

  const packsHasActiveFilters = packsFilterCategory !== "__all__" || packsFilterSubCategory !== "__all__" || packsFilterBrand !== "__all__" || packsFilterFlavor !== "__all__" || packsFilterSize !== "__all__";

  // Always derive preview pack from live data to fix stale visibility/state
  const livePreviewPack = useMemo(() =>
    previewPackId !== null ? packRows.find(p => p.id === previewPackId) ?? null : null,
    [previewPackId, packRows]
  );

  const filteredArchived = useMemo(() => {
    if (!archivedSearch.trim()) return archivedPacks;
    const q = archivedSearch.toLowerCase();
    return archivedPacks.filter(p => p.name.toLowerCase().includes(q));
  }, [archivedPacks, archivedSearch]);

  const toggleVisibility = useMutation({
    mutationFn: (p: PackDetail) => apiRequest("PATCH", `/api/supplier/packs/${p.id}`, { visibility: p.visibility === "VISIBLE" ? "HIDDEN" : "VISIBLE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] });
      toast({ title: "Visibility updated" });
    },
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
      setPreviewPackId(null);
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
            Select at least 2 variants, then click <strong>Create Pack</strong> to bundle them.
          </div>
          <PackProductsTab listings={listings} onCreatePack={openCreate} resetSignal={packCreateResetSignal} />
        </TabsContent>

        {/* ── New Packs ───────────────────────────────────────────────────── */}
        <TabsContent value="packs" className="mt-4">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">Active packs visible in the marketplace. Click a card to manage it.</p>
            <Button size="sm" variant="outline" onClick={() => openCreate([])}>
              <Plus className="w-4 h-4 mr-1.5" />Create Pack
            </Button>
          </div>

          {activePacks.length > 0 && (
            <div className="space-y-2 mb-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search packs…"
                  value={packsSearch}
                  onChange={e => setPacksSearch(e.target.value)}
                  data-testid="input-new-packs-search"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {packsCategories.length > 0 && (
                  <Select value={packsFilterCategory} onValueChange={setPacksFilterCategory}>
                    <SelectTrigger className="h-8 text-xs" data-testid="filter-new-packs-category">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All categories</SelectItem>
                      {packsCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {packsSubCategories.length > 0 && (
                  <Select value={packsFilterSubCategory} onValueChange={setPacksFilterSubCategory}>
                    <SelectTrigger className="h-8 text-xs" data-testid="filter-new-packs-subcategory">
                      <SelectValue placeholder="Sub Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All sub-categories</SelectItem>
                      {packsSubCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {packsBrands.length > 0 && (
                  <Select value={packsFilterBrand} onValueChange={setPacksFilterBrand}>
                    <SelectTrigger className="h-8 text-xs" data-testid="filter-new-packs-brand">
                      <SelectValue placeholder="Brand" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All brands</SelectItem>
                      {packsBrands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {packsFlavors.length > 0 && (
                  <Select value={packsFilterFlavor} onValueChange={setPacksFilterFlavor}>
                    <SelectTrigger className="h-8 text-xs" data-testid="filter-new-packs-flavor">
                      <SelectValue placeholder="Flavor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All flavors</SelectItem>
                      {packsFlavors.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {packsSizes.length > 0 && (
                  <Select value={packsFilterSize} onValueChange={setPacksFilterSize}>
                    <SelectTrigger className="h-8 text-xs" data-testid="filter-new-packs-size">
                      <SelectValue placeholder="Size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All sizes</SelectItem>
                      {packsSizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {packsHasActiveFilters && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs px-2 text-muted-foreground" onClick={() => { setPacksFilterCategory("__all__"); setPacksFilterSubCategory("__all__"); setPacksFilterBrand("__all__"); setPacksFilterFlavor("__all__"); setPacksFilterSize("__all__"); }}>
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
          )}

          {activePacks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No active packs yet. Select variants in the <strong>Pack Products</strong> tab to get started.</p>
              </CardContent>
            </Card>
          ) : filteredActivePacks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packs match your filters.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredActivePacks.map(pack => (
                <ActivePackCard
                  key={pack.id}
                  pack={pack}
                  onPreview={() => setPreviewPackId(pack.id)}
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
                placeholder="Search old packs…"
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
                    onEdit={() => openEdit(pack)}
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
          onCreated={() => setPackCreateResetSignal(t => t + 1)}
        />
      )}

      {/* Pack Preview Modal — central place to manage a pack */}
      <PackPreviewModal
        pack={livePreviewPack}
        open={livePreviewPack !== null}
        onClose={() => setPreviewPackId(null)}
        onEdit={() => livePreviewPack && openEdit(livePreviewPack)}
        onToggleVisibility={() => livePreviewPack && toggleVisibility.mutate(livePreviewPack)}
        onDuplicate={() => livePreviewPack && duplicate.mutate(livePreviewPack.id)}
        onArchive={() => livePreviewPack && archive.mutate(livePreviewPack)}
        onDelete={() => livePreviewPack && remove.mutate(livePreviewPack.id)}
      />
    </div>
  );
}
