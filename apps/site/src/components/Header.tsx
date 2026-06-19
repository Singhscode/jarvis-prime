'use client';

import { useState } from 'react';

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80; // Header height
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
    setMobileMenuOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <a href="/" className="flex items-center">
            <img src="/logo-white.svg" alt="JARVIS PRIME" className="h-9 w-auto" />
          </a>

          <nav className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollToSection('how')} className="text-slate-300 hover:text-cyan-400 transition-colors font-medium">
              How It Works
            </button>
            <button onClick={() => scrollToSection('results')} className="text-slate-300 hover:text-cyan-400 transition-colors font-medium">
              Results
            </button>
            <button onClick={() => scrollToSection('pricing')} className="text-slate-300 hover:text-cyan-400 transition-colors font-medium">
              Pricing
            </button>
            <button onClick={() => scrollToSection('faq')} className="text-slate-300 hover:text-cyan-400 transition-colors font-medium">
              FAQ
            </button>
          </nav>

          <a href="/book-call" className="hidden md:block px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all font-semibold">
            Book Free Call
          </a>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden w-10 h-10 flex flex-col justify-center items-center gap-1.5">
            <div className={`w-6 h-0.5 bg-white transition-all ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></div>
            <div className={`w-6 h-0.5 bg-white transition-all ${mobileMenuOpen ? 'opacity-0' : ''}`}></div>
            <div className={`w-6 h-0.5 bg-white transition-all ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></div>
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden pb-4 border-t border-slate-800 mt-2 bg-slate-950">
            <button onClick={() => scrollToSection('how')} className="block w-full text-left py-3 text-slate-300 hover:text-cyan-400 font-medium">
              How It Works
            </button>
            <button onClick={() => scrollToSection('results')} className="block w-full text-left py-3 text-slate-300 hover:text-cyan-400 font-medium">
              Results
            </button>
            <button onClick={() => scrollToSection('pricing')} className="block w-full text-left py-3 text-slate-300 hover:text-cyan-400 font-medium">
              Pricing
            </button>
            <button onClick={() => scrollToSection('faq')} className="block w-full text-left py-3 text-slate-300 hover:text-cyan-400 font-medium">
              FAQ
            </button>
            <a href="/book-call" className="block mt-4 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:shadow-lg transition-all font-semibold text-center">
              Book Free Call
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
