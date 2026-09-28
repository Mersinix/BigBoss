// Shared imperative handle every unified-save Settings card exposes via
// forwardRef, so a page-level "Enregistrer" button can trigger each section's
// own existing save logic without owning its internal form state. save()
// resolves as a no-op when the section has no pending edits, and throws on
// failure so the caller's Promise.allSettled can report per-section results
// without one failing section blocking or discarding the others.
export interface SettingsCardHandle {
  save(): Promise<void>;
}
