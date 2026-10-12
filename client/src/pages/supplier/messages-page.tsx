import { useAuth } from "@/hooks/use-auth";
import { MessagesPanel } from "@/components/messages/messages-panel";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { SupplierCommunicationSwitcher } from "@/components/supplier/supplier-communication-switcher";

export default function SupplierMessagesPage() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Messages"
        subtitle="Chat with your café customers and support."
      />
      <SupplierCommunicationSwitcher />
      {user && <MessagesPanel currentUserId={user.id} showRoleIndicator standardizedCloseButton />}
    </div>
  );
}
