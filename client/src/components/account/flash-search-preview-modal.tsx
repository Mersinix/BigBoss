import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, Zap, Eye } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl, getPreferredImageUrl } from "@/lib/avatar";

// Shared "Aperçu Flash" preview — see docs/flash_all_accounts_audit.md and
// docs/flash_academy_marketing_print_audit.md.
//
// Extends the same visual chrome/label/badge Barista Marketplace's own Flash
// button opens (`BaristaFastSearch` with `previewMode`, see
// barista-fast-search.tsx) to the professional account types whose own
// Coffee-Owner-facing "Fast Search" cannot represent a provider's own
// profile. Maintenance was originally included here too, but its own
// `MaintenanceFastSearch` DOES browse provider profiles (`providers:
// MaintenanceMarketplaceCard[]`, the same shape as Barista's `baristas:
// BaristaMarketplaceCard[]`) — so it was corrected to get a `previewMode`
// extension of its own real component instead (see
// docs/maintenance_flash_modal_audit.md). This file is now used by: Barista
// Academy, Delivery, Driver, Marketing, Printer.
//
// Audited per account (docs/flash_academy_marketing_print_audit.md):
// AcademyFastSearch browses individual COURSES (AcademyCourseCard[]),
// MarketingFastSearch browses individual published SERVICES
// (MarketingServiceCard[] — an agency with zero published services would
// have nothing to preview at all), PrintFastSearch browses catalog PRODUCTS
// (PrintCatalogCard[]) — none of them is "a provider's own profile," so none
// can be meaningfully fed "my own single record." No equivalent component
// exists at all for Delivery/Driver. This single component is the one
// genuinely shared implementation for all five: it needs only
// `name`/`flashImageUrl`/`profileImageUrl`/`typeLabel` — fields every
// account's own Settings already exposes — and renders the same Zap-icon
// header (with the same "X / Y" counter and single-segment progress bar the
// real Fast Search chrome shows), "Aperçu Flash" label, amber "Mode aperçu"
// badge, and Flash→photo→placeholder hero image Barista's/Maintenance's own
// preview use, generalized rather than duplicated per account.
//
// No favorite/info/job-target controls exist here at all (not even
// disabled ones) — unlike BaristaFastSearch's/MaintenanceFastSearch's
// preview mode, there is no swipe set, filter, or hiring action that could
// ever apply to "your own single card" for any of these five accounts, so
// there is nothing to guard against: this component makes zero network
// requests and has zero interactive elements beyond its own close button.
export interface FlashSearchPreviewModalProps {
  open: boolean;
  onClose: () => void;
  name: string;
  typeLabel?: string | null;
  flashImageUrl?: string | null;
  profileImageUrl?: string | null;
  // Full Tailwind class string, passed whole (never interpolated) so
  // Tailwind's JIT scanner sees the literal class — same convention as
  // FlashPreviewModal's own accentBgClass.
  accentBgClass: string;
}

export function FlashSearchPreviewModal({
  open, onClose, name, typeLabel, flashImageUrl, profileImageUrl, accentBgClass,
}: FlashSearchPreviewModalProps) {
  const [flashFailed, setFlashFailed] = useState(false);
  useEffect(() => { setFlashFailed(false); }, [flashImageUrl, profileImageUrl]);

  // Shared Flash (URL) > Photo de profil (URL) priority (client/src/lib/avatar.ts,
  // flash_image_sync_audit.md) — identical logic to BaristaFastSearch/FlashPreviewModal.
  const preferredImageUrl = getPreferredImageUrl(flashImageUrl, profileImageUrl);
  const heroImageSrc = !flashFailed && preferredImageUrl ? preferredImageUrl : getAvatarUrl({ profileImageUrl });
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 border-0 w-[92vw] max-w-lg h-[90vh] rounded-3xl bg-black overflow-hidden">
        <div className="relative w-full h-full flex flex-col select-none overflow-hidden">
          {/* Header — same convention as BaristaFastSearch's/MaintenanceFastSearch's
              previewMode header, including the "1 / 1" counter (there is always
              exactly one card here — the authenticated professional's own —
              but the counter/progress-bar row below are kept for the same
              structural rhythm as the real Fast Search chrome). */}
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 pt-4 pb-3 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-green-400 fill-green-400" />
              <span className="text-white font-bold text-sm">Aperçu Flash</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white/60 text-xs">1 / 1</span>
              <button
                className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
                onClick={onClose}
                aria-label="Fermer"
                data-testid="button-flashsearch-preview-close"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Mode aperçu badge — same amber pill as BaristaFastSearch's own previewMode badge. */}
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-amber-500/90 backdrop-blur-sm text-white text-[11px] font-semibold px-3 py-1.5 rounded-full" data-testid="badge-flashsearch-preview">
            <Eye className="w-3 h-3" /> Mode aperçu — Aperçu Flash
          </div>

          {/* Progress bar — same single-segment row the real Fast Search chrome
              renders for a one-item result set. */}
          <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 60px)" }}>
            <div className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
              <div className="h-full w-full bg-white transition-all duration-300" />
            </div>
          </div>

          {/* Hero image — Flash (URL) first, Photo de profil (URL) fallback,
              initials placeholder beyond that (via AvatarFallback). */}
          <div className="relative flex-1 bg-gray-900 overflow-hidden">
            <Avatar className="w-full h-full rounded-none">
              <AvatarImage
                key={flashFailed ? "fallback" : "preferred"}
                src={heroImageSrc}
                alt={name}
                className="object-cover"
                onLoadingStatusChange={(status) => { if (status === "error" && !flashFailed && preferredImageUrl) setFlashFailed(true); }}
              />
              <AvatarFallback className="rounded-none bg-gradient-to-br from-green-900 to-emerald-950">
                <span className="text-white/80 font-bold text-6xl">{initials}</span>
              </AvatarFallback>
            </Avatar>

            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

            <div className="absolute inset-x-0 bottom-0 px-5 pb-6 pointer-events-none">
              {typeLabel && (
                <span className={`inline-block mb-1.5 text-[11px] font-semibold text-white px-2.5 py-1 rounded-full ${accentBgClass}`}>
                  {typeLabel}
                </span>
              )}
              <h2 className="text-white font-bold text-xl leading-tight" data-testid="text-flashsearch-preview-name">{name}</h2>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
