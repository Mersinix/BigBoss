import {
  Truck,
  CalendarClock,
  Receipt,
  Briefcase,
  Award,
  Eye,
  MessageSquare,
  TrendingUp,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Standard cross-account structure — Performance first (replaces the former
// standalone "Mon Compte"/Dashboard tab; its content is already reused as
// Performance > Dashboard, see pages/driver/performance.tsx), then
// business-specific tabs (Planification stays a real separate page — never
// to be confused with Performance > Dashboard), Profil Public, Communication,
// Paramètres.
const TABS: ProfessionalAccountTab[] = [
  { path: "/driver", label: "Performance", icon: TrendingUp, exact: true },
  { path: "/driver/planning", label: "Planification", icon: CalendarClock },
  { path: "/driver/deliveries", label: "Livraisons", icon: Truck },
  { path: "/driver/payments", label: "Paiements", icon: Receipt },
  { path: "/driver/opportunities", label: "Opportunités", icon: Briefcase },
  { path: "/driver/rewards", label: "Récompenses", icon: Award },
  { path: "/driver/profil-public", label: "Profil Public", icon: Eye },
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
