import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { MessagesPanel } from "@/components/messages/messages-panel";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

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
    <div className="flex flex-col gap-6">
      <DashboardHero
        title="Messages"
        subtitle="Discutez avec les cafés et l'administration au sujet des livraisons."
        icon={MessageCircle}
        gradientClass={user?.role === "DRIVER" ? "bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20" : "bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent border-teal-500/20"}
        iconBgClass={user?.role === "DRIVER" ? "bg-blue-500/15" : "bg-teal-500/15"}
        iconTextClass={user?.role === "DRIVER" ? "text-blue-600 dark:text-blue-400" : "text-teal-600 dark:text-teal-400"}
        action={returnTo === "deliveries" ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/driver/deliveries")} data-testid="button-return-to-delivery">
            <ArrowLeft className="w-3.5 h-3.5" /> Retour à la livraison
          </Button>
        ) : undefined}
      />
      {user && <MessagesPanel currentUserId={user.id} showRoleIndicator service="SHOP" initialConversationId={conversationId ? Number(conversationId) : null} className={CARD_CLASS} />}
    </div>
  );
}
