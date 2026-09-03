import ProviderNotificationsPage from "@/pages/shared/provider-notifications-page";

// ── Notifications tab ─────────────────────────────────────────────────────────
// Dedicated file per the account switcher's tab-per-route structure, but the
// implementation is the same shared ProviderNotificationsPage every other
// provider account (Driver/Printer/Academy/Maintenance/Barista) already uses —
// reused as-is, not reimplemented, to avoid a second notification-feed system.

export default function MarketingNotifications() {
  return <ProviderNotificationsPage />;
}
