import { useEffect, useState } from "react";
import { useSupplierCafes, useCreateSupplierCafe, type SupplierCafe } from "@/hooks/use-supplier-cafes";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import { getAvatarUrl } from "@/lib/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Coffee, Plus, Search, MapPin, Phone, Mail, ShoppingBag, Wallet, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

function AddCafeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const createCafe = useCreateSupplierCafe();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", isWhatsapp: false, profileImageUrl: "" });

  const reset = () => setForm({ name: "", email: "", password: "", phone: "", isWhatsapp: false, profileImageUrl: "" });

  const handleCreate = () => {
    createCafe.mutate(
      { name: form.name, email: form.email, password: form.password, phone: form.phone || null, isWhatsapp: form.isWhatsapp, profileImageUrl: form.profileImageUrl.trim() || null },
      {
        onSuccess: () => { toast({ title: "Café ajouté" }); reset(); onClose(); },
        onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ajouter un café</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Nom du café" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="input-new-cafe-name" />
          <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} data-testid="input-new-cafe-email" />
          <Input placeholder="Mot de passe (min. 6 caractères)" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} data-testid="input-new-cafe-password" />
          <div className="flex items-center gap-2">
            <Input placeholder="Téléphone (optionnel)" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} data-testid="input-new-cafe-phone" />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none shrink-0">
              <input type="checkbox" className="w-3.5 h-3.5 rounded border-border/50 accent-primary" checked={form.isWhatsapp} onChange={(e) => setForm((f) => ({ ...f, isWhatsapp: e.target.checked }))} />
              WhatsApp
            </label>
          </div>
          <Input placeholder="Photo de profil — URL (optionnel)" value={form.profileImageUrl} onChange={(e) => setForm((f) => ({ ...f, profileImageUrl: e.target.value }))} data-testid="input-new-cafe-picture" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Annuler</Button>
          <Button
            onClick={handleCreate}
            disabled={!form.name || !form.email || form.password.length < 6 || createCafe.isPending}
            data-testid="button-submit-new-cafe"
          >
            {createCafe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CafeDetailModal({ cafe, onClose }: { cafe: SupplierCafe | null; onClose: () => void }) {
  const fmt = useFormatCurrency();
  return (
    <Dialog open={cafe !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-primary" />Détails du café
          </DialogTitle>
        </DialogHeader>
        {cafe && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="w-12 h-12">
                <AvatarImage src={getAvatarUrl(cafe as any)} alt={cafe.name} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">{cafe.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{cafe.name}</p>
                {cafe.referred && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Sparkles className="w-3 h-3" />Ajouté par vous</span>
                )}
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-muted-foreground"><Mail className="w-3.5 h-3.5" />{cafe.email}</p>
              {cafe.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="w-3.5 h-3.5" />{cafe.phone}</p>}
              {cafe.locationAddress && <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="w-3.5 h-3.5" />{cafe.locationAddress}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Commandes</p>
                <p className="font-bold text-lg">{cafe.orderCount}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Total dépensé</p>
                <p className="font-bold text-lg text-amber-500">{fmt(cafe.totalSpent)}</p>
              </div>
            </div>
            {cafe.lastOrderAt && (
              <p className="text-xs text-muted-foreground">Dernière commande le {formatDate(cafe.lastOrderAt)}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function CafesPage() {
  const { data: cafes = [], isLoading } = useSupplierCafes();
  const fmt = useFormatCurrency();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<SupplierCafe | null>(null);

  const filtered = cafes.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  const pagination = usePagination(filtered.length);
  useEffect(() => { pagination.resetPage(); }, [search]);
  const pageCafes = filtered.slice(pagination.start, pagination.end);

  const totalOrders = cafes.reduce((s, c) => s + c.orderCount, 0);
  const totalSpent = cafes.reduce((s, c) => s + c.totalSpent, 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <DashboardHero
        title="Cafes"
        subtitle="Vos cafés clients et leur activité."
        action={<Button onClick={() => setAddOpen(true)} className="gap-1.5" data-testid="button-add-cafe"><Plus className="w-4 h-4" />Ajouter un café</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><Coffee className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Cafés</p><p className="text-2xl font-bold">{cafes.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-indigo-500/10 rounded-xl p-3"><ShoppingBag className="w-5 h-5 text-indigo-600" /></div>
            <div><p className="text-xs text-muted-foreground">Commandes totales</p><p className="text-2xl font-bold">{totalOrders}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><Wallet className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">Chiffre d'affaires</p><p className="text-2xl font-bold text-green-600">{fmt(totalSpent)}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un café…" className="pl-9" data-testid="input-cafe-search" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          {cafes.length === 0 ? "Aucun café pour le moment. Les cafés qui commandent chez vous apparaîtront ici, ou ajoutez-en un directement." : "Aucun café ne correspond à cette recherche."}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pageCafes.map((c) => (
            <Card key={c.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelected(c)} data-testid={`card-cafe-${c.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar className="w-10 h-10 shrink-0">
                    <AvatarImage src={getAvatarUrl(c as any)} alt={c.name} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">{c.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm truncate">{c.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                  </div>
                  {c.referred && <Badge variant="secondary" className="text-[10px] shrink-0">Ajouté</Badge>}
                </div>
                {c.locationAddress && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground truncate"><MapPin className="w-3 h-3 shrink-0" />{c.locationAddress}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Commandes</p>
                    <p className="font-bold text-sm">{c.orderCount}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Dépensé</p>
                    <p className="font-bold text-sm text-amber-500">{fmt(c.totalSpent)}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); setSelected(c); }} data-testid={`button-view-cafe-${c.id}`}>
                  Voir détails
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && (
        <DataPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={filtered.length}
          totalPages={pagination.totalPages}
          start={pagination.start}
          end={pagination.end}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemLabel="cafés"
        />
      )}

      <AddCafeModal open={addOpen} onClose={() => setAddOpen(false)} />
      <CafeDetailModal cafe={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
