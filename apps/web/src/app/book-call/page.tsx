'use client';

import CalendlyBooking from '@/components/CalendlyBooking';
import Image from 'next/image';
import Link from 'next/link';

export default function BookCallPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50">
      {/* Simple Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center">
              <Image src="/logo.svg" alt="JARVIS PRIME" width={300} height={64} priority className="h-9 w-auto" />
            </Link>

            <Link 
              href="/" 
              className="px-6 py-2.5 border-2 border-gray-300 text-gray-900 rounded-lg hover:border-blue-600 hover:text-blue-600 transition-all font-semibold"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content - Full Width Calendly */}
      <main className="pt-16">
        <CalendlyBooking calendlyUrl="https://calendly.com/as4619666/free-ai-growth-strategy-call" />
      </main>

      {/* Minimal Footer */}
      <footer className="bg-white border-t border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-gray-600 text-sm mb-2">
            Have questions? <a href="mailto:hello@jarvisprime.me" className="text-blue-600 hover:text-blue-700 font-semibold">Email us</a> or call <a href="tel:+918810500723" className="text-blue-600 hover:text-blue-700 font-semibold">+91 88105 00723</a>
          </p>
          <p className="text-gray-500 text-xs mb-2">
            Gurgaon, Haryana, India
          </p>
          
          {/* Social Link */}
          <div className="flex justify-center gap-3 mb-3">
            <a 
              href="https://www.linkedin.com/company/jarvis-prime-ai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-blue-600 transition-colors"
              aria-label="Follow us on LinkedIn"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
            <a 
              href="https://x.com/jarvisprime_ai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-black transition-colors"
              aria-label="Follow us on X (Twitter)"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
          </div>

          <p className="text-gray-500 text-xs">
            &copy; 2026 JARVIS PRIME. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
