import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { ClipboardList, Newspaper, UserCheck } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import BaristaMarketplaceMissionsHubPage from "@/pages/barista-marketplace/missions-hub";
import BaristaMarketplaceJobsPage from "@/pages/barista-marketplace/jobs";
import BaristaProfilePage from "@/pages/barista-marketplace/profile";

// Business tab — Profil / Missions / Offres, each the account's own existing
// page component under one switcher (same mechanism as the Communication
// tab's Messages/Notifications/Avis switcher, see communication.tsx).
// "Missions" is the consolidated hub (missions-hub.tsx): mission job posts
// plus the legacy Demandes + Missions workflows, embedded unchanged under
// "Mes Missions". "Offres" stays its own separate tab.
//
// Legacy deep links: App.tsx still redirects /barista-marketplace/requests to
// ?tab=requests (and /missions to ?tab=missions, which remains a valid key).
// `requests` is no longer a tab, so it is aliased here to the Missions hub's
// "Mes Missions" view instead of silently falling back to the Profil tab.
export default function BaristaMarketplaceBusiness() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const isLegacyRequestsLink = new URLSearchParams(search).get("tab") === "requests";

  useEffect(() => {
    if (!isLegacyRequestsLink) return;
    const params = new URLSearchParams(search);
    params.set("tab", "missions");
    params.set("view", "mine");
    navigate(`${location}?${params.toString()}`, { replace: true });
  }, [isLegacyRequestsLink]);

  if (isLegacyRequestsLink) return null;

  return (
    <SubTabSwitcher
      testIdPrefix="barista-business"
      activeTextClass="text-green-600 dark:text-green-400"
      tabs={[
        { key: "profile", label: "Profil", icon: UserCheck, content: <BaristaProfilePage /> },
        { key: "missions", label: "Missions", icon: ClipboardList, content: <BaristaMarketplaceMissionsHubPage /> },
        { key: "jobs", label: "Offres", icon: Newspaper, content: <BaristaMarketplaceJobsPage /> },
      ]}
    />
  );
}
