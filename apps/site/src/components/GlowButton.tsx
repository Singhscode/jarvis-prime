'use client';

import { ArrowRight } from 'lucide-react';

/**
 * Clean CTA button with two variants: primary (solid cyan) and secondary (outlined).
 */
export default function GlowButton({
  href,
  children,
  variant = 'primary',
  className = '',
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  if (variant === 'secondary') {
    return (
      <a
        href={href}
        className={`group inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-transparent px-8 py-4 font-semibold text-slate-300 transition-all duration-300 hover:border-cyan-500/40 hover:text-white ${className}`}
      >
        {children}
      </a>
    );
  }

  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-8 py-4 text-lg font-bold text-white transition-all duration-300 hover:bg-cyan-600 ${className}`}
    >
      {children}
      <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
    </a>
  );
}
