import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin } from "lucide-react";
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
      <DialogContent className={`sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl ${dk ? "bg-gray-900 border-gray-800" : ""}`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${dk ? "text-white" : ""}`}><MapPin className="w-4 h-4 text-amber-500" /> Localisation</DialogTitle>
        </DialogHeader>
        <AddressDetailsFields onSaved={onClose} isDark={dk} />
      </DialogContent>
    </Dialog>
  );
}
