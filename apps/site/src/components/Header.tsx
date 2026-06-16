'use client';

import { useState } from 'react';

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <a href="/" className="flex items-center">
            <img src="/logo.svg" alt="JARVIS PRIME" className="h-9 w-auto" />
          </a>

          <nav className="hidden md:flex items-center gap-8">
            <a href="#services" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Services</a>
            <a href="/lead-generation" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Lead Generation</a>
            <a href="#results" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Results</a>
            <a href="#process" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">How It Works</a>
            <a href="#pricing" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Pricing</a>
            <a href="#faq" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">FAQ</a>
          </nav>

          <a href="/book-call" className="hidden md:block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold shadow-md hover:shadow-lg">
            Book Free Call
          </a>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden w-10 h-10 flex flex-col justify-center items-center gap-1.5">
            <div className="w-6 h-0.5 bg-gray-900"></div>
            <div className="w-6 h-0.5 bg-gray-900"></div>
            <div className="w-6 h-0.5 bg-gray-900"></div>
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden pb-4 border-t border-gray-200 mt-2">
            <a href="#services" className="block py-3 text-gray-600 hover:text-blue-600 font-medium">Services</a>
            <a href="/lead-generation" className="block py-3 text-gray-600 hover:text-blue-600 font-medium">Lead Generation</a>
            <a href="#results" className="block py-3 text-gray-600 hover:text-blue-600 font-medium">Results</a>
            <a href="#process" className="block py-3 text-gray-600 hover:text-blue-600 font-medium">How It Works</a>
            <a href="#pricing" className="block py-3 text-gray-600 hover:text-blue-600 font-medium">Pricing</a>
            <a href="#faq" className="block py-3 text-gray-600 hover:text-blue-600 font-medium">FAQ</a>
            <a href="/book-call" className="block mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold text-center">
              Book Free Call
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
