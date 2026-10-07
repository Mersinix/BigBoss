// Single shared Marketing category icon source — originally lived only inside
// marketing-page.tsx's own category filter strip; now the one place both
// /marketing and /marketing/stores/:agencyId resolve a category's icon from,
// so neither page ever invents a second icon mapping
// (docs/marketing_cards_final_layout_synchronization_audit.md).

// Emoji icon per known default category — falls back to the taxonomy's own
// `icon` field (admin-set) or a generic 📢 for anything else, so a new
// Admin-added category never breaks either page.
export const MARKETING_CATEGORY_ICON_FALLBACK: Record<string, string> = {
  Website: "🌐", SEO: "🔍", Ads: "📢", Social: "📱", "Vidéo": "🎥", Photo: "📸", Branding: "🎨",
};

export function resolveMarketingCategoryIcon(
  categoryName: string,
  taxonomy: { name: string; icon?: string | null }[],
): string {
  const match = taxonomy.find((c) => c.name === categoryName);
  return match?.icon || MARKETING_CATEGORY_ICON_FALLBACK[categoryName] || "📢";
}
