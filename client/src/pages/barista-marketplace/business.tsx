import { Briefcase, ClipboardList, UserCheck } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import BaristaMarketplaceRequestsPage from "@/pages/barista-marketplace/requests";
import BaristaMarketplaceMissionsPage from "@/pages/barista-marketplace/missions";
import BaristaProfilePage from "@/pages/barista-marketplace/profile";

// Business tab — Demandes / Missions / Profil, each the account's own existing
// page component moved under one switcher (same mechanism as the Communication
// tab's Messages/Notifications/Avis switcher, see communication.tsx). No
// content duplicated or rewritten: same data, statuses, actions and
// synchronization as before — only the main navigation entry point changed
// (these were three separate top-level tabs; now one "Business" tab with a
// deep-linkable ?tab= sub-switcher).
export default function BaristaMarketplaceBusiness() {
  return (
    <SubTabSwitcher
      testIdPrefix="barista-business"
      activeTextClass="text-green-600 dark:text-green-400"
      tabs={[
        { key: "requests", label: "Demandes", icon: Briefcase, content: <BaristaMarketplaceRequestsPage /> },
        { key: "missions", label: "Missions", icon: ClipboardList, content: <BaristaMarketplaceMissionsPage /> },
        { key: "profile", label: "Profil", icon: UserCheck, content: <BaristaProfilePage /> },
      ]}
    />
  );
}
