import { useSupplierPublishedReports } from "@/hooks/use-supplier-reports";
import { SimpleBlacklistModal } from "@/components/shared/simple-blacklist-modal";

// Coffee Owner's Shop Hero "report modal" (task: "Extend the Shared
// Reporting System to Supplier Stores") — a **public**, read-only feed of
// Supplier reports an Admin has explicitly published
// (GET /api/supplier/reports/published). No click-through to a store page
// here, consistent with Academy's own published-reports modal (kept
// simple, not required by the task).
//
// Built on SimpleBlacklistModal (task: "Safely Consolidate the Six
// Blacklist Modal Components into One Shared Component") — Shop has no
// row click-through, so its config/icon/mapRow are now the shared
// SHOP section entry in blacklist-sections.ts instead of being duplicated
// here. headerVariant="centered" (task: "Redesign ShopBlacklistModal
// Header to Match ReportModal Design") stays Shop-only.
export function ShopBlacklistModal({ open, onClose, isDark }: { open: boolean; onClose: () => void; isDark: boolean }) {
  return (
    <SimpleBlacklistModal
      sectionId="SHOP"
      open={open}
      onClose={onClose}
      isDark={isDark}
      usePublishedReports={useSupplierPublishedReports}
      headerVariant="centered"
    />
  );
}
