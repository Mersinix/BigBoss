import {
  Coffee,
  Briefcase,
  MessageSquare,
  TrendingUp,
  GraduationCap,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Performance first, then the new "Business" tab (Demandes/Missions/Profil —
// see business.tsx's internal SubTabSwitcher), Academy, Communication,
// Paramètres. The former separate "Profil Public" tab is gone — its role (a
// Coffee-Owner-style preview of the real profile) is now the Eye icon inside
// Business → Profil (profile.tsx), reusing the exact Coffee Owner
// BaristaDetailModal instead of a second preview design.
const TABS: ProfessionalAccountTab[] = [
  { path: "/barista-marketplace", label: "Performance", icon: TrendingUp, exact: true },
  { path: "/barista-marketplace/business", label: "Business", icon: Briefcase },
  { path: "/barista-marketplace/academy", label: "Academy", icon: GraduationCap },
  { path: "/barista-marketplace/communication", label: "Communication", icon: MessageSquare, messageBadge: true },
  { path: "/barista-marketplace/settings", label: "Paramètres", icon: Settings },
];

// Replaces the generic sidebar for the Barista Marketplace account — now a
// thin wrapper around the shared ProfessionalAccountShell (see
// components/layout/professional-account-shell.tsx), which supplies the
// header/action-icons/notification-popover/tab-switcher chrome common to
// every professional account (Marketing is the design reference). Every
// /barista-marketplace/* page keeps its own data-fetching/business logic
// completely unchanged; this shell only supplies the surrounding chrome.
export function BaristaAccountShell({ children }: { children: React.ReactNode }) {
  return (
    <ProfessionalAccountShell
      title="Espace Barista Marketplace"
      headerIcon={Coffee}
      gradientClass="from-green-600 to-emerald-700"
      subtitleTextClass="text-green-100"
      activeBorderClass="border-green-600"
      activeTextClass="text-green-600 dark:text-green-400"
      badgeBgClass="bg-green-600"
      tabs={TABS}
      notificationService="BARISTA"
      messagesPath="/barista-marketplace/communication?tab=messages"
      reviewsPath="/barista-marketplace/communication?tab=avis"
      settingsPath="/barista-marketplace/settings"
      communicationPath="/barista-marketplace/communication"
      testIdPrefix="barista"
    >
      {children}
    </ProfessionalAccountShell>
  );
}
