import { User, ClipboardList } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import MaintenanceProfilePage from "@/pages/maintenance/profile";
import MaintenancePlanningPage from "@/pages/maintenance/planning";

// Business tab — Profil / Planning, each the account's own existing page
// component moved under one switcher (same mechanism as the Barista
// Marketplace's Business tab and every account's Communication tab, see
// sub-tab-switcher.tsx). No content duplicated or rewritten: same data,
// statuses, actions and synchronization as before — only the main navigation
// entry point changed (these were two separate top-level tabs; now one
// "Business" tab with a deep-linkable ?tab= sub-switcher).
export default function MaintenanceBusiness() {
  return (
    <SubTabSwitcher
      testIdPrefix="maintenance-business"
      activeTextClass="text-orange-600 dark:text-orange-400"
      tabs={[
        { key: "profile", label: "Profil", icon: User, content: <MaintenanceProfilePage /> },
        { key: "planning", label: "Planning", icon: ClipboardList, content: <MaintenancePlanningPage /> },
      ]}
    />
  );
}
