import { useState, useEffect, useRef } from 'react';

/**
 * Hook for animated count-up effect.
 * Animates a number from 0 to the target value using easeOutExpo.
 */
export function useCountUp(target: number, duration = 1200, decimals = 0): number {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const prevTarget = useRef(target);

  useEffect(() => {
    const from = prevTarget.current !== target ? 0 : 0;
    prevTarget.current = target;

    if (target === 0) {
      setCurrent(0);
      return;
    }

    startTimeRef.current = undefined;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const value = from + (target - from) * eased;

      setCurrent(Number(value.toFixed(decimals)));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, decimals]);

  return current;
}
