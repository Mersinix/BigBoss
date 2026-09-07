import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { AccountIdentityCard } from "@/components/settings/account-identity-card";
import { AccountAddressCard } from "@/components/settings/account-address-card";
import { AccountSecurityCard } from "@/components/settings/account-security-card";

const ACCENT = "bg-teal-600 hover:bg-teal-700 text-white";

// Settings = account management ONLY (Settings/Business-Profil separation
// task): Compte / Localisation / Notifications / Sécurité. Every
// business/profile-facing field (portfolio, zones, availability, visibility)
// now lives exclusively in Business → Profil (delivery/profile.tsx) — the
// single source of truth for that data, no longer duplicated here.
export default function DeliveryCompanySettingsPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez votre compte et vos préférences de notification.</p>
      </div>

      <AccountIdentityCard nameLabel="Nom de l'entreprise" accentClassName={ACCENT} testIdPrefix="delivery-company" />

      <AccountAddressCard accentClassName={ACCENT} />

      <NotificationPreferencesCard role="DELIVERY_COMPANY" />

      <AccountSecurityCard testIdPrefix="delivery-company" />
    </div>
  );
}
