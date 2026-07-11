import Reveal from '@/components/Reveal';
import GlowButton from '@/components/GlowButton';

export default function CtaFooterSection() {
  return (
    <>
      {/* ===== CTA ===== */}
      <section className="relative z-10 px-4 py-28">
        {/* Ambient background glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-ambient absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[100px]" />
        </div>

        <Reveal className="relative mx-auto max-w-4xl text-center" variant="fade">
          <h2 className="mb-6 font-display text-4xl font-bold text-white md:text-5xl">
            Ready to <span className="text-cyan-400">Scale</span>?
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-xl text-slate-400">
            Book a free strategy call and we&apos;ll map out exactly how JARVIS PRIME can fill your
            pipeline over the next 60 days.
          </p>
          <GlowButton href="/book-call" className="text-lg">
            Book Your Free Call
          </GlowButton>
        </Reveal>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 border-t border-white/[0.04] px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 grid gap-12 md:grid-cols-4">
            <div>
              <img src="/logo-white.svg" alt="JARVIS PRIME" className="mb-4 h-8 w-auto" />
              <p className="text-sm text-slate-500">
                AI-powered outbound automation for agencies and B2B companies that want to scale.
              </p>
            </div>
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Product</h3>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#pricing" className="transition-colors hover:text-cyan-400">Pricing</a></li>
                <li><a href="#how" className="transition-colors hover:text-cyan-400">How It Works</a></li>
                <li><a href="#faq" className="transition-colors hover:text-cyan-400">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Company</h3>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="mailto:hello@jarvisprime.me" className="transition-colors hover:text-cyan-400">Contact</a></li>
                <li><a href="tel:+918810500723" className="transition-colors hover:text-cyan-400">Call Us</a></li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Connect</h3>
              <div className="flex gap-3">
                <a
                  href="https://www.linkedin.com/company/jarvis-prime-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="JARVIS PRIME on LinkedIn"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-400 transition-all duration-300 hover:border-cyan-500/20 hover:text-cyan-400"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
                <a
                  href="https://x.com/jarvisprime_ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="JARVIS PRIME on X"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-400 transition-all duration-300 hover:border-cyan-500/20 hover:text-white"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.04] pt-8 text-center text-sm text-slate-600">
            <p>&copy; 2026 JARVIS PRIME. AI Outbound System · Gurgaon, India.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
