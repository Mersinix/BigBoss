import { useAuth } from "@/hooks/use-auth";
import { MessagesPanel } from "@/components/messages/messages-panel";

export default function DeliveryMessagesPage() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Messages</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Chat with café owners and admin about deliveries.</p>
      </div>
      {user && <MessagesPanel currentUserId={user.id} showRoleIndicator />}
    </div>
  );
}
