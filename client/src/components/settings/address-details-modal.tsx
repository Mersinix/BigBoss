import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, X } from "lucide-react";
import { AddressDetailsFields } from "@/components/settings/address-details-fields";
import { useThemeStore } from "@/store/theme-store";

// Modal-wrapped variant of the shared address-details form (Part 7 of the
// address/location synchronization task) — used by Coffee Owner's own
// "Modifier l'adresse" button, replacing the old map-based LocationPickerModal
// there (which let the Coffee Owner drag the pin and overwrite the official
// coordinates — exactly what this task forbids). Same AddressDetailsFields
// body/save path as AccountAddressCard (every service account's inline
// Settings → Localisation), just Dialog-wrapped: one implementation, two
// chrome variants, never two competing address systems.
export function AddressDetailsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dk = useThemeStore((s) => s.isDark);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        hideClose
        className={`sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full ${dk ? "bg-gray-900 border-gray-800" : ""}`}
      >
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle className={`flex items-center gap-2 ${dk ? "text-white" : ""}`}><MapPin className="w-4 h-4 text-amber-500" /> Localisation</DialogTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500"}`}
            data-testid="button-close-address-details-modal"
          >
            <X className="w-4 h-4" />
          </button>
        </DialogHeader>
        <AddressDetailsFields onSaved={onClose} isDark={dk} />
      </DialogContent>
    </Dialog>
  );
}
