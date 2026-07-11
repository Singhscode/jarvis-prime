import Reveal from '@/components/Reveal';
import GlowButton from '@/components/GlowButton';
import AnimatedCounter from '@/components/AnimatedCounter';
import { CheckCircle2, TrendingUp, CalendarCheck, MailCheck } from 'lucide-react';

const STATS = [
  { value: '8-30', label: 'Target Meetings/Mo' },
  { value: '~50%', label: "Of an SDR's Cost" },
  { value: '7 Days', label: 'To First Outreach' },
];

const DASHBOARD_METRICS = [
  { icon: MailCheck, value: '1,240', label: 'Emails sent' },
  { icon: TrendingUp, value: '41%', label: 'Open rate' },
  { icon: CalendarCheck, value: '12', label: 'Meetings booked' },
];

export default function HeroSection() {
  return (
    <section className="relative z-10 px-4 pb-32 pt-36 lg:pt-44">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-ambient absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[100px]" />
        <div className="animate-ambient absolute -left-32 bottom-0 h-[400px] w-[400px] rounded-full bg-violet-500/10 blur-[90px]" style={{ animationDelay: '-10s' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl text-center">
        {/* Badge */}
        <Reveal variant="fade">
          <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-5 py-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            <span className="text-sm font-medium text-slate-300">
              AI-Powered Outbound · Based in Gurgaon, India
            </span>
          </div>
        </Reveal>

        {/* Headline */}
        <Reveal variant="fade" delay={100}>
          <h1 className="mb-8 font-display text-5xl font-bold leading-[1.1] tracking-tight text-white md:text-6xl lg:text-7xl">
            Scale Your Pipeline
            <br />
            <span className="text-cyan-400">Without Hiring</span>
          </h1>
        </Reveal>

        {/* Subhead */}
        <Reveal variant="fade" delay={200}>
          <p className="mx-auto mb-12 max-w-3xl text-lg font-light leading-relaxed text-slate-400 md:text-xl">
            JARVIS PRIME runs your lead research, personalized outreach, and meeting booking — so you
            stop burning time on manual prospecting and start taking qualified calls.
          </p>
        </Reveal>

        {/* CTAs */}
        <Reveal variant="fade" delay={300}>
          <div className="mb-16 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <GlowButton href="/book-call">
              Book a Free Strategy Call
            </GlowButton>
            <GlowButton href="#how" variant="secondary">
              See How It Works
            </GlowButton>
          </div>
        </Reveal>

        {/* Stats row */}
        <Reveal variant="fade" delay={400}>
          <div className="mx-auto grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 transition-all duration-300 hover:border-cyan-500/20"
              >
                <AnimatedCounter
                  value={stat.value}
                  className="mb-1 block text-3xl font-bold text-cyan-400"
                />
                <div className="text-sm text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* Dashboard mock */}
      <Reveal className="relative z-10 mx-auto mt-16 max-w-3xl" delay={500} variant="fade">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-2xl shadow-black/25 transition-all duration-500 hover:-translate-y-1 hover:border-cyan-500/10">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-400/60" />
            <span className="h-3 w-3 rounded-full bg-yellow-400/60" />
            <span className="h-3 w-3 rounded-full bg-green-400/60" />
            <span className="ml-3 text-xs text-slate-500">JARVIS PRIME · Campaign Dashboard</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {DASHBOARD_METRICS.map((metric) => {
              const Icon = metric.icon;
              return (
                <div
                  key={metric.label}
                  className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-4 transition-colors duration-300 hover:bg-white/[0.04]"
                >
                  <Icon className="mb-2 h-5 w-5 text-cyan-400" />
                  <AnimatedCounter
                    value={metric.value}
                    className="text-2xl font-bold text-white block"
                  />
                  <div className="text-xs text-slate-500">{metric.label}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 text-xs font-bold text-white">
                RS
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Meeting booked · Growth-stage agency</div>
                <div className="text-xs text-slate-500">Tomorrow, 3:00 PM · qualified</div>
              </div>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-600">
            Illustrative dashboard — sample numbers.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
