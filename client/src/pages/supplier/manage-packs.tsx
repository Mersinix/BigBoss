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
import { Plus, Package, Pencil, Trash2, Copy, Eye, EyeOff, Layers, ImageOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/format";
import type { SupplierListingWithProduct, PackDetail } from "@shared/schema";

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

function PackFormModal({ open, onClose, editing, listings }: {
  open: boolean; onClose: () => void; editing: PackDetail | null; listings: SupplierListingWithProduct[];
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
    editing ? editing.items.map(i => ({ listingId: i.listingId, variantId: i.variantId, quantity: i.quantity })) : []
  );

  const usableListings = useMemo(() => listings.filter(l => (l.variants ?? []).some(v => v.price > 0 && v.quantity > 0) || (l.price > 0 && l.stock > 0)), [listings]);

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

  const canSave = name.trim().length > 0 && items.length > 0 && parseFloat(price) >= 0 && parseInt(quantityAvailable) >= 0;

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
              <Label className="mb-2 block">Select products to include</Label>
              <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                {usableListings.length === 0 && (
                  <p className="text-sm text-muted-foreground p-3">Add products to "My Products" or "My Pack" first — they'll show up here.</p>
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

export function PackTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: listings = [], isLoading: loadingListings } = usePackListings();
  const { data: packRows = [], isLoading: loadingPacks } = usePacks();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PackDetail | null>(null);

  const activePacks = packRows.filter(p => !p.isArchived);
  const archivedPacks = packRows.filter(p => p.isArchived);

  const toggleVisibility = useMutation({
    mutationFn: (p: PackDetail) => apiRequest("PATCH", `/api/supplier/packs/${p.id}`, { visibility: p.visibility === "VISIBLE" ? "HIDDEN" : "VISIBLE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] }),
  });

  const archive = useMutation({
    mutationFn: (p: PackDetail) => apiRequest("PATCH", `/api/supplier/packs/${p.id}`, { isArchived: !p.isArchived }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] }); toast({ title: "Pack updated" }); },
  });

  const duplicate = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/supplier/packs/${id}/duplicate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] }); toast({ title: "Pack duplicated" }); },
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/supplier/packs/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] }); toast({ title: "Pack deleted" }); },
  });

  if (loadingListings || loadingPacks) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  const renderPackCard = (pack: PackDetail) => (
    <Card key={pack.id} className="overflow-hidden" data-testid={`card-pack-${pack.id}`}>
      <CardContent className="p-4 flex gap-4">
        <div className="w-20 h-20 rounded-lg bg-secondary flex items-center justify-center overflow-hidden shrink-0">
          {pack.imageUrl ? <img src={pack.imageUrl} className="w-full h-full object-cover" /> : <Layers className="w-6 h-6 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold truncate">{pack.name}</p>
            <Badge variant={pack.visibility === "VISIBLE" ? "default" : "secondary"} className="text-xs">{pack.visibility}</Badge>
            {pack.isExpired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
            {!pack.isAvailable && !pack.isExpired && <Badge variant="outline" className="text-xs">Out of stock</Badge>}
          </div>
          <p className="text-sm text-muted-foreground truncate">{pack.items.length} item{pack.items.length !== 1 ? "s" : ""} · {formatCurrency(pack.price)} · {Math.min(pack.quantityAvailable, pack.maxBuildable)} available</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {pack.categoryLabels.map(c => <Badge key={c.id} variant="secondary" className="text-xs">{c.name}</Badge>)}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Button size="sm" variant="outline" onClick={() => { setEditing(pack); setModalOpen(true); }} data-testid={`button-edit-pack-${pack.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={() => toggleVisibility.mutate(pack)} data-testid={`button-toggle-visibility-pack-${pack.id}`}>{pack.visibility === "VISIBLE" ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</Button>
          <Button size="sm" variant="outline" onClick={() => duplicate.mutate(pack.id)} data-testid={`button-duplicate-pack-${pack.id}`}><Copy className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={() => archive.mutate(pack)} data-testid={`button-archive-pack-${pack.id}`}>{pack.isArchived ? "Unarchive" : "Archive"}</Button>
          <Button size="sm" variant="destructive" onClick={() => { if (confirm("Delete this pack?")) remove.mutate(pack.id); }} data-testid={`button-delete-pack-${pack.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Bundle your existing products into a sellable Pack with its own price and stock.</p>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} data-testid="button-create-pack"><Plus className="w-4 h-4 mr-1.5" />Create Pack</Button>
      </div>

      {activePacks.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No packs yet. Create one from your existing products.</CardContent></Card>
      ) : (
        <div className="space-y-3">{activePacks.map(renderPackCard)}</div>
      )}

      {archivedPacks.length > 0 && (
        <div className="pt-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">Archived</p>
          <div className="space-y-3 opacity-70">{archivedPacks.map(renderPackCard)}</div>
        </div>
      )}

      {modalOpen && (
        <PackFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} editing={editing} listings={listings} />
      )}
    </div>
  );
}
