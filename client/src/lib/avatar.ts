// Single source of truth for resolving a user's profile picture, so every
// screen that renders an Avatar falls back to the same default image instead
// of each maintaining its own placeholder. Self-contained data URI — no
// network request, so it renders instantly and never has a "broken image" case.
// export const DEFAULT_AVATAR_URL =
//   "data:image/svg+xml;charset=UTF-8," +
//   encodeURIComponent(
//     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#CBD5E1"/><circle cx="32" cy="25" r="12" fill="#94A3B8"/><path d="M10 55c2.5-13 12.5-19.5 22-19.5S51.5 42 54 55" fill="#94A3B8"/></svg>`
//   );
export const DEFAULT_AVATAR_URL = "https://www.citypng.com/public/uploads/preview/hd-man-user-illustration-icon-transparent-png-701751694974843ybexneueic.png"

export function getAvatarUrl(user?: { profileImageUrl?: string | null } | null): string {
  return user?.profileImageUrl?.trim() || DEFAULT_AVATAR_URL;
}

// Treats "", whitespace-only, null and undefined identically as "missing" —
// shared by every Flash/photo priority check below so empty-string values
// (e.g. a cleared Settings field) are never mistaken for a real URL.
export function normalizeImageUrl(url?: string | null): string | null {
  const trimmed = url?.trim();
  return trimmed ? trimmed : null;
}

// Shared Flash (URL) > Photo de profil (URL) priority (flash_image_sync_audit.md)
// — used identically by BaristaFastSearch (Coffee Owner's Fast Search) and
// FlashPreviewModal (every professional account's own "Flash" preview
// button), so the two surfaces can never silently disagree about which real
// image wins. Returns null when neither is set; each caller keeps its own
// existing final placeholder/empty-state for that case (this function only
// decides which REAL candidate URL to try first — broken-image retry state
// stays with the caller, since the two components render this differently).
export function getPreferredImageUrl(
  flashImageUrl?: string | null,
  profileImageUrl?: string | null,
): string | null {
  return normalizeImageUrl(flashImageUrl) ?? normalizeImageUrl(profileImageUrl);
}
