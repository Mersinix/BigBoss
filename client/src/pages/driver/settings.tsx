import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { AccountIdentityCard } from "@/components/settings/account-identity-card";
import { AccountAddressCard } from "@/components/settings/account-address-card";
import { AccountSecurityCard } from "@/components/settings/account-security-card";
import { useEffectiveAccountDarkMode } from "@/hooks/use-account-dark-mode";
import { Settings as SettingsIcon } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

const ACCENT = "bg-blue-600 hover:bg-blue-700 text-white";
const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

// Settings = account management ONLY (Settings/Business-Profil separation
// task): Compte / Localisation / Notifications / Sécurité. Vehicle and
// Disponibilité now live exclusively in Business → Profil
// (driver/profile.tsx) — the single source of truth for that data, no longer
// duplicated here.
export default function DriverSettingsPage() {
  const isDark = useEffectiveAccountDarkMode("DRIVER");
  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        title="Paramètres"
        subtitle="Gérez votre compte et vos préférences."
        icon={SettingsIcon}
        gradientClass="bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20"
        iconBgClass="bg-blue-500/15"
        iconTextClass="text-blue-600 dark:text-blue-400"
      />

      <AccountIdentityCard accentClassName={ACCENT} testIdPrefix="driver" className={CARD_CLASS} />

      <AccountAddressCard accentClassName={ACCENT} isDark={isDark} className={CARD_CLASS} />

      <NotificationPreferencesCard role="DRIVER" className={CARD_CLASS} />

      <AccountSecurityCard testIdPrefix="driver" className={CARD_CLASS} />
    </div>
  );
}
