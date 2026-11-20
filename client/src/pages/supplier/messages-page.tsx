import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { MessagesPanel } from "@/components/messages/messages-panel";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { SupplierCommunicationSwitcher } from "@/components/supplier/supplier-communication-switcher";
import { useSupplierTabSettings, communicationRedirectTarget } from "@/hooks/use-supplier-tab-settings";

export default function SupplierMessagesPage() {
  const { user } = useAuth();
  // Admin → System Management → Supplier → Onglet's "Visibilité de l'onglet
  // Communication" group — redirect to another enabled Communication tab (or a
  // safe Supplier page) if Messages is currently disabled.
  const { settings: communicationSettings } = useSupplierTabSettings();
  const redirectTo = communicationRedirectTarget(communicationSettings, "/supplier/messages");
  if (redirectTo) {
    return <Redirect to={redirectTo} />;
  }
  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Messages"
        subtitle="Discutez avec vos clients cafés et le support."
      />
      <SupplierCommunicationSwitcher />
      {user && <MessagesPanel currentUserId={user.id} showRoleIndicator standardizedCloseButton />}
    </div>
  );
}
