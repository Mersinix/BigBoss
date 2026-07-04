import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Store, Image as ImageIcon, RefreshCw, Save, Heart, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { SupplierStore } from "@shared/schema";

function ApprovalBadge({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "PENDING") return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0 text-xs">Pending Review</Badge>;
  if (status === "APPROVED") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0 text-xs">Approved</Badge>;
  if (status === "REJECTED") return <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-0 text-xs">Rejected</Badge>;
  if (status === "ON_HOLD") return <Badge className="bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-0 text-xs">On Hold</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

export default function StorePage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: store, isLoading } = useQuery<SupplierStore | null>({
    queryKey: ["/api/supplier/store"],
  });

  const [form, setForm] = useState({
    name: "",
    description: "",
    coverUrl: "",
    logoUrl: "",
    isOpen: true,
    visibility: "VISIBLE" as "VISIBLE" | "HIDDEN",
  });

  useEffect(() => {
    if (store) {
      setForm({
        name: store.name ?? "",
        description: store.description ?? "",
        coverUrl: store.coverUrl ?? "",
        logoUrl: store.logoUrl ?? "",
        isOpen: store.isOpen ?? true,
        visibility: store.visibility ?? "VISIBLE",
      });
    }
  }, [store]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/supplier/store", form);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/store"] });
      toast({ title: "Store profile saved", description: "Your store details have been updated." });
    },
    onError: () => {
      toast({ title: "Failed to save store", variant: "destructive" });
    },
  });

  const update = (key: keyof typeof form, value: any) => setForm((p) => ({ ...p, [key]: value }));

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Store className="w-6 h-6 text-primary" />My Store</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure how your store appears to Coffee Owners in the marketplace.</p>
        </div>
        <ApprovalBadge status={store?.approvalStatus} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Form ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Store Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="store-name">Store Name</Label>
              <Input id="store-name" data-testid="input-store-name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Sunrise Coffee Roasters" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store-description">Description</Label>
              <Textarea id="store-description" data-testid="input-store-description" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Tell coffee owners about your store…" rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store-logo">Logo URL</Label>
              <Input id="store-logo" data-testid="input-store-logo" value={form.logoUrl} onChange={(e) => update("logoUrl", e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store-cover">Cover Image URL</Label>
              <Input id="store-cover" data-testid="input-store-cover" value={form.coverUrl} onChange={(e) => update("coverUrl", e.target.value)} placeholder="https://…" />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Store Open</p>
                <p className="text-xs text-muted-foreground">Show your store as currently open for orders.</p>
              </div>
              <Switch checked={form.isOpen} onCheckedChange={(v) => update("isOpen", v)} data-testid="switch-store-open" />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Visible in Marketplace</p>
                <p className="text-xs text-muted-foreground">Hide your store card without affecting your products.</p>
              </div>
              <Switch checked={form.visibility === "VISIBLE"} onCheckedChange={(v) => update("visibility", v ? "VISIBLE" : "HIDDEN")} data-testid="switch-store-visibility" />
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-store">
              {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
              Save Store Profile
            </Button>
            {store?.approvalStatus === "REJECTED" && (
              <p className="text-xs text-red-600">Your store was rejected. Editing and saving will resubmit it for review.</p>
            )}
            {store?.approvalStatus === "ON_HOLD" && (
              <p className="text-xs text-muted-foreground">Your store is on hold by the admin team.</p>
            )}
          </CardContent>
        </Card>

        {/* ── Live Preview ── */}
        <div>
          <p className="text-sm font-medium mb-2 text-muted-foreground">Live Preview — how Coffee Owners see your store</p>
          <div className="bg-white dark:bg-card rounded-2xl border shadow-sm overflow-hidden max-w-sm mx-auto lg:mx-0" data-testid="preview-store-card">
            <div className="relative aspect-[16/9] bg-gray-100 dark:bg-muted overflow-hidden">
              {form.coverUrl ? (
                <img src={form.coverUrl} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-10 h-10 text-gray-300" /></div>
              )}
              <button className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm">
                <Heart className="w-3.5 h-3.5 text-gray-400" />
              </button>
              {!form.isOpen && (
                <div className="absolute top-2 left-2">
                  <Badge className="bg-gray-900/80 text-white border-0 text-[10px]">Closed</Badge>
                </div>
              )}
            </div>
            <div className="p-3 flex gap-3 relative z-20">
              <div className="w-12 h-12 rounded-full border-2 border-white dark:border-card -mt-8 bg-white dark:bg-card shadow-sm overflow-hidden shrink-0 flex items-center justify-center">
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <Store className="w-5 h-5 text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0 mt-0.5">
                <h3 className="font-bold text-sm leading-tight truncate">{form.name || "Your Store Name"}</h3>
                <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{form.description || "Your store description will appear here."}</p>
                <div className="flex items-center gap-1 text-[11px] text-amber-600 mt-1.5">
                  <Package className="w-3 h-3" /><span>Distance shown to nearby cafe owners</span>
                </div>
              </div>
            </div>
          </div>
          {form.visibility === "HIDDEN" && (
            <p className="text-xs text-muted-foreground text-center mt-3">This store card is hidden from the marketplace. Your products still appear normally.</p>
          )}
        </div>
      </div>
    </div>
  );
}
