import {
  LayoutDashboard,
  Megaphone,
  Briefcase,
  Users,
  FileText,
  Eye,
  MessageSquare,
  TrendingUp,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Standard cross-account structure (Part 5/14): Dashboard, business-specific
// tabs, Profil Public, Communication, Performance, Paramètres — Marketing is
// the visual/structural reference every other professional account shell now
// follows via the shared ProfessionalAccountShell.
const TABS: ProfessionalAccountTab[] = [
  { path: "/marketing-panel", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/marketing-panel/services", label: "Services", icon: Megaphone },
  { path: "/marketing-panel/projects", label: "Projets", icon: Briefcase },
  { path: "/marketing-panel/clients", label: "Clients", icon: Users },
  { path: "/marketing-panel/invoices", label: "Devis & Factures", icon: FileText },
  { path: "/marketing-panel/profil-public", label: "Profil Public", icon: Eye },
  { path: "/marketing-panel/communication", label: "Communication", icon: MessageSquare, messageBadge: true },
  { path: "/marketing-panel/performance", label: "Performance", icon: TrendingUp },
  { path: "/marketing-panel/settings", label: "Paramètres", icon: Settings },
];

// Replaces the generic sidebar (DashboardLayout) for the Marketing account —
// now a thin wrapper around the shared ProfessionalAccountShell (see
// components/layout/professional-account-shell.tsx), which supplies the
// header/action-icons/notification-popover/tab-switcher chrome common to
// every professional account. Every /marketing-panel/* page keeps its own
// data-fetching/business logic untouched; this shell only supplies the
// surrounding chrome.
export function MarketingAccountShell({ children }: { children: React.ReactNode }) {
  return (
    <ProfessionalAccountShell
      title="Espace Marketing"
      headerIcon={Megaphone}
      gradientClass="from-fuchsia-600 to-purple-700"
      subtitleTextClass="text-fuchsia-100"
      activeBorderClass="border-fuchsia-600"
      activeTextClass="text-fuchsia-600 dark:text-fuchsia-400"
      badgeBgClass="bg-fuchsia-600"
      tabs={TABS}
      notificationService="MARKETING"
      messagesPath="/marketing-panel/communication?tab=messages"
      reviewsPath="/marketing-panel/communication?tab=avis"
      settingsPath="/marketing-panel/settings"
      communicationPath="/marketing-panel/communication"
      testIdPrefix="marketing"
    >
      {children}
    </ProfessionalAccountShell>
  );
}
