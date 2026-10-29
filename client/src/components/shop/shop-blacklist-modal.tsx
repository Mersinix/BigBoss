import { Ban } from "lucide-react";
import { useSupplierPublishedReports } from "@/hooks/use-supplier-reports";
import { EntityPublishedReportsModal } from "@/components/shared/entity-published-reports-modal";

// Coffee Owner's Shop Hero "report modal" (task: "Extend the Shared
// Reporting System to Supplier Stores") — a **public**, read-only feed of
// Supplier reports an Admin has explicitly published
// (GET /api/supplier/reports/published). Built on the same
// EntityPublishedReportsModal shell every other service uses (grabber,
// swipe-to-dismiss, pagination and refetch-on-open already included). No
// click-through to a store page here, consistent with Academy's own
// published-reports modal (kept simple, not required by the task).
export function ShopBlacklistModal({ open, onClose, isDark }: { open: boolean; onClose: () => void; isDark: boolean }) {
  return (
    <EntityPublishedReportsModal
      open={open}
      onClose={onClose}
      isDark={isDark}
      title="Fournisseurs signalés"
      subtitle="Signalements publiés par l'équipe Admin concernant des fournisseurs."
      icon={
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-red-900/40" : "bg-red-100"}`}>
          <Ban className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-600"}`} />
        </div>
      }
      usePublishedReports={useSupplierPublishedReports}
      mapRow={(r: any) => ({
        id: r.id, professionalId: r.supplierId, professionalName: r.supplierName, professionalImageUrl: r.supplierProfileImageUrl,
        rating: r.rating, comment: r.reason, createdAt: r.createdAt, publishedAt: r.resolvedAt,
      })}
      accentClassName={isDark ? "text-amber-400" : "text-amber-600"}
    />
  );
}
