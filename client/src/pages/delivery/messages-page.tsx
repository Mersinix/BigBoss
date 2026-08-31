import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { MessagesPanel } from "@/components/messages/messages-panel";

// Shared by Delivery Company (/delivery/messages) and Driver (/driver/messages) — same
// underlying conversations/messages system. The Driver Livraisons map's Message button
// (task Part 4) deep-links here with ?conversationId=&returnTo=deliveries so the Driver can
// jump straight into the relevant Driver↔Supplier/Driver↔Coffee Owner conversation and get
// a "Retour à la livraison" button back to the map — additive, and a no-op for every other
// caller of this page (the button only renders when returnTo is actually present).
export default function DeliveryMessagesPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const conversationId = params.get("conversationId");
  const returnTo = params.get("returnTo");

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Messages</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Chat with café owners and admin about deliveries.</p>
        </div>
        {returnTo === "deliveries" && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/driver/deliveries")} data-testid="button-return-to-delivery">
            <ArrowLeft className="w-3.5 h-3.5" /> Retour à la livraison
          </Button>
        )}
      </div>
      {user && <MessagesPanel currentUserId={user.id} showRoleIndicator service="SHOP" initialConversationId={conversationId ? Number(conversationId) : null} />}
    </div>
  );
}
