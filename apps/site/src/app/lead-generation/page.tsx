import Link from 'next/link';
import HeroSection from './components/HeroSection';
import ServicesSection from './components/ServicesSection';
import ProcessSection from './components/ProcessSection';
import ResultsSection from './components/ResultsSection';
import CaseStudiesSection from './components/CaseStudiesSection';
import CalendlyCtaSection from './components/CalendlyCtaSection';
import FaqSection from './components/FaqSection';
import FinalCtaSection from './components/FinalCtaSection';

export default function LeadGenerationPage() {
  return (
    <div className="relative w-full overflow-x-hidden bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center">
              <img src="/logo.svg" alt="JARVIS PRIME" className="h-9 w-auto" />
            </Link>
            <nav className="hidden md:flex items-center gap-8">
              <Link href="/#services" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Services</Link>
              <Link href="/#pricing" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Pricing</Link>
              <Link href="/lead-generation" className="text-blue-600 font-semibold">Lead Generation</Link>
            </nav>
            <Link href="/book-call" className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold shadow-md hover:shadow-lg">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <HeroSection />

      {/* Trust Bar */}
      <section className="py-12 px-4 bg-gray-50 border-y border-gray-200">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-2">AI-Powered</div>
              <div className="text-sm text-gray-600">Intelligent Outreach</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-2">10-20</div>
              <div className="text-sm text-gray-600">Qualified Meetings/Month</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-2">Multi-Channel</div>
              <div className="text-sm text-gray-600">Email + LinkedIn + Voice</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-2">Full Integration</div>
              <div className="text-sm text-gray-600">CRM &amp; Automation</div>
            </div>
          </div>
        </div>
      </section>


      <ServicesSection />
      <ProcessSection />
      <ResultsSection />

      <CaseStudiesSection />
      <CalendlyCtaSection />
      <FaqSection />
      <FinalCtaSection />

      {/* Footer */}
      <footer className="relative z-10 bg-gray-900 text-gray-300 py-12 px-4 border-t border-gray-800">
        <div className="max-w-6xl mx-auto text-center">
          <img src="/logo-white.svg" alt="JARVIS PRIME" className="h-10 w-auto mx-auto mb-6" />
          <p className="text-gray-400 mb-6">
            AI-powered outbound and appointment-setting for agencies and B2B companies
          </p>
          <div className="space-y-2 mb-6">
            <p>
              <a href="mailto:hello@jarvisprime.me" className="hover:text-white transition-colors">
                hello@jarvisprime.me
              </a>
            </p>
            <p>
              <a href="tel:+918810500723" className="hover:text-white transition-colors">
                +91 88105 00723
              </a>
            </p>
            <p className="text-gray-400">
              Gurgaon, Haryana, India
            </p>
          </div>

          {/* Social Links */}
          <div className="flex justify-center gap-4 mb-8">
            <a 
              href="https://www.linkedin.com/company/jarvis-prime-ai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-gray-800 hover:bg-blue-600 flex items-center justify-center transition-all"
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
              className="w-10 h-10 rounded-full bg-gray-800 hover:bg-black flex items-center justify-center transition-all"
              aria-label="Follow us on X (Twitter)"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
          </div>

          <div className="border-t border-gray-800 pt-8 text-sm text-gray-500">
            <p>&copy; 2026 JARVIS PRIME. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
