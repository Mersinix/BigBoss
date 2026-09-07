import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { AccountIdentityCard } from "@/components/settings/account-identity-card";
import { AccountAddressCard } from "@/components/settings/account-address-card";
import { AccountSecurityCard } from "@/components/settings/account-security-card";

const ACCENT = "bg-blue-600 hover:bg-blue-700 text-white";

// Settings = account management ONLY (Settings/Business-Profil separation
// task): Compte / Localisation / Notifications / Sécurité. Vehicle and
// Disponibilité now live exclusively in Business → Profil
// (driver/profile.tsx) — the single source of truth for that data, no longer
// duplicated here.
export default function DriverSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez votre compte et vos préférences.</p>
      </div>

      <AccountIdentityCard accentClassName={ACCENT} testIdPrefix="driver" />

      <AccountAddressCard accentClassName={ACCENT} />

      <NotificationPreferencesCard role="DRIVER" />

      <AccountSecurityCard testIdPrefix="driver" />
    </div>
  );
}
