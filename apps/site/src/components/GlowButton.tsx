'use client';

import { ArrowRight } from 'lucide-react';

/**
 * Premium CTA button with animated gradient border glow and hover effects.
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
        className={`group relative inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-surface-50/50 px-8 py-4 font-semibold text-slate-300 backdrop-blur-sm transition-all duration-300 hover:border-cyan-500/30 hover:text-cyan-400 hover:shadow-lg hover:shadow-cyan-500/5 ${className}`}
      >
        {children}
      </a>
    );
  }

  return (
    <a
      href={href}
      className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500 px-8 py-4 text-lg font-bold text-white transition-all duration-300 hover:shadow-2xl hover:shadow-cyan-500/25 ${className}`}
    >
      {/* Inner background to create border effect */}
      <span className="absolute inset-[1px] rounded-[11px] bg-gradient-to-r from-cyan-600 via-violet-600 to-cyan-600 transition-all duration-300 group-hover:from-cyan-500 group-hover:via-violet-500 group-hover:to-cyan-500" />
      <span className="relative z-10 flex items-center gap-2">
        {children}
        <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
      </span>
    </a>
  );
}
