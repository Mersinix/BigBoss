import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Store, Package, Check, X, Pause, Trash2, Eye, EyeOff, Search,
  GripVertical, Star, RefreshCw, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { StoreAdminRow, StoreDetail } from "@shared/schema";

// ── Approval badge ─────────────────────────────────────────────────────────────

function ApprovalBadge({ status }: { status: string }) {
  if (status === "PENDING") return <Badge className="bg-amber-400 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0 text-xs">Pending</Badge>;
  if (status === "APPROVED") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0 text-xs">Approved</Badge>;
  if (status === "REJECTED") return <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-0 text-xs">Rejected</Badge>;
  if (status === "ON_HOLD") return <Badge className="bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-0 text-xs">On Hold</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

// ── Store Detail Dialog (with all actions) ────────────────────────────────────

function StoreDetailDialog({
  store,
  onClose,
}: {
  store: StoreAdminRow | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: detail, isLoading } = useQuery<StoreDetail>({
    queryKey: ["/api/admin/stores", store?.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/stores/${store!.id}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: store !== null,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ action }: { action: "approve" | "reject" | "hold" | "delete" }) => {
      if (action === "delete") return apiRequest("DELETE", `/api/admin/stores/${store!.id}`);
      return apiRequest("PATCH", `/api/admin/stores/${store!.id}/${action}`);
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      toast({ title: action === "delete" ? "Store deleted" : "Store updated" });
      if (action === "delete") onClose();
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });

  const autoApproveMutation = useMutation({
    mutationFn: async (autoApprove: boolean) =>
      apiRequest("PATCH", `/api/admin/stores/${store!.id}/auto-approve`, { autoApprove }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      toast({ title: "Auto Approve updated" });
    },
    onError: () => toast({ title: "Failed to update Auto Approve", variant: "destructive" }),
  });

  const coverUrls = detail
    ? (detail.coverUrls?.length ? detail.coverUrls : detail.coverUrl ? [detail.coverUrl] : [])
    : [];
  const coverImg = coverUrls[0] ?? null;

  const currentAutoApprove = store?.autoApprove ?? false;

  return (
    <Dialog open={store !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" />Store Details
          </DialogTitle>
        </DialogHeader>

        {isLoading || !detail || !store ? (
          <div className="space-y-3">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Cover */}
            {coverImg && (
              <img src={coverImg} alt="Cover" className="w-full h-36 object-cover rounded-xl" />
            )}

            {/* Logo + Name */}
            <div className="flex items-center gap-3">
              {store.logoUrl ? (
                <img src={store.logoUrl} alt="Logo" className="w-11 h-11 rounded-full object-cover border" />
              ) : (
                <div className="w-11 h-11 rounded-full border flex items-center justify-center bg-muted">
                  <Store className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-semibold">{store.name || "Untitled Store"}</p>
                <p className="text-xs text-muted-foreground">
                  {store.supplierName} · {store.supplierEmail}
                </p>
              </div>
            </div>

            {/* Status row */}
            <div className="flex items-center gap-2 flex-wrap">
              <ApprovalBadge status={store.approvalStatus} />
              {store.visibility === "VISIBLE" ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <Eye className="w-3.5 h-3.5" />Visible
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <EyeOff className="w-3.5 h-3.5" />Hidden
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Package className="w-3.5 h-3.5" />{store.productCount} products
              </span>
            </div>

            {/* Description */}
            {detail.description && (
              <p className="text-sm text-muted-foreground">{detail.description}</p>
            )}

            {/* Auto Approve toggle */}
            <div className="flex items-center justify-between rounded-xl border p-3 bg-muted/30">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />Auto Approve
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, this supplier can update their store without requiring future admin approval.
                </p>
              </div>
              <Switch
                checked={currentAutoApprove}
                onCheckedChange={(v) => autoApproveMutation.mutate(v)}
                disabled={autoApproveMutation.isPending}
                data-testid={`switch-auto-approve-${store.id}`}
              />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              {store.approvalStatus !== "APPROVED" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  onClick={() => actionMutation.mutate({ action: "approve" })}
                  disabled={actionMutation.isPending}
                  data-testid={`button-approve-store-${store.id}`}
                >
                  {actionMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                  Approve
                </Button>
              )}
              {store.approvalStatus !== "REJECTED" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => actionMutation.mutate({ action: "reject" })}
                  disabled={actionMutation.isPending}
                  data-testid={`button-reject-store-${store.id}`}
                >
                  <X className="w-3 h-3 mr-1" />Reject
                </Button>
              )}
              {store.approvalStatus !== "ON_HOLD" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => actionMutation.mutate({ action: "hold" })}
                  disabled={actionMutation.isPending}
                  data-testid={`button-hold-store-${store.id}`}
                >
                  <Pause className="w-3 h-3 mr-1" />Hold
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive ml-auto"
                onClick={() => actionMutation.mutate({ action: "delete" })}
                disabled={actionMutation.isPending}
                data-testid={`button-delete-store-${store.id}`}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />Delete
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Store card (draggable) ────────────────────────────────────────────────────

function StoreCard({
  store,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  store: StoreAdminRow;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const coverUrls = store.coverUrls?.length ? store.coverUrls : store.coverUrl ? [store.coverUrl] : [];
  const coverImg = coverUrls[0] ?? null;

  const borderColor =
    store.approvalStatus === "APPROVED"
      ? "border-emerald-400"
      : store.approvalStatus === "ON_HOLD"
      ? "border-red-400"
      : "border-border";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      className={`relative bg-card rounded-2xl border-2 ${borderColor} shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow group select-none`}
      data-testid={`card-store-${store.id}`}
    >
      {/* Visibility indicator dot — top right */}
      <div className="absolute top-2 right-2 z-10">
        <span
          className={`w-2.5 h-2.5 rounded-full block shadow-sm border border-white/60 ${
            store.visibility === "VISIBLE" ? "bg-emerald-500" : "bg-gray-400"
          }`}
          title={store.visibility === "VISIBLE" ? "Visible" : "Hidden"}
        />
      </div>

      {/* Drag handle — top left */}
      <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
        <div className="w-6 h-6 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center">
          <GripVertical className="w-3.5 h-3.5 text-white" />
        </div>
      </div>

      {/* Cover image */}
      <div className="aspect-[16/9] bg-muted overflow-hidden">
        {coverImg ? (
          <img src={coverImg} alt={store.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Store className="w-10 h-10 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-3 flex gap-3">
        {/* Logo */}
        <div className="w-10 h-10 rounded-full border-2 border-background -mt-6 bg-background shadow-sm overflow-hidden shrink-0 flex items-center justify-center">
          {store.logoUrl ? (
            <img src={store.logoUrl} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            <Store className="w-4 h-4 text-muted-foreground" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 mt-0.5">
          <p className="font-semibold text-sm truncate leading-tight">
            {store.name || "Untitled Store"}
          </p>
          <p className="text-xs text-muted-foreground truncate">{store.supplierName}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <ApprovalBadge status={store.approvalStatus} />
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Package className="w-3 h-3" />{store.productCount}
            </span>
            {store.autoApprove && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600">
                <Zap className="w-3 h-3" />Auto
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminStoresPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stores = [], isLoading } = useQuery<StoreAdminRow[]>({
    queryKey: ["/api/admin/stores"],
  });

  // Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<string>("ALL");

  // Detail modal
  const [selectedStore, setSelectedStore] = useState<StoreAdminRow | null>(null);

  // Drag-and-drop state
  const [orderedIds, setOrderedIds] = useState<number[] | null>(null);
  const dragIdRef = useRef<number | null>(null);

  const bulkOrderMutation = useMutation({
    mutationFn: async (orders: { id: number; displayOrder: number }[]) =>
      apiRequest("PATCH", "/api/admin/stores/bulk-order", { orders }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      toast({ title: "Store order saved" });
    },
    onError: () => toast({ title: "Failed to save order", variant: "destructive" }),
  });

  // Use orderedIds when available (after drag), otherwise fall back to server order
  const sortedStores = orderedIds
    ? [...stores].sort(
        (a, b) => (orderedIds.indexOf(a.id) ?? 9999) - (orderedIds.indexOf(b.id) ?? 9999),
      )
    : [...stores].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  // Apply filters
  const filtered = sortedStores.filter((s) => {
    if (statusFilter !== "ALL" && s.approvalStatus !== statusFilter) return false;
    if (visibilityFilter !== "ALL" && s.visibility !== visibilityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !s.name?.toLowerCase().includes(q) &&
        !s.supplierName?.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, id: number) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    const fromId = dragIdRef.current;
    if (fromId === null || fromId === targetId) return;

    const base = orderedIds ?? sortedStores.map((s) => s.id);
    const from = base.indexOf(fromId);
    const to = base.indexOf(targetId);
    if (from === -1 || to === -1) return;

    const next = [...base];
    next.splice(from, 1);
    next.splice(to, 0, fromId);
    setOrderedIds(next);

    // Persist
    const orders = next.map((id, idx) => ({ id, displayOrder: idx }));
    bulkOrderMutation.mutate(orders);

    dragIdRef.current = null;
  };

  const pendingCount = stores.filter((s) => s.approvalStatus === "PENDING").length;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Store className="w-6 h-6 text-primary" />Stores
          {pendingCount > 0 && (
            <Badge className="bg-amber-500 text-white border-0 text-xs ml-1">{pendingCount} pending</Badge>
          )}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage supplier stores. Drag cards to reorder — order saves automatically.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stores or suppliers…"
            className="pl-9 h-9"
            data-testid="input-store-search"
          />
        </div>

        {/* Status filter */}
        <div className="inline-flex rounded-lg border p-1 bg-muted/40 text-sm">
          {["ALL", "PENDING", "APPROVED", "REJECTED", "ON_HOLD"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                statusFilter === s ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`filter-status-${s.toLowerCase()}`}
            >
              {s === "ALL" ? "All" : s === "ON_HOLD" ? "On Hold" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Visibility filter */}
        <div className="inline-flex rounded-lg border p-1 bg-muted/40 text-sm">
          {["ALL", "VISIBLE", "HIDDEN"].map((v) => (
            <button
              key={v}
              onClick={() => setVisibilityFilter(v)}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                visibilityFilter === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`filter-visibility-${v.toLowerCase()}`}
            >
              {v === "ALL" ? "All" : v.charAt(0) + v.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {bulkOrderMutation.isPending && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />Saving order…
          </span>
        )}
      </div>

      {/* Store grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Store className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No stores found</p>
          <p className="text-sm mt-1">Try adjusting the filters or search query.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              onSelect={() => setSelectedStore(store)}
              onDragStart={(e) => handleDragStart(e, store.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, store.id)}
            />
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <StoreDetailDialog
        store={selectedStore}
        onClose={() => setSelectedStore(null)}
      />
    </div>
  );
}
