import {
  Truck,
  Briefcase,
  MessageSquare,
  TrendingUp,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Performance first, then the new "Business" tab (Planification/Livraisons/
// Paiements/Récompenses/Profil — see business.tsx's internal SubTabSwitcher),
// Communication, Paramètres. "Opportunités" is retired entirely (not moved
// anywhere — task Part 7/32); the former separate "Profil Public" tab is also
// gone: its role (a marketplace-style preview) is now the Eye icon inside
// Business → Profil, reusing the same shared DriverDetailModal used by
// Supplier/Delivery Company/Admin. Same reorg pattern as
// barista-account-shell.tsx / maintenance-account-shell.tsx /
// delivery-company-account-shell.tsx.
const TABS: ProfessionalAccountTab[] = [
  { path: "/driver", label: "Performance", icon: TrendingUp, exact: true },
  { path: "/driver/business", label: "Business", icon: Briefcase },
  { path: "/driver/communication", label: "Communication", icon: MessageSquare, messageBadge: true },
  { path: "/driver/settings", label: "Paramètres", icon: Settings },
];

// Replaces the generic sidebar for the Driver account — now a thin wrapper
// around the shared ProfessionalAccountShell (see
// components/layout/professional-account-shell.tsx), which supplies the
// header/action-icons/notification-popover/tab-switcher chrome common to
// every professional account (Marketing is the design reference). Every
// /driver/* page keeps its own data-fetching/business logic completely
// unchanged.
export function DriverAccountShell({ children }: { children: React.ReactNode }) {
  return (
    <ProfessionalAccountShell
      title="Espace Chauffeur"
      headerIcon={Truck}
      gradientClass="from-blue-600 to-indigo-700"
      subtitleTextClass="text-blue-100"
      activeBorderClass="border-blue-600"
      activeTextClass="text-blue-600 dark:text-blue-400"
      badgeBgClass="bg-blue-600"
      tabs={TABS}
      notificationService="SHOP"
      messagesPath="/driver/communication?tab=messages"
      reviewsPath="/driver/communication?tab=avis"
      settingsPath="/driver/settings"
      communicationPath="/driver/communication"
      testIdPrefix="driver"
    >
      {children}
    </ProfessionalAccountShell>
  );
}
