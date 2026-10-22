import { useCallback, useState, type CSSProperties, type SyntheticEvent } from "react";

// Shared progressive image-crop model (task: "Admin Product Management:
// Simplified List View and Progressive Image Cropping Controls"). A single
// 0-100 percentage per image — persisted server-side, keyed by the image's
// own URL (see products.imageAdjustments) — is the one source of truth for
// how tightly a mapped product's image is cropped, used identically by the
// Admin preview and every Coffee Owner view that renders the same image.

export type ImageAdjustmentMap = Record<string, number>;

// Deliberate, documented maximum-crop definition for the 100% endpoint:
// 50% of additional zoom beyond the point where the image would already
// exactly fill ("cover") the container on its constraining axis. This is a
// bounded, intentional choice — not an arbitrary zoom factor — chosen so
// the tightest crop still keeps the bulk of the image's content in frame
// instead of zooming in indefinitely.
export const MAX_EXTRA_ZOOM_BEYOND_COVER = 1.5;

/** Clamps/validates any input to a safe integer 0-100, defaulting to 0
 *  (full image, no crop) for anything non-numeric or out of range. Used
 *  both client-side (slider) and as the shape server-side validation
 *  enforces before persisting. */
export function clampAdjustmentPct(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Computes the CSS scale factor for a given crop percentage:
 * - 0%   -> 1 (the baseline `object-fit: contain` rendering — the entire
 *           original image, letterboxed if needed, never pre-cropped).
 * - 100% -> coverScale * MAX_EXTRA_ZOOM_BEYOND_COVER (the documented max).
 * `coverScale` is derived from the image's REAL natural aspect ratio
 * against the container's aspect ratio, so portrait, landscape, and
 * square images are all handled correctly without distortion (scale is
 * uniform, contain never stretches).
 */
export function computeAdjustScale(pct: number, imageAspect: number | null, containerAspect = 1): number {
  const safePct = clampAdjustmentPct(pct);
  if (safePct <= 0 || !imageAspect || !Number.isFinite(imageAspect) || imageAspect <= 0 || !Number.isFinite(containerAspect) || containerAspect <= 0) {
    return 1;
  }
  const coverScale = Math.max(imageAspect / containerAspect, containerAspect / imageAspect);
  const maxScale = coverScale * MAX_EXTRA_ZOOM_BEYOND_COVER;
  return 1 + (safePct / 100) * (maxScale - 1);
}

/**
 * For a surface that already renders the image via `object-fit: cover`
 * inside a fixed-aspect box — true of most Coffee Owner product cards and
 * galleries today, independent of any adjustment — returns just the extra
 * zoom-in factor for a given pct: 1 at 0% (identical to today's unadjusted
 * rendering, so existing layouts are untouched for every product that has
 * no saved adjustment) up to MAX_EXTRA_ZOOM_BEYOND_COVER at 100%. This
 * reuses the same documented bound as `computeAdjustScale` but needs no
 * natural-aspect-ratio tracking, since a `cover` box is already filled
 * regardless of the image's own aspect ratio.
 */
export function computeCoverZoomScale(pct: number): number {
  const safePct = clampAdjustmentPct(pct);
  return 1 + (safePct / 100) * (MAX_EXTRA_ZOOM_BEYOND_COVER - 1);
}

/**
 * Wrapper-only style for an already-`cover`-fitted image: apply
 * `wrapperStyle` to an intermediate `<div>` around the existing `<img>`,
 * leaving the `<img>`'s own classes (including any pre-existing
 * hover-transform effect) completely untouched — the two transforms
 * compose instead of one overwriting the other.
 */
export function useCoverZoomStyle(pct: number): { wrapperStyle: CSSProperties } {
  const scale = computeCoverZoomScale(pct);
  return {
    wrapperStyle: {
      width: "100%",
      height: "100%",
      transform: `scale(${scale})`,
      transformOrigin: "center",
      transition: "transform 150ms ease-out",
    },
  };
}

/** Looks up a saved percentage for a given image URL, defaulting to 0 for
 *  any URL without a saved entry (pre-existing products, or a newly added
 *  image that hasn't been adjusted yet). */
export function getAdjustmentFor(map: ImageAdjustmentMap | null | undefined, url: string | null | undefined): number {
  if (!url) return 0;
  return clampAdjustmentPct(map?.[url]);
}

/**
 * Shared hook: tracks the loaded image's real aspect ratio and returns
 * ready-to-spread styles.
 *
 * `wrapperStyle` carries the crop `transform: scale(...)` and is meant for
 * an intermediate container directly wrapping the `<img>` — not the `<img>`
 * itself — so a caller whose `<img>` already has its own transform-based
 * effect (e.g. an existing hover-zoom) can keep it on the image unchanged;
 * the wrapper's crop scale and the image's own effect compose naturally
 * instead of one overwriting the other.
 *
 * `imgStyle` sets `object-fit: contain` as the baseline (never a plain
 * `cover`, which would already crop a non-square image even before any
 * admin adjustment is applied).
 */
export function useImageAdjustStyle(pct: number, containerAspect = 1) {
  const [imageAspect, setImageAspect] = useState<number | null>(null);

  const onLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setImageAspect(img.naturalWidth / img.naturalHeight);
    }
  }, []);

  const scale = computeAdjustScale(pct, imageAspect, containerAspect);

  const wrapperStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    transform: `scale(${scale})`,
    transformOrigin: "center",
    transition: "transform 150ms ease-out",
  };
  const imgStyle: CSSProperties = { width: "100%", height: "100%", objectFit: "contain" };

  return { wrapperStyle, imgStyle, onLoad, imageAspect };
}
