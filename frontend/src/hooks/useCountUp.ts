import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Animates from 0 to `target` the first time a target is available (ease-out),
 * then follows later changes immediately. Skipped under reduced motion.
 */
export function useCountUp(target: number | null, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const animated = useRef(false);

  useEffect(() => {
    if (target === null) return;
    if (animated.current || prefersReducedMotion()) {
      animated.current = true;
      setValue(target);
      return;
    }
    animated.current = true;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}
