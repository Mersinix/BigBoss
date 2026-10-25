import { useEffect, useRef, useState } from "react";

// ── Scroll-direction dismissal ────────────────────────────────────────────
// Whenever the modal's body is pinned at the top (scrollTop <= 0 — true
// right when it opens, and again any time the user scrolls back up to the
// top), continuing to scroll or swipe upward from there (an extra "pull"
// past the top edge, where there's nothing left to reveal) dismisses the
// modal — same gesture mobile sheets use for swipe-to-dismiss. This covers
// both scrolling down then back up then up again, AND swiping/scrolling up
// immediately on open with no prior downward scroll — the same mechanism,
// just two ways of reaching "pinned at the top." The accumulated-pull
// thresholds (not a down-then-up precondition) are what filter out small/
// unintended movements.
//
// Originally built for the Pack Detail Modal (pack-quick-view-modal.tsx) and
// extracted here so every other modal that needs it can reuse the exact same
// detection + dismissal timing instead of a second, drifting copy.
const DISMISS_THRESHOLD = 70;
const PULL_RESET_MS = 500;
// Slide-down dismiss animation duration — the caller's dismissContentStyle /
// dismissOverlayStyle transitions use this same value, so onDismiss (clearing
// the owning store's open state / unmounting) only fires once the modal has
// visually left the screen.
export const SCROLL_DISMISS_ANIM_MS = 720;

export function useScrollDismiss(
  isOpen: boolean,
  onDismiss: () => void,
  // Optional — overrides the slide-down animation duration for this caller
  // only. Defaults to SCROLL_DISMISS_ANIM_MS, so every existing caller that
  // omits this keeps the exact same timing as before.
  animMs: number = SCROLL_DISMISS_ANIM_MS,
) {
  const pullAccumRef = useRef(0);
  const lastPullTimeRef = useRef(0);
  const pinnedStartYRef = useRef<number | null>(null);
  const isDismissingRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    // Reset gesture state only on the OPEN transition, never on close — if we
    // reset on every change, onDismiss() clearing the owning open state would
    // flip isDismissing back to false mid-unmount and the modal would flash
    // back to full opacity/centered for a frame before actually disappearing.
    if (isOpen && !wasOpenRef.current) {
      pullAccumRef.current = 0;
      pinnedStartYRef.current = null;
      isDismissingRef.current = false;
      setIsDismissing(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  // Shared, animated close path — used internally by the scroll/swipe
  // gesture below, and returned so any other dismissal trigger (Close
  // button, backdrop click, Escape) can go through the exact same slide-down
  // + fade instead of calling onDismiss directly, which would unmount the
  // modal's content before the exit animation finishes. The isDismissingRef
  // guard already prevents a second call from resetting or overlapping an
  // animation already in progress.
  const requestDismiss = () => {
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;
    setIsDismissing(true);
    dismissTimerRef.current = setTimeout(() => {
      onDismiss();
    }, animMs);
  };

  const onBodyWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (isDismissingRef.current) return;
    const el = e.currentTarget;
    if (el.scrollTop > 0) {
      pullAccumRef.current = 0;
      return;
    }
    // Pinned at the top — true right when the modal opens, and again any
    // time the user scrolls back up to it — only further upward wheel ticks
    // from here count as the dismiss gesture, regardless of how we got here.
    const now = Date.now();
    if (now - lastPullTimeRef.current > PULL_RESET_MS) pullAccumRef.current = 0;
    lastPullTimeRef.current = now;
    if (e.deltaY < 0) {
      pullAccumRef.current += Math.abs(e.deltaY);
      if (pullAccumRef.current >= DISMISS_THRESHOLD) {
        pullAccumRef.current = 0;
        requestDismiss();
      }
    } else if (e.deltaY > 0) {
      pullAccumRef.current = 0;
    }
  };

  const onBodyTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isDismissingRef.current) return;
    const el = e.currentTarget;
    pinnedStartYRef.current = el.scrollTop <= 0 ? e.touches[0].clientY : null;
  };

  const onBodyTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isDismissingRef.current) return;
    const el = e.currentTarget;
    const y = e.touches[0].clientY;
    if (el.scrollTop > 0) {
      pinnedStartYRef.current = null;
      return;
    }
    if (pinnedStartYRef.current == null) {
      // Just arrived at the top this gesture — start measuring the extra pull from here,
      // not from wherever the finger started (which may have been mid-content).
      pinnedStartYRef.current = y;
      return;
    }
    const dy = y - pinnedStartYRef.current;
    if (dy > DISMISS_THRESHOLD) {
      pinnedStartYRef.current = null;
      requestDismiss();
    }
  };

  const onBodyTouchEnd = () => {
    pinnedStartYRef.current = null;
  };

  // Slides the whole card down past the bottom edge and fades it out, with the
  // backdrop fading in sync (via the consumer's `overlayStyle` prop — see
  // client/src/components/ui/dialog.tsx), instead of vanishing instantly.
  // Applies to every dismissal path that goes through requestDismiss (the
  // gesture, and whatever else the caller wires to it) — a caller that still
  // calls onDismiss directly instead (bypassing requestDismiss) keeps using
  // its own default close animation, unaffected by this.
  const dismissContentStyle: React.CSSProperties = isDismissing
    ? {
        transform: "translate(-50%, -50%) translateY(100vh)",
        opacity: 0,
        transition: `transform ${animMs}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${animMs - 20}ms ease-out`,
      }
    : {};
  const dismissOverlayStyle: React.CSSProperties | undefined = isDismissing
    ? { opacity: 0, transition: `opacity ${animMs - 20}ms ease-out` }
    : undefined;

  return {
    isDismissing,
    requestDismiss,
    onBodyWheel,
    onBodyTouchStart,
    onBodyTouchMove,
    onBodyTouchEnd,
    dismissContentStyle,
    dismissOverlayStyle,
  };
}
