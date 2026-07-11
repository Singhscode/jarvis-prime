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
        className={`group inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-transparent px-8 py-4 font-semibold text-slate-300 transition-all duration-300 hover:border-white/[0.2] hover:bg-white/[0.02] hover:text-white ${className}`}
      >
        {children}
      </a>
    );
  }

  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-8 py-4 text-lg font-bold text-slate-950 transition-all duration-300 hover:bg-cyan-300 hover:shadow-[0_0_24px_rgba(34,211,238,0.25)] ${className}`}
    >
      {children}
      <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
    </a>
  );
}
