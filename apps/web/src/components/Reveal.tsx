'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Enhanced scroll-reveal wrapper with multiple animation variants.
 * Supports: fade-up (default), scale, blur-to-focus.
 * Respects prefers-reduced-motion.
 */
export default function Reveal({
  children,
  className = '',
  delay = 0,
  variant = 'fade-up',
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  variant?: 'fade-up' | 'scale' | 'blur' | 'fade';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (reduce) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.08 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const baseTransition = 'transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]';

  const variants: Record<string, { hidden: string; shown: string }> = {
    'fade-up': {
      hidden: 'opacity-0 translate-y-8',
      shown: 'opacity-100 translate-y-0',
    },
    scale: {
      hidden: 'opacity-0 scale-95',
      shown: 'opacity-100 scale-100',
    },
    blur: {
      hidden: 'opacity-0 translate-y-4 blur-sm',
      shown: 'opacity-100 translate-y-0 blur-0',
    },
    fade: {
      hidden: 'opacity-0',
      shown: 'opacity-100',
    },
  };

  const v = variants[variant] || variants['fade-up'];

  return (
    <div
      ref={ref}
      className={`${baseTransition} ${shown ? v.shown : v.hidden} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
