import {
  Megaphone,
  Briefcase,
  MessageSquare,
  TrendingUp,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Performance first, then the new "Business" tab (Services/Projets/Clients/
// Devis & Factures/Profil — see business.tsx's internal SubTabSwitcher),
// Communication, Paramètres. The former separate "Profil Public" tab is gone:
// its role (a marketplace-style preview) is now the Eye icon inside
// Business → Profil, reusing the existing MarketingDetailModal — no second
// preview design. Same reorg pattern as barista-account-shell.tsx /
// maintenance-account-shell.tsx / delivery-company-account-shell.tsx /
// driver-account-shell.tsx / academy-account-shell.tsx.
const TABS: ProfessionalAccountTab[] = [
  { path: "/marketing-panel", label: "Performance", icon: TrendingUp, exact: true },
  { path: "/marketing-panel/business", label: "Business", icon: Briefcase },
  { path: "/marketing-panel/communication", label: "Communication", icon: MessageSquare, messageBadge: true },
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
