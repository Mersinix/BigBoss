import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Bell, Star } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import DeliveryMessagesPage from "@/pages/delivery/messages-page";
import ProviderNotificationsPage from "@/pages/shared/provider-notifications-page";
import DriverReviewsPage from "@/pages/driver/reviews";

// Communication tab — Messages / Notifications / Avis, each the account's own
// existing page component moved under one switcher. No content duplicated or
// rewritten: same data, same filters, same actions, same unread counts.
export default function DriverCommunication() {
  const { data: unreadMsg } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    queryFn: async () => {
      const r = await fetch("/api/messages/unread-count", { credentials: "include" });
      if (!r.ok) return { count: 0 };
      return r.json();
    },
    refetchInterval: 30000,
  });
  const { data: unreadNotif } = useUnreadNotificationCount("SHOP");

  return (
    <SubTabSwitcher
      testIdPrefix="driver-communication"
      activeTextClass="text-blue-600 dark:text-blue-400"
      tabs={[
        { key: "messages", label: "Messages", icon: MessageCircle, badge: unreadMsg?.count, content: <DeliveryMessagesPage /> },
        { key: "notifications", label: "Notifications", icon: Bell, badge: unreadNotif?.count, content: <ProviderNotificationsPage /> },
        { key: "avis", label: "Avis", icon: Star, content: <DriverReviewsPage /> },
      ]}
    />
  );
}
