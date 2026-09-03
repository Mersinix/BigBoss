import {
  Coffee,
  LayoutDashboard,
  UserCheck,
  Briefcase,
  ClipboardList,
  Eye,
  MessageSquare,
  TrendingUp,
  GraduationCap,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Standard cross-account structure (Part 5/14) — same as every other
// professional account shell now. "Profil" (the self-editor, previously
// mislabeled "Profil public") stays as its own business-specific tab; the new
// "Profil Public" tab is the actual Coffee-Owner-facing preview (Part 4).
const TABS: ProfessionalAccountTab[] = [
  { path: "/barista-marketplace", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/barista-marketplace/profile", label: "Profil", icon: UserCheck },
  { path: "/barista-marketplace/requests", label: "Demandes", icon: Briefcase },
  { path: "/barista-marketplace/missions", label: "Missions", icon: ClipboardList },
  { path: "/barista-marketplace/academy", label: "Academy", icon: GraduationCap },
  { path: "/barista-marketplace/profil-public", label: "Profil Public", icon: Eye },
  { path: "/barista-marketplace/communication", label: "Communication", icon: MessageSquare, messageBadge: true },
  { path: "/barista-marketplace/performance", label: "Performance", icon: TrendingUp },
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
