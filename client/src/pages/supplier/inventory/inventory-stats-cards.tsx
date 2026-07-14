import { Card, CardContent } from "@/components/ui/card";
import { Package, CheckCircle2, EyeOff, Boxes, AlertTriangle, XCircle, Layers, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { InventoryStats } from "@shared/schema";

function StatCard({ icon, iconBg, iconColor, label, value }: { icon: React.ReactNode; iconBg: string; iconColor: string; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`${iconBg} rounded-xl p-2.5 shrink-0`}>
          <div className={iconColor}>{icon}</div>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function InventoryStatsCards({ stats, isLoading }: { stats?: InventoryStats; isLoading?: boolean }) {
  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[...Array(8)].map((_, i) => <Card key={i}><CardContent className="p-4 h-[68px]" /></Card>)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3" data-testid="inventory-stats-cards">
      <StatCard icon={<Package className="w-4 h-4" />} iconBg="bg-blue-500/10" iconColor="text-blue-600" label="Total Products" value={stats.totalProducts} />
      <StatCard icon={<CheckCircle2 className="w-4 h-4" />} iconBg="bg-emerald-500/10" iconColor="text-emerald-600" label="Active" value={stats.activeProducts} />
      <StatCard icon={<EyeOff className="w-4 h-4" />} iconBg="bg-slate-500/10" iconColor="text-slate-600" label="Hidden" value={stats.hiddenProducts} />
      <StatCard icon={<Boxes className="w-4 h-4" />} iconBg="bg-teal-500/10" iconColor="text-teal-600" label="In Stock" value={stats.inStock} />
      <StatCard icon={<AlertTriangle className="w-4 h-4" />} iconBg="bg-amber-500/10" iconColor="text-amber-600" label="Low Stock" value={stats.lowStock} />
      <StatCard icon={<XCircle className="w-4 h-4" />} iconBg="bg-red-500/10" iconColor="text-red-600" label="Out of Stock" value={stats.outOfStock} />
      <StatCard icon={<Layers className="w-4 h-4" />} iconBg="bg-violet-500/10" iconColor="text-violet-600" label="Total Units" value={stats.totalUnits.toLocaleString()} />
      <StatCard icon={<Wallet className="w-4 h-4" />} iconBg="bg-cyan-500/10" iconColor="text-cyan-600" label="Inventory Value" value={formatCurrency(stats.inventoryValue)} />
    </div>
  );
}
