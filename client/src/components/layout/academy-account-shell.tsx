import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Users,
  CalendarDays,
  Eye,
  MessageSquare,
  TrendingUp,
  Settings,
} from "lucide-react";
import { ProfessionalAccountShell, type ProfessionalAccountTab } from "@/components/layout/professional-account-shell";

// Standard cross-account structure (Part 5/14) — same as every other
// professional account shell now.
const TABS: ProfessionalAccountTab[] = [
  { path: "/barista-academy", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/barista-academy/courses", label: "Formations", icon: BookOpen },
  { path: "/barista-academy/registrations", label: "Inscriptions", icon: ClipboardList },
  { path: "/barista-academy/students", label: "Étudiants", icon: Users },
  { path: "/barista-academy/calendar", label: "Calendrier", icon: CalendarDays },
  { path: "/barista-academy/profil-public", label: "Profil Public", icon: Eye },
  { path: "/barista-academy/communication", label: "Communication", icon: MessageSquare, messageBadge: true },
  { path: "/barista-academy/performance", label: "Performance", icon: TrendingUp },
  { path: "/barista-academy/settings", label: "Paramètres", icon: Settings },
];

// Replaces the generic sidebar for the Barista Academy account — now a thin
// wrapper around the shared ProfessionalAccountShell (see
// components/layout/professional-account-shell.tsx), which supplies the
// header/action-icons/notification-popover/tab-switcher chrome common to
// every professional account (Marketing is the design reference), with its
// own indigo/education identity color. Every /barista-academy/* page keeps
// its own data-fetching/business logic completely unchanged.
export function AcademyAccountShell({ children }: { children: React.ReactNode }) {
  return (
    <ProfessionalAccountShell
      title="Espace Barista Academy"
      headerIcon={GraduationCap}
      gradientClass="from-indigo-600 to-violet-700"
      subtitleTextClass="text-indigo-100"
      activeBorderClass="border-indigo-600"
      activeTextClass="text-indigo-600 dark:text-indigo-400"
      badgeBgClass="bg-indigo-600"
      tabs={TABS}
      notificationService="ACADEMY"
      messagesPath="/barista-academy/communication?tab=messages"
      reviewsPath="/barista-academy/communication?tab=avis"
      settingsPath="/barista-academy/settings"
      communicationPath="/barista-academy/communication"
      testIdPrefix="academy"
    >
      {children}
    </ProfessionalAccountShell>
  );
}
