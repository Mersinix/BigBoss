import {
  Wrench,
  ClipboardList,
  User,
  Calendar,
  Eye,
  MessageSquare,
  TrendingUp,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Standard cross-account structure (Part 5/14) — same as every other
// professional account shell now (Marketing is the design reference).
// Maintenance previously drove its tabs from client-side state inside a
// single wildcard route (/maintenance-panel/:rest*) rather than real routes;
// it now follows the same real-route-per-tab pattern as every other
// professional account, so the header's Message/Notification/Avis icons and
// the new Communication/Performance switchers can deep-link the same way.
const TABS: ProfessionalAccountTab[] = [
  { path: "/maintenance-panel", label: "Planning", icon: ClipboardList, exact: true },
  { path: "/maintenance-panel/profile", label: "Profil", icon: User },
  { path: "/maintenance-panel/availability", label: "Disponibilité", icon: Calendar },
  { path: "/maintenance-panel/profil-public", label: "Profil Public", icon: Eye },
  { path: "/maintenance-panel/communication", label: "Communication", icon: MessageSquare, messageBadge: true },
  { path: "/maintenance-panel/performance", label: "Performance", icon: TrendingUp },
  { path: "/maintenance-panel/settings", label: "Paramètres", icon: Settings },
];

// Replaces Maintenance's own hand-rolled header/switcher (previously
// duplicated inside dashboard.tsx) — now a thin wrapper around the shared
// ProfessionalAccountShell (see components/layout/professional-account-shell.tsx),
// which supplies the header/action-icons/notification-popover/tab-switcher
// chrome common to every professional account. Every /maintenance-panel/*
// page keeps its own data-fetching/business logic completely unchanged.
export function MaintenanceAccountShell({ children }: { children: React.ReactNode }) {
  return (
    <ProfessionalAccountShell
      title="Espace Maintenance"
      headerIcon={Wrench}
      gradientClass="from-orange-600 to-amber-600"
      subtitleTextClass="text-orange-100"
      activeBorderClass="border-orange-600"
      activeTextClass="text-orange-600 dark:text-orange-400"
      badgeBgClass="bg-orange-600"
      tabs={TABS}
      notificationService="MAINTENANCE"
      messagesPath="/maintenance-panel/communication?tab=messages"
      reviewsPath="/maintenance-panel/communication?tab=avis"
      settingsPath="/maintenance-panel/settings"
      communicationPath="/maintenance-panel/communication"
      testIdPrefix="maintenance"
    >
      {children}
    </ProfessionalAccountShell>
  );
}
