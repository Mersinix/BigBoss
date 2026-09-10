import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Bell, Star } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import DeliveryMessagesPage from "@/pages/delivery/messages-page";
import ProviderNotificationsPage from "@/pages/shared/provider-notifications-page";
import DeliveryCompanyReviewsPage from "@/pages/delivery/reviews-page";

// Communication tab — Messages / Notifications / Avis, each the account's own
// existing page component moved under one switcher. Avis is real Supplier→Delivery
// Company review data (reviewType='DELIVERY_COMPANY'), not a placeholder — see
// reviews-page.tsx.
export default function DeliveryCommunication() {
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
      testIdPrefix="delivery-communication"
      activeTextClass="text-teal-600 dark:text-teal-400"
      tabs={[
        { key: "messages", label: "Messages", icon: MessageCircle, badge: unreadMsg?.count, content: <DeliveryMessagesPage /> },
        { key: "notifications", label: "Notifications", icon: Bell, badge: unreadNotif?.count, content: <ProviderNotificationsPage /> },
        { key: "avis", label: "Avis", icon: Star, content: <DeliveryCompanyReviewsPage /> },
      ]}
    />
  );
}
