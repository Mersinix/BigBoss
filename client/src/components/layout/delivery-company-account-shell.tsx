import {
  Truck,
  Package,
  Users,
  Eye,
  MessageSquare,
  TrendingUp,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Standard cross-account structure — Performance first (replaces the former
// standalone Dashboard tab), then business-specific tabs, Profil Public,
// Communication, Paramètres (Marketing is the design reference).
const TABS: ProfessionalAccountTab[] = [
  { path: "/delivery", label: "Performance", icon: TrendingUp, exact: true },
  { path: "/delivery/available", label: "Livraisons disponibles", icon: Package },
  { path: "/delivery/my-deliveries", label: "Mes livraisons", icon: Truck },
  { path: "/delivery/drivers", label: "Chauffeurs", icon: Users },
  { path: "/delivery/vehicles", label: "Véhicules", icon: Truck },
  { path: "/delivery/profil-public", label: "Profil Public", icon: Eye },
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
