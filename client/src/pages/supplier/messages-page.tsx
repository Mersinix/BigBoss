import { useAuth } from "@/hooks/use-auth";
import { MessagesPanel } from "@/components/messages/messages-panel";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

export default function SupplierMessagesPage() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Messages"
        subtitle="Chat with your café customers and support."
      />
      {user && <MessagesPanel currentUserId={user.id} showRoleIndicator />}
    </div>
  );
}
