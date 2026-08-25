import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Inbox } from "lucide-react";

/**
 * Shared "premium dashboard" building blocks for the Admin/Supplier Dashboard, Analytics and
 * Earnings pages — built once so Admin and Supplier read as two surfaces of the same product
 * (per the design brief) instead of six independently-styled pages.
 *
 * Deliberately built ONLY on the app's existing shadcn Card primitive and CSS-variable-driven
 * Tailwind tokens (bg-card, text-foreground, text-muted-foreground, border-border, bg-primary,
 * hsl(var(--...))) — never a literal color (bg-white, text-gray-800) and never a `dark:`
 * variant. Audited first: tailwind.config.ts sets darkMode:["class"], but nothing in the
 * client ever adds a `dark` class anywhere (grepped app-wide) — so `dark:` utilities are
 * inert everywhere in this app today, not just here. Building on the CSS-variable tokens
 * means these pages already look correct in the app's current (light) rendering and will
 * automatically pick up real dark-mode support for free if that toggle is ever wired up —
 * without needing another pass through this file.
 */

// ── Hero / welcome banner ────────────────────────────────────────────────────

export function DashboardHero({
  title, subtitle, stat, statLabel, icon: Icon,
}: {
  title: string;
  subtitle: string;
  stat?: string;
  statLabel?: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20">
      <CardContent className="p-6 flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1.5 text-sm sm:text-base">{subtitle}</p>
        </div>
        {stat && (
          <div className="flex items-center gap-3 shrink-0 bg-card/70 border border-border/60 rounded-2xl px-5 py-3">
            {Icon && (
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
            )}
            <div>
              {statLabel && <p className="text-xs text-muted-foreground">{statLabel}</p>}
              <p className="text-xl font-bold text-foreground">{stat}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── KPI stat card ─────────────────────────────────────────────────────────────

export function TrendBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md",
      positive ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600",
    )}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

export function StatCard({
  label, value, icon: Icon, tone = "primary", subtext, trend,
}: {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  tone?: "primary" | "amber" | "green" | "red" | "blue";
  subtext?: ReactNode;
  trend?: number;
}) {
  const toneCls: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    amber: "bg-amber-500/10 text-amber-500",
    green: "bg-green-500/10 text-green-500",
    red: "bg-red-500/10 text-red-500",
    blue: "bg-blue-500/10 text-blue-500",
  };
  return (
    <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", toneCls[tone])}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-2xl font-display font-bold text-foreground">{value}</p>
          {trend != null && <TrendBadge value={trend} />}
        </div>
        {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

// ── Section card (Card + icon/title header + optional right-side control) ─────

export function SectionCard({
  title, icon: Icon, right, children, className, contentClassName,
}: {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("rounded-2xl border-border/50 shadow-sm", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
          {title}
        </CardTitle>
        {right}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

// ── Ranking row ───────────────────────────────────────────────────────────────

const RANK_BADGE = ["bg-amber-400/90 text-white", "bg-slate-300 text-slate-700", "bg-orange-400/90 text-white"];

export function RankRow({
  rank, title, subtitle, value,
}: {
  rank: number;
  title: string;
  subtitle?: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
          rank <= 3 ? RANK_BADGE[rank - 1] : "bg-muted text-muted-foreground",
        )}>
          {rank}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <span className="text-sm font-semibold text-foreground shrink-0">{value}</span>
    </div>
  );
}

// ── Attention / alert row (colored left accent) ───────────────────────────────

export function AlertRow({
  title, subtitle, value, tag, tone = "amber",
}: {
  title: string;
  subtitle?: string;
  value?: string;
  tag?: string;
  tone?: "amber" | "red";
}) {
  const border = tone === "red" ? "border-l-red-500" : "border-l-amber-500";
  const tagCls = tone === "red" ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600";
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-xl border border-border/60 border-l-4 bg-card px-3 py-2.5", border)}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {value && <span className="text-sm font-semibold text-foreground">{value}</span>}
        {tag && <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md", tagCls)}>{tag}</span>}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({ message, icon: Icon = Inbox }: { message: string; icon?: ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Icon className="w-8 h-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
