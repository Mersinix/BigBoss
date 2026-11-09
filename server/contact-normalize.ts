// Shared email/phone normalization for "does this contact info already belong to an
// existing account" checks. Extracted out of ProspectingStorage.normalizePhoneForMatch/
// normalizeEmailForMatch (server/storage/domains/prospecting.storage.ts), which was the
// only other place in the codebase doing this — moved here, unchanged, so it has one real
// implementation instead of two independent copies drifting apart. Both suppliers' café
// registration duplicate check (server/storage.ts createSupplierCafeRegistration) and
// Prospecting's account-matching use this.

// Last-8-digits comparison robustly treats +216XXXXXXXX / 216XXXXXXXX / 0XXXXXXXX /
// XXXXXXXX as the same Tunisian number regardless of how either side happened to store it
// (international prefix, trunk 0, spaces/dashes).
export function normalizePhoneForMatch(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null; // too short to reliably match — avoid false positives
  return digits.slice(-8);
}

export function normalizeEmailForMatch(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e || null;
}
