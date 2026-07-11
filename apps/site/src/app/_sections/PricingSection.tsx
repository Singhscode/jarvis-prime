import Reveal from '@/components/Reveal';
import { CheckCircle2, Lock } from 'lucide-react';

const STARTER_FEATURES = ['500 prospects monthly', 'AI personalized outreach', 'Email campaigns', 'Auto follow-ups', 'Monthly reports'];

const GROWTH_FEATURES = [
  'Everything in Starter +',
  '2,000 prospects monthly',
  'LinkedIn outreach',
  'Multi-channel campaigns',
  'CRM integration',
  'Weekly optimization',
  'Priority support',
];

const SCALE_FEATURES = [
  'Everything in Growth +',
  '5,000+ prospects monthly',
  'Dedicated campaign manager',
  'AI lead scoring',
  'Custom strategy',
  'Advanced analytics',
  'VIP support',
];

export default function PricingSection() {
  return (
    <section id="pricing" className="relative z-10 px-4 py-28">
      <div className="relative mx-auto max-w-7xl">
        <Reveal className="mb-16 text-center" variant="fade">
          <span className="mb-4 inline-block rounded-full border border-cyan-500/10 bg-cyan-500/5 px-4 py-1.5 text-sm font-medium text-cyan-400">
            Plans
          </span>
          <h2 className="mb-6 font-display text-4xl font-bold text-white md:text-5xl">
            Simple, Results-Based Pricing
          </h2>
          <p className="mx-auto max-w-2xl text-xl text-slate-400">
            Choose your scale. Month-to-month. Cancel anytime.
          </p>
        </Reveal>

        <div className="mb-16 grid gap-6 lg:grid-cols-3">
          {/* STARTER */}
          <Reveal>
            <div className="group h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/15">
              <div className="mb-8">
                <h3 className="mb-2 font-display text-2xl font-bold text-white">STARTER</h3>
                <p className="mb-6 text-sm text-slate-500">For freelancers &amp; small teams testing outbound.</p>
                <div className="mb-2 flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-white">₹24,999</span>
                  <span className="text-slate-500">/month</span>
                </div>
                <p className="text-sm font-semibold text-cyan-400">3-5 Meetings/Month Target</p>
              </div>
              <div className="mb-8 space-y-3">
                {STARTER_FEATURES.map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-400/70" />
                    <span className="text-slate-400">{f}</span>
                  </div>
                ))}
              </div>
              <a
                href="/book-call"
                className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-6 py-3.5 text-center font-semibold text-white transition-all duration-300 hover:border-cyan-500/20 hover:bg-white/[0.06]"
              >
                Book a Free Call
              </a>
            </div>
          </Reveal>

          {/* GROWTH — Featured */}
          <Reveal delay={100}>
            <div className="group relative h-full rounded-2xl border-2 border-cyan-500/30 bg-white/[0.02] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/50 lg:scale-105">
              <div className="absolute -top-0 right-6 rounded-b-lg bg-cyan-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
                Most Popular
              </div>
              <div className="mb-8">
                <h3 className="mb-2 font-display text-2xl font-bold text-white">GROWTH</h3>
                <p className="mb-6 text-sm text-slate-400">For agencies &amp; consultancies ready to scale.</p>
                <div className="mb-2 flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-cyan-400">₹49,999</span>
                  <span className="text-slate-400">/month</span>
                </div>
                <p className="text-sm font-semibold text-violet-400">8-15 Meetings/Month Target</p>
              </div>
              <div className="mb-8 space-y-3">
                {GROWTH_FEATURES.map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-400" />
                    <span className="text-slate-300">{f}</span>
                  </div>
                ))}
              </div>
              <a
                href="/book-call"
                className="block w-full rounded-xl bg-cyan-500 px-6 py-3.5 text-center font-semibold text-white transition-all duration-300 hover:bg-cyan-600"
              >
                Scale Your Pipeline
              </a>
            </div>
          </Reveal>

          {/* SCALE */}
          <Reveal delay={200}>
            <div className="group h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/15">
              <div className="mb-8">
                <h3 className="mb-2 font-display text-2xl font-bold text-white">SCALE</h3>
                <p className="mb-6 text-sm text-slate-500">For established teams wanting maximum volume.</p>
                <div className="mb-2 flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-white">₹99,999</span>
                  <span className="text-slate-500">/month</span>
                </div>
                <p className="text-sm font-semibold text-cyan-400">15-30 Meetings/Month Target</p>
              </div>
              <div className="mb-8 space-y-3">
                {SCALE_FEATURES.map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-400/70" />
                    <span className="text-slate-400">{f}</span>
                  </div>
                ))}
              </div>
              <a
                href="/book-call"
                className="block w-full rounded-xl bg-cyan-500 px-6 py-3.5 text-center font-semibold text-white transition-all duration-300 hover:bg-cyan-600"
              >
                Book a Strategy Call
              </a>
            </div>
          </Reveal>
        </div>

        {/* No contract note */}
        <Reveal variant="fade">
          <div className="mx-auto max-w-2xl rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
            <Lock className="mx-auto mb-4 h-8 w-8 text-cyan-400/70" />
            <p className="text-slate-400">
              <span className="font-semibold text-white">No long-term contracts.</span> Month-to-month billing.
              Cancel anytime. We focus on results, not lock-in.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
