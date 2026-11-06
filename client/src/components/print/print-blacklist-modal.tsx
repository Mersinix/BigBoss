import { usePrintPublishedReports } from "@/hooks/use-print-reports";
import { SimpleBlacklistModal } from "@/components/shared/simple-blacklist-modal";

// Coffee Owner's Print Hero "report modal" (task: "Extend the Shared
// Reporting System to Print, Academy, and Marketing") — a **public**,
// read-only feed of reports an Admin has explicitly published
// (GET /api/print/reports/published). No click-through to the company
// detail modal here (none existed before this task either — /print's own
// hero flow always browsed printers via print-detail-page.tsx, not a
// shared per-row detail modal), kept exactly as-is to avoid widening scope.
//
// Built on SimpleBlacklistModal (task: "Safely Consolidate the Six
// Blacklist Modal Components into One Shared Component") — Print has no
// row click-through, so its config/icon/mapRow are now the shared PRINT
// section entry in blacklist-sections.ts instead of being duplicated here.
// headerVariant="centered" (task: "Unify the Design of All Six Blacklist
// Modals") matches this modal's header to Shop's, the approved visual
// reference.
export function PrintBlacklistModal({ open, onClose, isDark }: { open: boolean; onClose: () => void; isDark: boolean }) {
  return (
    <SimpleBlacklistModal
      sectionId="PRINT"
      open={open}
      onClose={onClose}
      isDark={isDark}
      usePublishedReports={usePrintPublishedReports}
      headerVariant="centered"
    />
  );
}
