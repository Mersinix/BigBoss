import {
  LayoutDashboard,
  Printer as PrinterIcon,
  ClipboardList,
  Package,
  FileText,
  Layers,
  Eye,
  MessageSquare,
  TrendingUp,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Standard cross-account structure (Part 5/14) — same as every other
// professional account shell now.
const TABS: ProfessionalAccountTab[] = [
  { path: "/printer", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/printer/services", label: "Services", icon: PrinterIcon },
  { path: "/printer/orders", label: "Commandes", icon: ClipboardList },
  { path: "/printer/catalog", label: "Catalogue", icon: Package },
  { path: "/printer/invoices", label: "Facturation", icon: FileText },
  { path: "/printer/categories", label: "Catégories", icon: Layers },
  { path: "/printer/profil-public", label: "Profil Public", icon: Eye },
  { path: "/printer/communication", label: "Communication", icon: MessageSquare, messageBadge: true },
  { path: "/printer/performance", label: "Performance", icon: TrendingUp },
  { path: "/printer/settings", label: "Paramètres", icon: Settings },
];

// Replaces the generic sidebar for the Printer account — now a thin wrapper
// around the shared ProfessionalAccountShell (see
// components/layout/professional-account-shell.tsx), which supplies the
// header/action-icons/notification-popover/tab-switcher chrome common to
// every professional account (Marketing is the design reference). Every
// /printer/* page keeps its own data-fetching/business logic completely
// unchanged.
export function PrinterAccountShell({ children }: { children: React.ReactNode }) {
  return (
    <ProfessionalAccountShell
      title="Espace Imprimerie"
      headerIcon={PrinterIcon}
      gradientClass="from-blue-600 to-cyan-700"
      subtitleTextClass="text-blue-100"
      activeBorderClass="border-blue-600"
      activeTextClass="text-blue-600 dark:text-blue-400"
      badgeBgClass="bg-blue-600"
      tabs={TABS}
      notificationService="PRINT"
      messagesPath="/printer/communication?tab=messages"
      reviewsPath="/printer/communication?tab=avis"
      settingsPath="/printer/settings"
      communicationPath="/printer/communication"
      testIdPrefix="printer"
    >
      {children}
    </ProfessionalAccountShell>
  );
}
