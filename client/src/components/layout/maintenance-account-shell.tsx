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

// Standard cross-account structure — Performance first (replaces the former
// standalone Dashboard/Planning-as-dashboard tab). Planning is a real,
// separate functional page (appointments/interventions) and must never be
// confused with Performance > Dashboard — it keeps its own dedicated route
// and tab, unchanged, immediately after Performance. Maintenance previously
// drove its tabs from client-side state inside a single wildcard route
// (/maintenance-panel/:rest*) rather than real routes; it now follows the
// same real-route-per-tab pattern as every other professional account.
const TABS: ProfessionalAccountTab[] = [
  { path: "/maintenance-panel", label: "Performance", icon: TrendingUp, exact: true },
  { path: "/maintenance-panel/planning", label: "Planning", icon: ClipboardList },
  { path: "/maintenance-panel/profile", label: "Profil", icon: User },
  { path: "/maintenance-panel/availability", label: "Disponibilité", icon: Calendar },
  { path: "/maintenance-panel/profil-public", label: "Profil Public", icon: Eye },
  { path: "/maintenance-panel/communication", label: "Communication", icon: MessageSquare, messageBadge: true },
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
