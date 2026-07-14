'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number counting up from 0 to `value` when scrolled into view.
 * Handles ranges like "8-30", percentages like "41%", and plain numbers.
 */
export default function AnimatedCounter({
  value,
  className = '',
  duration = 1800,
}: {
  value: string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [displayed, setDisplayed] = useState(value);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const animateSingle = (target: number, format: (n: number) => string) => {
      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayed(format(Math.round(eased * target)));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const animateDouble = (
      targetA: number,
      targetB: number,
      format: (a: number, b: number) => string
    ) => {
      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayed(format(Math.round(eased * targetA), Math.round(eased * targetB)));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const animate = () => {
      const rangeMatch = value.match(/^([\d,]+)\s*-\s*([\d,]+)$/);
      const percentMatch = value.match(/^~?([\d,]+)%$/);
      const plainMatch = value.match(/^([\d,]+)$/);
      const daysMatch = value.match(/^([\d,]+)\s+(.+)$/);

      if (rangeMatch) {
        animateDouble(
          parseInt(rangeMatch[1].replace(/,/g, '')),
          parseInt(rangeMatch[2].replace(/,/g, '')),
          (a, b) => `${a}-${b}`
        );
      } else if (percentMatch) {
        const prefix = value.startsWith('~') ? '~' : '';
        animateSingle(parseInt(percentMatch[1].replace(/,/g, '')), (n) => `${prefix}${n}%`);
      } else if (daysMatch) {
        const suffix = daysMatch[2];
        animateSingle(parseInt(daysMatch[1].replace(/,/g, '')), (n) => `${n} ${suffix}`);
      } else if (plainMatch) {
        animateSingle(parseInt(plainMatch[1].replace(/,/g, '')), (n) => n.toLocaleString());
      }
    };

    const reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (reducedMotion) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated.current) {
            hasAnimated.current = true;
            animate();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {displayed}
    </span>
  );
}
