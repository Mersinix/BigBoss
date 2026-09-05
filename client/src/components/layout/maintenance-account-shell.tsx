import {
  Wrench,
  Briefcase,
  MessageSquare,
  TrendingUp,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Performance first, then the new "Business" tab (Profil/Planning — see
// business.tsx's internal SubTabSwitcher), Communication, Paramètres. The
// former separate "Disponibilité" and "Profil Public" tabs are gone:
// Disponibilité's content now lives inside Business → Profil (profile.tsx
// renders the existing Availability component inline), and Profil Public's
// role (a Coffee-Owner-style preview of the real profile) is now the Eye icon
// inside Business → Profil, reusing the exact Coffee Owner AgentDetailModal
// instead of a second preview design. Same reorg pattern as
// barista-account-shell.tsx.
const TABS: ProfessionalAccountTab[] = [
  { path: "/maintenance-panel", label: "Performance", icon: TrendingUp, exact: true },
  { path: "/maintenance-panel/business", label: "Business", icon: Briefcase },
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
