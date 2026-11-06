import { useThemeStore } from "@/store/theme-store";
import { useAcademyPublishedReports } from "@/hooks/use-academy-reports";
import { SimpleBlacklistModal } from "@/components/shared/simple-blacklist-modal";

// Coffee Owner's Academy Hero "report modal" (task: "Extend the Shared
// Reporting System to Print, Academy, and Marketing") — a **public**,
// read-only feed of reports an Admin has explicitly published
// (GET /api/academy/reports/published), replacing the previous "my own
// submitted reports" view. No submission UI here; the Academy detail
// modal's own Signaler is the sole report-submission entry point. No
// click-through to a detail modal (preserved from the previous
// implementation's own stated decision: an Academy account isn't a single
// browsable "profile" here — its formations are — so this stays a
// read-only list, consistent with the entity being reported).
//
// Built on SimpleBlacklistModal (task: "Safely Consolidate the Six
// Blacklist Modal Components into One Shared Component") — Academy has no
// row click-through, so its config/icon/mapRow are now the shared ACADEMY
// section entry in blacklist-sections.ts instead of being duplicated here.
// isDark stays internal (own useThemeStore read, same as before) since
// no other part of this task requires changing this component's external
// prop signature. headerVariant="centered" (task: "Unify the Design of All
// Six Blacklist Modals") matches this modal's header to Shop's, the
// approved visual reference.
export function AcademyBlacklistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isDark = useThemeStore((s) => s.isDark);

  return (
    <SimpleBlacklistModal
      sectionId="ACADEMY"
      open={open}
      onClose={onClose}
      isDark={isDark}
      usePublishedReports={useAcademyPublishedReports}
      headerVariant="centered"
    />
  );
}
