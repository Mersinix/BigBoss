import { User, ClipboardList, Wrench, Award } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import MaintenanceProfilePage from "@/pages/maintenance/profile";
import MaintenancePlanningPage from "@/pages/maintenance/planning";
import MaintenanceInterventionsPage from "@/pages/maintenance/interventions";
import MaintenanceCompetenciesPage from "@/pages/maintenance/competencies";

// Business tab — Profil / Planning / Interventions / Compétences, each the
// account's own existing page component moved under one switcher (same
// mechanism as the Barista Marketplace's Business tab and every account's
// Communication tab, see sub-tab-switcher.tsx). No content duplicated or
// rewritten: same data, statuses, actions and synchronization as before —
// only the main navigation entry point changed (these were two separate
// top-level tabs; now one "Business" tab with a deep-linkable ?tab=
// sub-switcher). "Interventions" is new (docs/maintenance_interventions_implementation_audit.md
// Section 7) — discover/respond to Coffee Owner-published interventions; an
// accepted response appears as a real reservation in the existing Planning
// tab, untouched by this addition. "Compétences" is new too — the
// "Spécialités & Compétences" card that used to live inside Profil
// (pages/maintenance/competencies.tsx) moved here verbatim (same state, same
// GET/PATCH /api/maintenance/profile + /api/maintenance/taxonomy), so Profil
// no longer renders it at all (no duplicate skills UI/source of truth).
export default function MaintenanceBusiness() {
  return (
    <SubTabSwitcher
      testIdPrefix="maintenance-business"
      activeTextClass="text-orange-600 dark:text-orange-400"
      tabs={[
        { key: "profile", label: "Profil", icon: User, content: <MaintenanceProfilePage /> },
        { key: "planning", label: "Planning", icon: ClipboardList, content: <MaintenancePlanningPage /> },
        { key: "interventions", label: "Interventions", icon: Wrench, content: <MaintenanceInterventionsPage /> },
        { key: "competencies", label: "Compétences", icon: Award, content: <MaintenanceCompetenciesPage /> },
      ]}
    />
  );
}
