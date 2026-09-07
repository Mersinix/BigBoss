import {
  Printer as PrinterIcon,
  Briefcase,
  MessageSquare,
  TrendingUp,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Performance first, then the new "Business" tab (Services/Commandes/
// Catalogue/Facturation/Profil/Catégories — see business.tsx's internal
// SubTabSwitcher), Communication, Paramètres. The former separate "Profil
// Public" tab is gone: its role (a marketplace-style preview) is now the Eye
// icon inside Business → Profil, reusing PrintCompanyDetailModal — no second
// preview design. Same reorg pattern as marketing-account-shell.tsx /
// academy-account-shell.tsx.
const TABS: ProfessionalAccountTab[] = [
  { path: "/printer", label: "Performance", icon: TrendingUp, exact: true },
  { path: "/printer/business", label: "Business", icon: Briefcase },
  { path: "/printer/communication", label: "Communication", icon: MessageSquare, messageBadge: true },
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
