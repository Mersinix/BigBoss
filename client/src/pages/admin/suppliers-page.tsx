import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Store, Package, TrendingUp, Check, X, Pause, Trash2, Eye, EyeOff } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { User, StoreAdminRow, StoreDetail } from "@shared/schema";

function ApprovalBadge({ status }: { status: string }) {
  if (status === "PENDING") return <Badge className="bg-amber-400 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0 text-xs">Pending</Badge>;
  if (status === "APPROVED") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0 text-xs">Approved</Badge>;
  if (status === "REJECTED") return <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-0 text-xs">Rejected</Badge>;
  if (status === "ON_HOLD") return <Badge className="bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-0 text-xs">On Hold</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

function StoreDetailDialog({ storeId, onClose }: { storeId: number | null; onClose: () => void }) {
  const { data: detail, isLoading } = useQuery<StoreDetail>({
    queryKey: ["/api/admin/stores", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/stores/${storeId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: storeId !== null,
  });

  return (
    <Dialog open={storeId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Store className="w-5 h-5 text-primary" />Store Details</DialogTitle>
        </DialogHeader>
        {isLoading || !detail ? (
          <div className="space-y-3"><Skeleton className="h-32 w-full" /><Skeleton className="h-4 w-2/3" /></div>
        ) : (
          <div className="space-y-3">
            {detail.coverUrl && <img src={detail.coverUrl} alt="Cover" className="w-full h-32 object-cover rounded-xl" />}
            <div className="flex items-center gap-3">
              {detail.logoUrl && <img src={detail.logoUrl} alt="Logo" className="w-10 h-10 rounded-full object-cover border" />}
              <div>
                <p className="font-semibold">{detail.name || "Untitled Store"}</p>
                <p className="text-xs text-muted-foreground">{detail.isOpen ? "Open" : "Closed"} · {detail.visibility === "VISIBLE" ? "Visible" : "Hidden"}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{detail.description || "No description provided."}</p>
            <p className="text-sm"><span className="font-medium">{detail.products.length}</span> product{detail.products.length !== 1 ? "s" : ""} listed</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StoresView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [detailId, setDetailId] = useState<number | null>(null);
  // Local map of display-order edits (storeId → value string)
  const [orderEdits, setOrderEdits] = useState<Record<number, string>>({});
  const { data: stores = [], isLoading } = useQuery<StoreAdminRow[]>({ queryKey: ["/api/admin/stores"] });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" | "hold" | "delete" }) => {
      if (action === "delete") return apiRequest("DELETE", `/api/admin/stores/${id}`);
      return apiRequest("PATCH", `/api/admin/stores/${id}/${action}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      toast({ title: "Store updated" });
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });

  const orderMutation = useMutation({
    mutationFn: async ({ id, displayOrder }: { id: number; displayOrder: number }) =>
      apiRequest("PATCH", `/api/admin/stores/${id}/order`, { displayOrder }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      qc.invalidateQueries({ queryKey: ["/api/stores"] });
      toast({ title: "Display order updated" });
    },
    onError: () => toast({ title: "Failed to update order", variant: "destructive" }),
  });

  const handleOrderSave = (id: number) => {
    const val = parseInt(orderEdits[id] ?? "");
    if (isNaN(val)) return;
    orderMutation.mutate({ id, displayOrder: val });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">All Stores</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((s) => (
                  <TableRow key={s.id} data-testid={`row-store-${s.id}`}>
                    <TableCell className="font-medium flex items-center gap-2">
                      {s.logoUrl ? <img src={s.logoUrl} className="w-6 h-6 rounded-full object-cover" /> : <Store className="w-4 h-4 text-muted-foreground" />}
                      {s.name || "Untitled Store"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.supplierName}</TableCell>
                    <TableCell><ApprovalBadge status={s.approvalStatus} /></TableCell>
                    <TableCell>
                      {s.visibility === "VISIBLE" ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Eye className="w-3.5 h-3.5" />Visible</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><EyeOff className="w-3.5 h-3.5" />Hidden</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.productCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          className="w-14 h-7 text-xs border rounded px-2 bg-background"
                          value={orderEdits[s.id] ?? String((s as any).displayOrder ?? 0)}
                          onChange={(e) => setOrderEdits((p) => ({ ...p, [s.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && handleOrderSave(s.id)}
                          data-testid={`input-store-order-${s.id}`}
                        />
                        <button
                          className="h-7 px-1.5 text-xs rounded border bg-muted hover:bg-accent transition-colors"
                          onClick={() => handleOrderSave(s.id)}
                          disabled={orderMutation.isPending}
                          title="Save order"
                          data-testid={`button-save-order-${s.id}`}
                        >
                          ✓
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDetailId(s.id)} data-testid={`button-view-store-${s.id}`}>View</Button>
                        {s.approvalStatus !== "APPROVED" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => actionMutation.mutate({ id: s.id, action: "approve" })} disabled={actionMutation.isPending} data-testid={`button-approve-store-${s.id}`}>
                            <Check className="w-3 h-3 mr-1" />Approve
                          </Button>
                        )}
                        {s.approvalStatus !== "REJECTED" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => actionMutation.mutate({ id: s.id, action: "reject" })} disabled={actionMutation.isPending} data-testid={`button-reject-store-${s.id}`}>
                            <X className="w-3 h-3 mr-1" />Reject
                          </Button>
                        )}
                        {s.approvalStatus !== "ON_HOLD" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => actionMutation.mutate({ id: s.id, action: "hold" })} disabled={actionMutation.isPending} data-testid={`button-hold-store-${s.id}`}>
                            <Pause className="w-3 h-3 mr-1" />Hold
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => actionMutation.mutate({ id: s.id, action: "delete" })} disabled={actionMutation.isPending} data-testid={`button-delete-store-${s.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {stores.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">No stores found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <StoreDetailDialog storeId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

export default function SuppliersPage() {
  const [view, setView] = useState<"suppliers" | "stores">("suppliers");
  const { data: users = [], isLoading } = useQuery<User[]>({ queryKey: ["/api/admin/users"] });
  const { data: stores = [] } = useQuery<StoreAdminRow[]>({ queryKey: ["/api/admin/stores"] });
  const suppliers = users.filter((u) => u.role === "SUPPLIER");
  const pendingStores = stores.filter((s) => s.approvalStatus === "PENDING").length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage registered suppliers and their public stores.</p>
        </div>
        <div className="inline-flex rounded-lg border p-1 bg-muted/40">
          <button
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === "suppliers" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            onClick={() => setView("suppliers")}
            data-testid="button-view-suppliers"
          >
            Suppliers
          </button>
          <button
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === "stores" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            onClick={() => setView("stores")}
            data-testid="button-view-stores"
          >
            Stores{pendingStores > 0 && <Badge className="ml-1.5 bg-amber-500 text-white border-0 text-[10px] px-1.5">{pendingStores}</Badge>}
          </button>
        </div>
      </div>

      {view === "suppliers" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="bg-primary/10 rounded-xl p-3">
                  <Store className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Suppliers</p>
                  <p className="text-2xl font-bold text-foreground">{suppliers.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="bg-green-500/10 rounded-xl p-3">
                  <Package className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Active Suppliers</p>
                  <p className="text-2xl font-bold text-foreground">{suppliers.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="bg-amber-500/10 rounded-xl p-3">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Pending Approval</p>
                  <p className="text-2xl font-bold text-foreground">0</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">All Suppliers</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground">{s.email}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                            Active
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {suppliers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-10">No suppliers found</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <StoresView />
      )}
    </div>
  );
}
