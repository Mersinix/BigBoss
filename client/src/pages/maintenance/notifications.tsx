import ProviderNotificationsPage from "@/pages/shared/provider-notifications-page";

// ── Notifications tab ─────────────────────────────────────────────────────────
// Dedicated file per the Maintenance switcher's tab-per-file structure, but the
// implementation itself is the same shared ProviderNotificationsPage every other
// provider account (Driver/Printer/Academy/Barista) already uses — reused as-is,
// not reimplemented, to avoid a second notification-feed implementation.

export default function Notifications() {
  return <ProviderNotificationsPage />;
}
