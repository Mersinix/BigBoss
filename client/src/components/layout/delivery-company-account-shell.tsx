import {
  Truck,
  Briefcase,
  MessageSquare,
  TrendingUp,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Performance first, then the new "Business" tab (Livraisons disponibles/Mes
// livraisons/Chauffeurs/Véhicules/Profil — see business.tsx's internal
// SubTabSwitcher), Communication, Paramètres. The former separate "Profil
// Public" tab is gone: its role (a Coffee-Owner-marketplace-style preview) is
// now the Eye icon inside Business → Profil, reusing the exact same visual
// reference as the Barista/Maintenance details modals via
// DeliveryCompanyDetailModal — no second preview design. Same reorg pattern
// as barista-account-shell.tsx / maintenance-account-shell.tsx.
const TABS: ProfessionalAccountTab[] = [
  { path: "/delivery", label: "Performance", icon: TrendingUp, exact: true },
  { path: "/delivery/business", label: "Business", icon: Briefcase },
  { path: "/delivery/communication", label: "Communication", icon: MessageSquare, messageBadge: true },
  { path: "/delivery/settings", label: "Paramètres", icon: Settings },
];

// Replaces the generic sidebar (DashboardLayout) for the Delivery Company
// account — now a thin wrapper around the shared ProfessionalAccountShell
// (see components/layout/professional-account-shell.tsx), which supplies the
// header/action-icons/notification-popover/tab-switcher chrome common to
// every professional account (Marketing is the design reference). Every
// /delivery/* page keeps its own data-fetching/business logic completely
// unchanged.
export function DeliveryCompanyAccountShell({ children }: { children: React.ReactNode }) {
  return (
    <ProfessionalAccountShell
      title="Espace Livraison"
      headerIcon={Truck}
      gradientClass="from-teal-600 to-cyan-700"
      subtitleTextClass="text-teal-100"
      activeBorderClass="border-teal-600"
      activeTextClass="text-teal-600 dark:text-teal-400"
      badgeBgClass="bg-teal-600"
      tabs={TABS}
      notificationService="SHOP"
      messagesPath="/delivery/communication?tab=messages"
      reviewsPath="/delivery/communication?tab=avis"
      settingsPath="/delivery/settings"
      communicationPath="/delivery/communication"
      testIdPrefix="delivery-company"
    >
      {children}
    </ProfessionalAccountShell>
  );
}
