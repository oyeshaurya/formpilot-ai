import { useEffect } from "react";

const SURFACES = ".fp-card";

/**
 * Edge light: writes the pointer position into --mx / --my on the glass card
 * under it, so the cyan light on its rim (::before) follows the pointer.
 * One delegated listener, batched to one write per frame; mouse only
 * (touch and pen leave the highlight off).
 */
export function useSpatialPointer(): void {
  useEffect(() => {
    let frame = 0;
    let last: PointerEvent | null = null;

    const paint = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>(SURFACES);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
