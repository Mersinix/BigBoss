import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Bell, Star } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import MarketingMessages from "@/pages/marketing/messages";
import ProviderNotificationsPage from "@/pages/shared/provider-notifications-page";
import MarketingReviewsPage from "@/pages/marketing/reviews";

// Communication tab — Messages / Notifications / Avis, each the account's own
// existing page component moved under one switcher (Part 2). No content was
// duplicated or rewritten: same data, same filters, same actions, same unread
// counts — just reorganized under a single main tab.
export default function MarketingCommunication() {
  const { data: unreadMsg } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    queryFn: async () => {
      const r = await fetch("/api/messages/unread-count", { credentials: "include" });
      if (!r.ok) return { count: 0 };
      return r.json();
    },
    refetchInterval: 30000,
  });
  const { data: unreadNotif } = useUnreadNotificationCount("MARKETING");

  return (
    <SubTabSwitcher
      testIdPrefix="marketing-communication"
      activeTextClass="text-fuchsia-600 dark:text-fuchsia-400"
      tabs={[
        { key: "messages", label: "Messages", icon: MessageCircle, badge: unreadMsg?.count, content: <MarketingMessages /> },
        { key: "notifications", label: "Notifications", icon: Bell, badge: unreadNotif?.count, content: <ProviderNotificationsPage /> },
        { key: "avis", label: "Avis", icon: Star, content: <MarketingReviewsPage /> },
      ]}
    />
  );
}
