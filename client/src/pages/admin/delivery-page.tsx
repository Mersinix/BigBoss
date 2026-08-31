import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDeliveries, useUpdateDeliveryStatus } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, Clock, CheckCircle, XCircle, Search, Building2, Store } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DeliveryDetails, { DELIVERY_STATUS_META as STATUS_META, DELIVERY_MODE_LABEL } from "@/components/delivery/delivery-details";
import type { DeliveryWithDetails, User } from "@shared/schema";

// ── Entreprises + Chauffeurs / Chauffeurs fournisseurs tabs (task Part 37/39/40) — built
// entirely from the same real /api/admin/users + /api/deliveries data the rest of Admin
// already reads. No duplicate driver/company dataset. ──────────────────────────────────

function CompanyDriversTab({ users, deliveries }: { users: User[]; deliveries: DeliveryWithDetails[] }) {
  const [search, setSearch] = useState("");
  const companies = users.filter((u) => u.role === "DELIVERY_COMPANY");
  const drivers = users.filter((u) => u.role === "DRIVER" && u.deliveryCompanyId);

  const rows = useMemo(() => companies
    .map((c) => {
      const ownDrivers = drivers.filter((d) => d.deliveryCompanyId === c.id);
      const ownDeliveries = deliveries.filter((d) => d.deliveryCompanyId === c.id);
      const active = ownDeliveries.filter((d) => ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(d.status)).length;
      const completed = ownDeliveries.filter((d) => d.status === "DELIVERED").length;
      return { company: c, ownDrivers, active, completed, total: ownDeliveries.length };
    })
    .filter((r) => !search || r.company.name.toLowerCase().includes(search.toLowerCase()))
  , [companies, drivers, deliveries, search]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une entreprise…" data-testid="input-search-companies" />
      </div>
      {rows.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Aucune entreprise de livraison.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {rows.map(({ company, ownDrivers, active, completed, total }) => (
            <Card key={company.id} data-testid={`card-admin-company-${company.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-600" />{company.name}</CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="outline">{company.status}</Badge>
                    <Badge variant="secondary">{ownDrivers.length} chauffeur(s)</Badge>
                    <Badge variant="secondary">{active} en cours</Badge>
                    <Badge variant="secondary">{completed}/{total} livrée(s)</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {ownDrivers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun chauffeur.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {ownDrivers.map((d) => {
                      const driverActive = deliveries.filter((del) => del.driverId === d.id && ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(del.status)).length;
                      const driverCompleted = deliveries.filter((del) => del.driverId === d.id && del.status === "DELIVERED").length;
                      return (
                        <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border p-2.5 text-sm" data-testid={`row-admin-driver-${d.id}`}>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{d.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{d.phone || "—"}</p>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 text-[10px] text-muted-foreground shrink-0">
                            <span className={`h-2 w-2 rounded-full ${driverActive > 0 ? "bg-amber-500" : "bg-green-500"}`} />
                            <span>{driverActive} en cours</span>
                            <span>{driverCompleted} livrée(s)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierDriversTab({ users, deliveries }: { users: User[]; deliveries: DeliveryWithDetails[] }) {
  const [search, setSearch] = useState("");
  const suppliers = users.filter((u) => u.role === "SUPPLIER");
  const drivers = users.filter((u) => u.role === "DRIVER" && u.supplierId);
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

  const rows = useMemo(() => drivers
    .map((d) => {
      const own = deliveries.filter((del) => del.driverId === d.id);
      return {
        driver: d,
        supplierName: supplierMap.get(d.supplierId!)?.name ?? "—",
        active: own.filter((del) => ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(del.status)).length,
        completed: own.filter((del) => del.status === "DELIVERED").length,
      };
    })
    .filter((r) => !search || `${r.driver.name} ${r.supplierName}`.toLowerCase().includes(search.toLowerCase()))
  , [drivers, deliveries, supplierMap, search]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un chauffeur, un fournisseur…" data-testid="input-search-supplier-drivers" />
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {rows.length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucun chauffeur fournisseur.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chauffeur</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>En cours</TableHead>
                  <TableHead>Terminées</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ driver, supplierName, active, completed }) => (
                  <TableRow key={driver.id} data-testid={`row-admin-supplier-driver-${driver.id}`}>
                    <TableCell className="font-medium">{driver.name}</TableCell>
                    <TableCell className="flex items-center gap-1.5"><Store className="w-3.5 h-3.5 text-muted-foreground" />{supplierName}</TableCell>
                    <TableCell><Badge variant="outline">{driver.status}</Badge></TableCell>
                    <TableCell>{active}</TableCell>
                    <TableCell>{completed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Admin oversight only — no operational actions beyond CANCEL. Status is managed through
// /api/deliveries/* by the owning Delivery Company / assigned Driver / operating Supplier;
// this page used to call PATCH /api/orders/:id/status directly, which always 403'd for Admin
// (see SHOP_DELIVERY_SYNCHRONIZATION_ANALYSIS.md §9.5) — replaced with the real delivery API.
export default function DeliveryPage() {
  const { data: deliveries = [], isLoading } = useDeliveries();
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/admin/users"] });
  const updateStatus = useUpdateDeliveryStatus();
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const [viewTarget, setViewTarget] = useState<DeliveryWithDetails | null>(null);
  const [tab, setTab] = useState("deliveries");

  const inTransit = deliveries.filter((d) => ["PICKED_UP", "IN_TRANSIT"].includes(d.status)).length;
  const delivered = deliveries.filter((d) => d.status === "DELIVERED").length;
  const unassigned = deliveries.filter((d) => ["AVAILABLE", "ACCEPTED"].includes(d.status)).length;

  const handleCancel = (id: number) => {
    updateStatus.mutate({ deliveryId: id, status: "CANCELLED" }, {
      onSuccess: () => toast({ title: "Livraison annulée" }),
      onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Livraisons</h1>
        <p className="text-muted-foreground text-sm mt-1">Supervision de toutes les livraisons de la plateforme.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-indigo-500/10 rounded-xl p-3"><Truck className="w-5 h-5 text-indigo-600" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">En transit</p><p className="text-2xl font-bold">{inTransit}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">Non assignées</p><p className="text-2xl font-bold">{unassigned}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><CheckCircle className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">Livrées</p><p className="text-2xl font-bold">{delivered}</p></div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="deliveries" data-testid="tab-admin-delivery-livraisons">Livraisons</TabsTrigger>
          <TabsTrigger value="companies" data-testid="tab-admin-delivery-companies">Entreprises + Chauffeurs</TabsTrigger>
          <TabsTrigger value="supplier-drivers" data-testid="tab-admin-delivery-supplier-drivers">Chauffeurs fournisseurs</TabsTrigger>
        </TabsList>

        {tab === "deliveries" && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Toutes les livraisons</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Commande</TableHead>
                        <TableHead>Café</TableHead>
                        <TableHead>Fournisseur</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Transporteur</TableHead>
                        <TableHead>Chauffeur</TableHead>
                        <TableHead>Véhicule</TableHead>
                        <TableHead>Frais</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Créée le</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveries.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">#{d.orderId}</TableCell>
                          <TableCell>{d.cafe.name}</TableCell>
                          <TableCell>{d.supplier.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.deliveryMode ? DELIVERY_MODE_LABEL[d.deliveryMode] : "—"}</TableCell>
                          <TableCell>{d.deliveryCompany?.name ?? "—"}</TableCell>
                          <TableCell>{d.driver?.name ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.vehicleType ?? "—"}</TableCell>
                          <TableCell>{fmt(d.deliveryFee ?? 0)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_META[d.status]?.cls ?? ""}>
                              {STATUS_META[d.status]?.label ?? d.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(d.createdAt as any)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setViewTarget(d)}>Détails</Button>
                              {!["DELIVERED", "CANCELLED"].includes(d.status) && d.status !== "PICKED_UP" && d.status !== "IN_TRANSIT" && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => handleCancel(d.id)}>
                                  <XCircle className="w-3.5 h-3.5 mr-1" /> Annuler
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {deliveries.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center text-muted-foreground py-10">Aucune livraison</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "companies" && <div className="mt-4"><CompanyDriversTab users={users} deliveries={deliveries} /></div>}
        {tab === "supplier-drivers" && <div className="mt-4"><SupplierDriversTab users={users} deliveries={deliveries} /></div>}
      </Tabs>

      <Dialog open={!!viewTarget} onOpenChange={(v) => { if (!v) setViewTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Détails de la livraison</DialogTitle></DialogHeader>
          {viewTarget && <DeliveryDetails delivery={viewTarget} viewerRole="ADMIN" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
