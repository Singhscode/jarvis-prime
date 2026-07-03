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

  function animate() {
    // Parse the value to figure out what to animate
    const rangeMatch = value.match(/^([\d,]+)\s*-\s*([\d,]+)$/);
    const percentMatch = value.match(/^~?([\d,]+)%$/);
    const plainMatch = value.match(/^([\d,]+)$/);
    const daysMatch = value.match(/^([\d,]+)\s+(.+)$/);

    if (rangeMatch) {
      // Range like "8-30"
      const from = parseInt(rangeMatch[1].replace(/,/g, ''));
      const to = parseInt(rangeMatch[2].replace(/,/g, ''));
      animateDouble(from, to, (a, b) => `${a}-${b}`);
    } else if (percentMatch) {
      const prefix = value.startsWith('~') ? '~' : '';
      const num = parseInt(percentMatch[1].replace(/,/g, ''));
      animateSingle(num, (n) => `${prefix}${n}%`);
    } else if (daysMatch) {
      const num = parseInt(daysMatch[1].replace(/,/g, ''));
      const suffix = daysMatch[2];
      animateSingle(num, (n) => `${n} ${suffix}`);
    } else if (plainMatch) {
      const num = parseInt(plainMatch[1].replace(/,/g, ''));
      animateSingle(num, (n) => n.toLocaleString());
    }
  }

  function animateSingle(target: number, format: (n: number) => string) {
    const start = performance.now();
    function step(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = easeOutCubic(progress);
      const current = Math.round(eased * target);
      setDisplayed(format(current));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function animateDouble(
    targetA: number,
    targetB: number,
    format: (a: number, b: number) => string
  ) {
    const start = performance.now();
    function step(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = easeOutCubic(progress);
      const currentA = Math.round(eased * targetA);
      const currentB = Math.round(eased * targetB);
      setDisplayed(format(currentA, currentB));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3);
  }

  return (
    <span ref={ref} className={className}>
      {displayed}
    </span>
  );
}
