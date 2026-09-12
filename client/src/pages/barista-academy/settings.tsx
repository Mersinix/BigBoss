import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { AccountIdentityCard } from "@/components/settings/account-identity-card";
import { AccountAddressCard } from "@/components/settings/account-address-card";
import { AccountSecurityCard } from "@/components/settings/account-security-card";
import { useEffectiveAccountDarkMode } from "@/hooks/use-account-dark-mode";
import { Settings as SettingsIcon } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

const ACCENT = "bg-indigo-600 hover:bg-indigo-700 text-white";
const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

// Settings = account management ONLY (Settings/Business-Profil separation
// task): Compte / Localisation / Notifications / Sécurité. Every
// business/profile-facing field (description, formations summary,
// availability, visibility) now lives exclusively in Business → Profil
// (barista-academy/profile.tsx) — the single source of truth for that data,
// no longer duplicated here.
export default function AcademySettingsPage() {
  const isDark = useEffectiveAccountDarkMode("BARISTA_ACADEMY");
  return (
    <div className="flex flex-col gap-5 p-6 max-w-2xl">
      <DashboardHero
        title="Paramètres"
        subtitle="Gérez votre compte et vos préférences."
        icon={SettingsIcon}
        gradientClass="bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border-indigo-500/20"
        iconBgClass="bg-indigo-500/15"
        iconTextClass="text-indigo-600 dark:text-indigo-400"
      />

      <AccountIdentityCard nameLabel="Nom de l'académie" accentClassName={ACCENT} testIdPrefix="academy" className={CARD_CLASS} />

      <AccountAddressCard accentClassName={ACCENT} isDark={isDark} className={CARD_CLASS} />

      <NotificationPreferencesCard role="BARISTA_ACADEMY" className={CARD_CLASS} />

      <AccountSecurityCard testIdPrefix="academy" className={CARD_CLASS} />
    </div>
  );
}
