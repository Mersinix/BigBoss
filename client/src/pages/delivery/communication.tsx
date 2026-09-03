import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Bell, Star } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import { PerformanceEmptyState } from "@/components/account/performance-empty-state";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import DeliveryMessagesPage from "@/pages/delivery/messages-page";
import ProviderNotificationsPage from "@/pages/shared/provider-notifications-page";

// Communication tab — Messages / Notifications / Avis. Delivery Companies
// have no dedicated reviews system today (deliveries are assigned, never
// rated by Coffee Owners in this app), so Avis shows a real empty state
// rather than fabricated reviews.
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
        {
          key: "avis", label: "Avis", icon: Star,
          content: <PerformanceEmptyState icon={Star} message="Aucun avis pour le moment — les livraisons ne sont pas encore notées par les Coffee Owners." />,
        },
      ]}
    />
  );
}
