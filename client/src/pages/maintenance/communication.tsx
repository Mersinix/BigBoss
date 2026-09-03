import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Bell, Star } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import MaintenanceMessages from "@/pages/maintenance/messages";
import MaintenanceNotifications from "@/pages/maintenance/notifications";
import MaintenanceReviews from "@/pages/maintenance/reviews";

// Communication tab — Messages / Notifications / Avis, each the account's own
// existing page component moved under one switcher. No content duplicated or
// rewritten: same data, same filters, same actions, same unread counts.
export default function MaintenanceCommunication() {
  const { data: unreadMsg } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    queryFn: async () => {
      const r = await fetch("/api/messages/unread-count", { credentials: "include" });
      if (!r.ok) return { count: 0 };
      return r.json();
    },
    refetchInterval: 30000,
  });
  const { data: unreadNotif } = useUnreadNotificationCount("MAINTENANCE");

  return (
    <SubTabSwitcher
      testIdPrefix="maintenance-communication"
      activeTextClass="text-orange-600 dark:text-orange-400"
      tabs={[
        { key: "messages", label: "Messages", icon: MessageCircle, badge: unreadMsg?.count, content: <MaintenanceMessages /> },
        { key: "notifications", label: "Notifications", icon: Bell, badge: unreadNotif?.count, content: <MaintenanceNotifications /> },
        { key: "avis", label: "Avis", icon: Star, content: <MaintenanceReviews /> },
      ]}
    />
  );
}
