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
export const SCROLL_DISMISS_ANIM_MS = 520;

export function useScrollDismiss(
  isOpen: boolean,
  onDismiss: () => void,
  // Optional — overrides the slide-down animation duration for this caller
  // only. Defaults to SCROLL_DISMISS_ANIM_MS, so every existing caller that
  // omits this keeps the exact same timing as before.
  animMs: number = SCROLL_DISMISS_ANIM_MS,
  // Optional, defaults to false — when true, the TOUCH path (wheel is
  // unaffected) switches from "threshold crossed mid-drag = dismiss
  // immediately" to a real follow-the-finger drag: the modal tracks the
  // finger live with no transition while the touch is active, reverses
  // smoothly if the finger moves back down, and only decides to commit
  // (slide-close) or cancel (spring back) once the finger lifts. Every
  // existing caller omits this and keeps the original instant-threshold
  // behavior, byte-for-byte unchanged.
  liveDrag: boolean = false,
) {
  const pullAccumRef = useRef(0);
  const lastPullTimeRef = useRef(0);
  const pinnedStartYRef = useRef<number | null>(null);
  const isDismissingRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);

  // ── Live-drag state (liveDrag only) ───────────────────────────────────────
  const [dragOffset, setDragOffset] = useState(0);
  const [isDraggingLive, setIsDraggingLive] = useState(false);
  // Sticky once true for the current open session — keeps the drag transform
  // (now settled at 0, with a transition) rendered instead of collapsing the
  // style to {} the instant dragOffset returns to 0, which would drop the
  // transition and make the spring-back snap instead of ease.
  const hasDraggedRef = useRef(false);

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
      hasDraggedRef.current = false;
      setDragOffset(0);
      setIsDraggingLive(false);
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
      if (liveDrag && isDraggingLive) {
        // Content scrolled away from the top mid-drag (edge case) — cancel
        // the drag in place rather than leaving it stuck at a stale offset.
        setIsDraggingLive(false);
        setDragOffset(0);
      }
      return;
    }
    if (pinnedStartYRef.current == null) {
      // Just arrived at the top this gesture — start measuring the extra pull from here,
      // not from wherever the finger started (which may have been mid-content).
      pinnedStartYRef.current = y;
      return;
    }
    const dy = y - pinnedStartYRef.current;
    if (liveDrag) {
      // Follow the finger live — never negative (the modal never moves
      // "up" past its resting position). The dismiss decision itself is
      // deferred to release (onBodyTouchEnd), not made mid-drag.
      const offset = Math.max(0, dy);
      hasDraggedRef.current = true;
      setIsDraggingLive(offset > 0);
      setDragOffset(offset);
      return;
    }
    if (dy > DISMISS_THRESHOLD) {
      pinnedStartYRef.current = null;
      requestDismiss();
    }
  };

  const onBodyTouchEnd = () => {
    pinnedStartYRef.current = null;
    if (!liveDrag || !isDraggingLive) return;
    setIsDraggingLive(false);
    if (dragOffset >= DISMISS_THRESHOLD) {
      // Commit — requestDismiss()'s own isDismissing style takes over from
      // here, continuing the same downward translateY(...) smoothly from
      // wherever the drag currently is to fully off-screen.
      setDragOffset(0);
      requestDismiss();
    } else {
      // Below threshold — spring back. isDraggingLive is now false, so the
      // style below applies a transition for this change instead of
      // tracking instantly.
      setDragOffset(0);
    }
  };

  // Slides the whole card down past the bottom edge and fades it out, with the
  // backdrop fading in sync (via the consumer's `overlayStyle` prop — see
  // client/src/components/ui/dialog.tsx), instead of vanishing instantly.
  // Applies to every dismissal path that goes through requestDismiss (the
  // gesture, and whatever else the caller wires to it) — a caller that still
  // calls onDismiss directly instead (bypassing requestDismiss) keeps using
  // its own default close animation, unaffected by this.
  //
  // While a liveDrag is active/settling (hasDraggedRef once true for this
  // open session), the drag offset drives the same transform shape with no
  // transition during the live follow (isDraggingLive), and a transition
  // only once the finger lifts (spring-back to 0, or the handoff into the
  // isDismissing branch above continuing the same downward motion).
  const dismissContentStyle: React.CSSProperties = isDismissing
    ? {
        transform: "translate(-50%, -50%) translateY(100vh)",
        opacity: 0,
        transition: `transform ${animMs}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${animMs - 20}ms ease-out`,
      }
    : hasDraggedRef.current
      ? {
          transform: `translate(-50%, -50%) translateY(${dragOffset}px)`,
          transition: isDraggingLive ? "none" : "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)",
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
