import Reveal from '@/components/Reveal';
import AnimatedCounter from '@/components/AnimatedCounter';
import { BarChart3, TrendingUp, CheckCircle2, Zap } from 'lucide-react';

const METRICS = [
  { metric: '8-30', label: 'Target Calls/Month', icon: BarChart3 },
  { metric: '35-45%', label: 'Typical Open Rate', icon: TrendingUp },
  { metric: '5-8%', label: 'Typical Reply Rate', icon: CheckCircle2 },
  { metric: '7-14', label: 'Days to 1st Meeting', icon: Zap },
];

export default function ResultsSection() {
  return (
    <>
      {/* ===== RESULTS / METRICS ===== */}
      <section id="results" className="relative z-10 px-4 py-28">
        <div className="relative mx-auto max-w-6xl">
          <Reveal className="mb-16 text-center" variant="fade">
            <span className="mb-4 inline-block rounded-full border border-violet-500/10 bg-violet-500/5 px-4 py-1.5 text-sm font-medium text-violet-400">
              Performance
            </span>
            <h2 className="mb-4 font-display text-4xl font-bold text-white md:text-5xl">Results You Can Expect</h2>
            <p className="mx-auto max-w-2xl text-xl text-slate-400">
              Honest targets based on industry benchmarks — not inflated promises.
            </p>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {METRICS.map((item, idx) => {
              const Icon = item.icon;
              return (
                <Reveal key={idx} delay={idx * 80}>
                  <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/15">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/[0.08]">
                      <Icon className="h-6 w-6 text-cyan-400" />
                    </div>
                    <AnimatedCounter
                      value={item.metric}
                      className="mb-2 block text-4xl font-bold text-white"
                    />
                    <div className="font-medium text-slate-400">{item.label}</div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== ROI BAND ===== */}
      <section className="relative z-10 border-y border-white/[0.04] px-4 py-20">
        <Reveal className="relative mx-auto max-w-4xl text-center" variant="fade">
          <h2 className="mb-4 font-display text-3xl font-bold text-white md:text-4xl">
            ROI You Can <span className="text-cyan-400">Measure</span>
          </h2>
          <p className="text-lg text-slate-300">
            One closed deal typically covers many months of JARVIS PRIME — at roughly half the cost of
            hiring and managing an SDR.
          </p>
        </Reveal>
      </section>
    </>
  );
}
