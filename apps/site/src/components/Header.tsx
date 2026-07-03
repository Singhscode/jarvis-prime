'use client';

import { useState, useEffect } from 'react';

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleClose = () => setMobileMenuOpen(false);

  const navLinks = [
    { href: '/#how', label: 'How It Works' },
    { href: '/#results', label: 'Results' },
    { href: '/#pricing', label: 'Pricing' },
    { href: '/#faq', label: 'FAQ' },
  ];

  return (
    <>
      <header
        className={`fixed left-0 right-0 top-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'border-b border-white/[0.06] bg-surface-50/80 shadow-2xl shadow-black/20 backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between lg:h-20">
            {/* Logo */}
            <a
              href="/"
              className="group flex items-center transition-opacity duration-300 hover:opacity-80"
            >
              <img
                src="/logo-white.svg"
                alt="JARVIS PRIME"
                className="h-8 w-auto transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(6,182,212,0.4)] lg:h-9"
              />
            </a>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-1 md:flex">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="relative rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition-all duration-300 hover:bg-white/[0.04] hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            {/* CTA */}
            <a
              href="/book-call"
              className="hidden items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/20 md:inline-flex"
            >
              Book Free Call
            </a>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 md:hidden"
              aria-label="Toggle menu"
            >
              <div
                className={`h-0.5 w-6 rounded-full bg-white transition-all duration-300 ${
                  mobileMenuOpen ? 'translate-y-2 rotate-45' : ''
                }`}
              />
              <div
                className={`h-0.5 w-6 rounded-full bg-white transition-all duration-300 ${
                  mobileMenuOpen ? 'scale-0 opacity-0' : ''
                }`}
              />
              <div
                className={`h-0.5 w-6 rounded-full bg-white transition-all duration-300 ${
                  mobileMenuOpen ? '-translate-y-2 -rotate-45' : ''
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={handleClose}
        />
      )}

      {/* Mobile menu panel */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-72 transform border-l border-white/[0.06] bg-surface-50/95 backdrop-blur-xl transition-transform duration-300 md:hidden ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-end px-4">
          <button
            onClick={handleClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Close menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex flex-col gap-1 px-4 pt-4">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={handleClose}
              className="rounded-lg px-4 py-3 text-base font-medium text-slate-300 transition-all duration-200 hover:bg-white/[0.04] hover:text-white"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <a
              href="/book-call"
              className="block rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-3 text-center font-semibold text-white transition-all hover:shadow-lg"
            >
              Book Free Call
            </a>
          </div>
        </nav>
      </div>
    </>
  );
}
