import { useAuth } from "@/hooks/use-auth";
import { MessagesPanel } from "@/components/messages/messages-panel";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

export default function SupplierMessagesPage() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-6 p-6">
      <DashboardHero
        title="Messages"
        subtitle="Chat with your café customers and support."
      />
      {user && <MessagesPanel currentUserId={user.id} showRoleIndicator />}
    </div>
  );
}
