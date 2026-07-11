import Reveal from '@/components/Reveal';
import { ArrowRight } from 'lucide-react';

export default function FounderSection() {
  return (
    <section className="relative z-10 px-4 py-28">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mb-12 text-center" variant="fade">
          <span className="mb-4 inline-block rounded-full border border-cyan-500/10 bg-cyan-500/5 px-4 py-1.5 text-sm font-medium text-cyan-400">
            Building in public
          </span>
          <h2 className="mb-4 font-display text-4xl font-bold text-white md:text-5xl">Meet the Founder</h2>
        </Reveal>

        <Reveal>
          <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
            <div className="flex flex-col items-center gap-8 md:flex-row md:items-start">
              {/* Avatar */}
              <div className="flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-2xl bg-cyan-500 text-4xl font-bold text-white">
                AS
              </div>
              <div className="text-center md:text-left">
                <h3 className="font-display text-2xl font-bold text-white">Anuj Singh</h3>
                <p className="mb-4 text-sm font-semibold text-cyan-400">Founder, JARVIS PRIME · Gurgaon, India</p>
                <p className="leading-relaxed text-slate-400">
                  I started JARVIS PRIME because hiring SDRs is slow, expensive, and unpredictable for
                  most agencies. We&apos;re a new company taking on our first founding clients — which
                  means you get direct, founder-led attention and an honest, results-first partnership
                  as we grow together.
                </p>
                <a
                  href="https://www.linkedin.com/company/jarvis-prime-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group mt-4 inline-flex items-center gap-2 font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
                >
                  Connect on LinkedIn
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
