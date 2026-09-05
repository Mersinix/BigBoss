import { BookOpen, ClipboardList, Users, CalendarDays, UserCheck } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import AcademyCoursesPage from "@/pages/barista-academy/courses";
import AcademyRegistrationsPage from "@/pages/barista-academy/registrations";
import AcademyStudentsPage from "@/pages/barista-academy/students";
import AcademyCalendarPage from "@/pages/barista-academy/calendar";
import AcademyProfilePage from "@/pages/barista-academy/profile";

// Business tab — Formations / Inscriptions / Étudiants / Calendrier / Profil,
// each the account's own existing page component moved under one switcher
// (same mechanism as the Barista Marketplace, Maintenance, Delivery Company
// and Driver Business tabs, see sub-tab-switcher.tsx). No content duplicated
// or rewritten: same data, actions and synchronization as before — only the
// main navigation entry point changed.
export default function AcademyBusiness() {
  return (
    <SubTabSwitcher
      testIdPrefix="academy-business"
      activeTextClass="text-indigo-600 dark:text-indigo-400"
      tabs={[
        { key: "courses", label: "Formations", icon: BookOpen, content: <AcademyCoursesPage /> },
        { key: "registrations", label: "Inscriptions", icon: ClipboardList, content: <AcademyRegistrationsPage /> },
        { key: "students", label: "Étudiants", icon: Users, content: <AcademyStudentsPage /> },
        { key: "calendar", label: "Calendrier", icon: CalendarDays, content: <AcademyCalendarPage /> },
        { key: "profile", label: "Profil", icon: UserCheck, content: <AcademyProfilePage /> },
      ]}
    />
  );
}
