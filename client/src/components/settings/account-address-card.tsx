import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { MapPin } from "lucide-react";
import { AddressDetailsFields } from "@/components/settings/address-details-fields";

// Unified "Localisation" section (Part 6) — replaces the owner-side map modal
// with a static address-details form for every professional account, and now
// Supplier (Part 6 of the address-synchronization task). IMPORTANT split:
// users.locationAddress/locationLat/locationLng (the official geocoded pin)
// stay exclusively Admin-authoritative, set only via the existing map-based
// LocationPickerModal in Admin's own UI (untouched by this component) — the
// shared AddressDetailsFields form only ever edits users.locationDetails
// (street/building number/postal code/governorate/municipality/building
// type/apartment/floor/door/notes), through the same generic
// PATCH /api/auth/me/profile endpoint, never the lat/lng-requiring
// PATCH /api/auth/me/location route. Distance calculations, "Ville" display
// and every marketplace/Admin location representation keep reading the
// Admin-set locationAddress/lat/lng exactly as before — nothing here can
// change those. Coffee Owner uses the same AddressDetailsFields body, just
// Dialog-wrapped instead of SectionCard-wrapped — see AddressDetailsModal.
export function AccountAddressCard({ accentClassName = "" }: { accentClassName?: string }) {
  return (
    <SectionCard title="Localisation" icon={MapPin}>
      <AddressDetailsFields accentClassName={accentClassName} />
    </SectionCard>
  );
}
