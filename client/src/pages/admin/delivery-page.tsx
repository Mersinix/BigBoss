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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Truck, Clock, CheckCircle, XCircle, Search, Building2, Store,
  Package, User as UserIcon, Receipt, Calendar, Coffee,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DeliveryDetails, { DELIVERY_STATUS_META as STATUS_META, DELIVERY_MODE_LABEL } from "@/components/delivery/delivery-details";
import { DriverDetailModal } from "@/components/driver/driver-detail-modal";
import { DeliveryCompanyDetailModal } from "@/components/delivery/delivery-company-detail-modal";
import { SupplierDriverFleetModal } from "@/components/delivery/supplier-driver-fleet-modal";
import { VEHICLE_TYPE_LABELS, type DeliveryVehicleType } from "@/hooks/use-delivery-ecosystem";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { resolveDateRange, type DateRangePreset } from "@/lib/marketplace-analytics";
import type { DeliveryWithDetails, User, DeliveryStatus, DeliveryMode } from "@shared/schema";

// ── Livraisons tab — mapped cards (replaces the previous raw <Table>) ────────────────────
// A compact summary of the same real per-delivery data DeliveryDetails (the "Détails" modal)
// already shows in full — same fields, same statuses, same real API data, no invented values.

function InfoTile({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function DeliveryCard({ delivery, onViewDetails, onCancel, cancelling }: {
  delivery: DeliveryWithDetails;
  onViewDetails: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const fmt = useFormatCurrency();
  const meta = STATUS_META[delivery.status] ?? { label: delivery.status, cls: "bg-gray-100 text-gray-700" };
  const canCancel = !["DELIVERED", "CANCELLED"].includes(delivery.status) && !["PICKED_UP", "IN_TRANSIT"].includes(delivery.status);

  return (
    <Card data-testid={`card-admin-delivery-${delivery.id}`}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold">#{delivery.orderId}</span>
          <Badge variant="secondary" className={meta.cls}>{meta.label}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <InfoTile icon={Coffee} label="Café" value={delivery.cafe.name} />
          <InfoTile icon={Store} label="Fournisseur" value={delivery.supplier.name} />
          <InfoTile icon={Truck} label="Transport" value={delivery.deliveryMode ? DELIVERY_MODE_LABEL[delivery.deliveryMode] : "—"} />
          <InfoTile icon={UserIcon} label="Chauffeur" value={delivery.driver?.name ?? "—"} />
          <InfoTile icon={Building2} label="Transporteur" value={delivery.deliveryCompany?.name ?? "—"} />
          <InfoTile icon={Package} label="Véhicule" value={delivery.vehicleType ? (VEHICLE_TYPE_LABELS[delivery.vehicleType as DeliveryVehicleType] ?? delivery.vehicleType) : "—"} />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <InfoTile icon={Receipt} label="Frais" value={fmt(delivery.deliveryFee ?? 0)} />
          <InfoTile icon={Calendar} label="Créée le" value={formatDate(delivery.createdAt as any)} />
        </div>

        <div className="flex items-center gap-2 justify-end">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onViewDetails} data-testid={`button-admin-delivery-details-${delivery.id}`}>Détails</Button>
          {canCancel && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={onCancel} disabled={cancelling} data-testid={`button-admin-delivery-cancel-${delivery.id}`}>
              <XCircle className="w-3.5 h-3.5 mr-1" /> Annuler
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const DELIVERY_STATUS_OPTIONS: DeliveryStatus[] = ["PENDING", "AVAILABLE", "ACCEPTED", "ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
const DELIVERY_MODE_OPTIONS: DeliveryMode[] = ["DELIVERY_COMPANY", "SUPPLIER"];

function DeliveriesTab({ deliveries, isLoading, onViewDetails, onCancel, cancelling }: {
  deliveries: DeliveryWithDetails[];
  isLoading: boolean;
  onViewDetails: (d: DeliveryWithDetails) => void;
  onCancel: (id: number) => void;
  cancelling: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DeliveryStatus | "ALL">("ALL");
  const [vehicleType, setVehicleType] = useState<DeliveryVehicleType | "ALL">("ALL");
  const [mode, setMode] = useState<DeliveryMode | "ALL">("ALL");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [dateCustom, setDateCustom] = useState({ from: "", to: "" });

  // Only offer vehicle types that actually appear on at least one real delivery — never a
  // hardcoded/unsupported mode.
  const availableVehicleTypes = useMemo(
    () => Array.from(new Set(deliveries.map((d) => d.vehicleType).filter(Boolean))) as DeliveryVehicleType[],
    [deliveries],
  );

  const range = useMemo(() => resolveDateRange(datePreset, dateCustom), [datePreset, dateCustom]);

  const filtered = useMemo(() => deliveries.filter((d) => {
    if (status !== "ALL" && d.status !== status) return false;
    if (vehicleType !== "ALL" && d.vehicleType !== vehicleType) return false;
    if (mode !== "ALL" && d.deliveryMode !== mode) return false;
    if (range.from || range.to) {
      const created = d.createdAt ? new Date(d.createdAt as any) : null;
      if (!created) return false;
      if (range.from && created < range.from) return false;
      if (range.to && created > range.to) return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = [
        String(d.orderId), d.cafe.name, d.supplier.name,
        d.deliveryCompany?.name ?? "", d.driver?.name ?? "",
      ].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }), [deliveries, search, status, vehicleType, mode, range]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N° commande, café, fournisseur, transporteur, chauffeur…" data-testid="input-search-deliveries" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as DeliveryStatus | "ALL")}>
            <SelectTrigger className="w-40" data-testid="select-delivery-status"><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              {DELIVERY_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s]?.label ?? s}</SelectItem>)}
            </SelectContent>
          </Select>
          {availableVehicleTypes.length > 0 && (
            <Select value={vehicleType} onValueChange={(v) => setVehicleType(v as DeliveryVehicleType | "ALL")}>
              <SelectTrigger className="w-36" data-testid="select-delivery-vehicle"><SelectValue placeholder="Transport" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous véhicules</SelectItem>
                {availableVehicleTypes.map((v) => <SelectItem key={v} value={v}>{VEHICLE_TYPE_LABELS[v] ?? v}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={mode} onValueChange={(v) => setMode(v as DeliveryMode | "ALL")}>
            <SelectTrigger className="w-44" data-testid="select-delivery-transporter-type"><SelectValue placeholder="Transporteur" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous transporteurs</SelectItem>
              {DELIVERY_MODE_OPTIONS.map((m) => <SelectItem key={m} value={m}>{DELIVERY_MODE_LABEL[m]}</SelectItem>)}
            </SelectContent>
          </Select>
          <DateRangeFilter preset={datePreset} onPresetChange={setDatePreset} custom={dateCustom} onCustomChange={setDateCustom} />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Aucune livraison ne correspond à ces filtres.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <DeliveryCard key={d.id} delivery={d} onViewDetails={() => onViewDetails(d)} onCancel={() => onCancel(d.id)} cancelling={cancelling} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Entreprises + Chauffeurs / Chauffeurs fournisseurs tabs (task Part 37/39/40) — built
// entirely from the same real /api/admin/users + /api/deliveries data the rest of Admin
// already reads. No duplicate driver/company dataset. ──────────────────────────────────

const APPROVAL_STATUS_OPTIONS = ["approved", "pending", "rejected"] as const;

function CompanyDriversTab({ users, deliveries }: { users: User[]; deliveries: DeliveryWithDetails[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [activityFilter, setActivityFilter] = useState<"ALL" | "ACTIVE" | "IDLE">("ALL");
  const [driverFilter, setDriverFilter] = useState<"ALL" | "WITH" | "WITHOUT">("ALL");
  const [detail, setDetail] = useState<User | null>(null);
  const [companyDetailId, setCompanyDetailId] = useState<number | null>(null);
  const companies = users.filter((u) => u.role === "DELIVERY_COMPANY");
  const drivers = users.filter((u) => u.role === "DRIVER" && u.deliveryCompanyId);
  const driversById = new Map(drivers.map((d) => [d.id, d]));

  const rows = useMemo(() => companies
    .map((c) => {
      const ownDrivers = drivers.filter((d) => d.deliveryCompanyId === c.id);
      const ownDeliveries = deliveries.filter((d) => d.deliveryCompanyId === c.id);
      const active = ownDeliveries.filter((d) => ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(d.status)).length;
      const completed = ownDeliveries.filter((d) => d.status === "DELIVERED").length;
      return { company: c, ownDrivers, active, completed, total: ownDeliveries.length };
    })
    .filter((r) => !search || r.company.name.toLowerCase().includes(search.toLowerCase()))
    .filter((r) => statusFilter === "ALL" || r.company.status === statusFilter)
    .filter((r) => activityFilter === "ALL" || (activityFilter === "ACTIVE" ? r.active > 0 : r.active === 0))
    .filter((r) => driverFilter === "ALL" || (driverFilter === "WITH" ? r.ownDrivers.length > 0 : r.ownDrivers.length === 0))
  , [companies, drivers, deliveries, search, statusFilter, activityFilter, driverFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une entreprise…" data-testid="input-search-companies" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36" data-testid="select-company-status"><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous statuts</SelectItem>
              {APPROVAL_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={activityFilter} onValueChange={(v) => setActivityFilter(v as typeof activityFilter)}>
            <SelectTrigger className="w-52" data-testid="select-company-activity"><SelectValue placeholder="Activité" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toute activité</SelectItem>
              <SelectItem value="ACTIVE">Avec livraisons en cours</SelectItem>
              <SelectItem value="IDLE">Sans livraison en cours</SelectItem>
            </SelectContent>
          </Select>
          <Select value={driverFilter} onValueChange={(v) => setDriverFilter(v as typeof driverFilter)}>
            <SelectTrigger className="w-44" data-testid="select-company-drivers"><SelectValue placeholder="Chauffeurs" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous</SelectItem>
              <SelectItem value="WITH">Avec chauffeurs</SelectItem>
              <SelectItem value="WITHOUT">Sans chauffeurs</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {rows.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Aucune entreprise de livraison.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {rows.map(({ company, ownDrivers, active, completed, total }) => (
            <Card key={company.id} data-testid={`card-admin-company-${company.id}`}>
              <CardHeader
                className="pb-3 cursor-pointer hover:bg-muted/40 transition-colors rounded-t-xl"
                onClick={() => setCompanyDetailId(company.id)}
                data-testid={`button-open-admin-company-${company.id}`}
              >
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
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDetail(d)}
                          className="flex items-center justify-between gap-2 rounded-xl border p-2.5 text-sm text-left hover:border-primary hover:bg-primary/5 transition-colors"
                          data-testid={`row-admin-driver-${d.id}`}
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{d.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{d.phone || "—"}</p>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 text-[10px] text-muted-foreground shrink-0">
                            <span className={`h-2 w-2 rounded-full ${driverActive > 0 ? "bg-amber-500" : "bg-green-500"}`} />
                            <span>{driverActive} en cours</span>
                            <span>{driverCompleted} livrée(s)</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-end mt-3">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCompanyDetailId(company.id)} data-testid={`button-company-details-${company.id}`}>Voir les détails</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <DriverDetailModal driver={detail} open={detail != null} onClose={() => setDetail(null)} />
      {/* Clicking the company card header above opens this — same synchronized
          Delivery Company details modal used everywhere a company is shown (Eye
          preview, Supplier dispatch flow). Its own "Chauffeurs" list is clickable
          too (onOpenDriver), resolved here to the real User row already in `users`. */}
      <DeliveryCompanyDetailModal
        companyUserId={companyDetailId}
        open={companyDetailId != null}
        onClose={() => setCompanyDetailId(null)}
        onOpenDriver={(driverId) => { const d = driversById.get(driverId); if (d) { setCompanyDetailId(null); setDetail(d); } }}
        readOnly
      />
    </div>
  );
}

function SupplierDriversTab({ users, deliveries }: { users: User[]; deliveries: DeliveryWithDetails[] }) {
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<"ALL" | "ACTIVE" | "IDLE">("ALL");
  const [supplierFilter, setSupplierFilter] = useState<string>("ALL");
  const [detail, setDetail] = useState<User | null>(null);
  const [supplierDetailId, setSupplierDetailId] = useState<number | null>(null);
  const suppliers = users.filter((u) => u.role === "SUPPLIER");
  const drivers = users.filter((u) => u.role === "DRIVER" && u.supplierId);

  // Same "one card per operator, real drivers mapped inside" structure as
  // CompanyDriversTab above — grouped by supplier instead of delivery company.
  const rows = useMemo(() => suppliers
    .map((s) => {
      const ownDrivers = drivers.filter((d) => d.supplierId === s.id);
      const ownDeliveries = deliveries.filter((d) => ownDrivers.some((driver) => driver.id === d.driverId));
      const active = ownDeliveries.filter((d) => ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(d.status)).length;
      const completed = ownDeliveries.filter((d) => d.status === "DELIVERED").length;
      return { supplier: s, ownDrivers, active, completed, total: ownDeliveries.length };
    })
    .filter((r) => r.ownDrivers.length > 0)
    .filter((r) => !search || `${r.supplier.name} ${r.ownDrivers.map((d) => `${d.name} ${d.phone ?? ""}`).join(" ")}`.toLowerCase().includes(search.toLowerCase()))
    .filter((r) => activityFilter === "ALL" || (activityFilter === "ACTIVE" ? r.active > 0 : r.active === 0))
    .filter((r) => supplierFilter === "ALL" || String(r.supplier.id) === supplierFilter)
  , [suppliers, drivers, deliveries, search, activityFilter, supplierFilter]);

  // Only offered when there's genuinely more than one supplier with drivers to
  // choose between — otherwise it's a no-op dropdown (task's "do not create a
  // supplier filter if the current dataset does not provide the relationship").
  const supplierOptions = useMemo(
    () => suppliers.filter((s) => drivers.some((d) => d.supplierId === s.id)),
    [suppliers, drivers],
  );

  const selectedSupplier = rows.find((r) => r.supplier.id === supplierDetailId)?.supplier ?? null;
  const selectedSupplierDrivers = rows.find((r) => r.supplier.id === supplierDetailId)?.ownDrivers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un chauffeur, un fournisseur…" data-testid="input-search-supplier-drivers" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={activityFilter} onValueChange={(v) => setActivityFilter(v as typeof activityFilter)}>
            <SelectTrigger className="w-52" data-testid="select-supplier-driver-activity"><SelectValue placeholder="Activité" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toute activité</SelectItem>
              <SelectItem value="ACTIVE">En cours</SelectItem>
              <SelectItem value="IDLE">Disponible / inactif</SelectItem>
            </SelectContent>
          </Select>
          {supplierOptions.length > 1 && (
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-48" data-testid="select-supplier-filter"><SelectValue placeholder="Fournisseur" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous fournisseurs</SelectItem>
                {supplierOptions.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Aucun fournisseur avec des chauffeurs.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {rows.map(({ supplier, ownDrivers, active, completed, total }) => (
            <Card key={supplier.id} data-testid={`card-admin-supplier-${supplier.id}`}>
              <CardHeader
                className="pb-3 cursor-pointer hover:bg-muted/40 transition-colors rounded-t-xl"
                onClick={() => setSupplierDetailId(supplier.id)}
                data-testid={`button-open-admin-supplier-${supplier.id}`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2"><Store className="w-4 h-4 text-slate-600" />{supplier.name}</CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="outline">{supplier.status}</Badge>
                    <Badge variant="secondary">{ownDrivers.length} chauffeur(s)</Badge>
                    <Badge variant="secondary">{active} en cours</Badge>
                    <Badge variant="secondary">{completed}/{total} livrée(s)</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ownDrivers.map((d) => {
                    const driverActive = deliveries.filter((del) => del.driverId === d.id && ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(del.status)).length;
                    const driverCompleted = deliveries.filter((del) => del.driverId === d.id && del.status === "DELIVERED").length;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDetail(d)}
                        className="flex items-center justify-between gap-2 rounded-xl border p-2.5 text-sm text-left hover:border-primary hover:bg-primary/5 transition-colors"
                        data-testid={`row-admin-supplier-driver-${d.id}`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{d.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{d.phone || "—"}</p>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 text-[10px] text-muted-foreground shrink-0">
                          <span className={`h-2 w-2 rounded-full ${driverActive > 0 ? "bg-amber-500" : "bg-green-500"}`} />
                          <span>{driverActive} en cours</span>
                          <span>{driverCompleted} livrée(s)</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-end mt-3">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSupplierDetailId(supplier.id)} data-testid={`button-supplier-details-${supplier.id}`}>Voir les détails</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <DriverDetailModal driver={detail} open={detail != null} onClose={() => setDetail(null)} />
      <SupplierDriverFleetModal
        supplier={selectedSupplier}
        drivers={selectedSupplierDrivers}
        deliveries={deliveries}
        open={supplierDetailId != null}
        onClose={() => setSupplierDetailId(null)}
        onOpenDriver={(driverId) => {
          const d = selectedSupplierDrivers.find((driver) => driver.id === driverId);
          if (d) { setSupplierDetailId(null); setDetail(d); }
        }}
      />
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
          <div className="mt-4">
            <DeliveriesTab
              deliveries={deliveries}
              isLoading={isLoading}
              onViewDetails={setViewTarget}
              onCancel={handleCancel}
              cancelling={updateStatus.isPending}
            />
          </div>
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
