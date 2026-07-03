import Header from '@/components/Header';
import Reveal from '@/components/Reveal';
import FaqSection from '@/components/FaqSection';
import ParticleGrid from '@/components/ParticleGrid';
import AnimatedCounter from '@/components/AnimatedCounter';
import GlowButton from '@/components/GlowButton';
import SectionDivider from '@/components/SectionDivider';
import {
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Users,
  Zap,
  BarChart3,
  Lock,
  CalendarCheck,
  MailCheck,
  Sparkles,
  Target,
  MessageSquare,
  LineChart,
  Shield,
  Globe,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="relative w-full overflow-x-hidden bg-[#030712]">
      <Header />

      {/* ===== HERO SECTION ===== */}
      <section className="relative z-10 px-4 pb-32 pt-36 lg:pt-44">
        {/* Background layers */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <ParticleGrid />

          {/* Gradient orbs */}
          <div className="absolute -right-32 -top-32 h-[500px] w-[500px] animate-orb-drift rounded-full bg-violet-500/[0.07] blur-[120px]" />
          <div className="absolute -left-32 bottom-0 h-[400px] w-[400px] animate-orb-drift-2 rounded-full bg-cyan-500/[0.07] blur-[100px]" />
          <div className="absolute left-1/2 top-1/4 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-fuchsia-500/[0.04] blur-[100px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-5xl text-center">
          {/* Badge */}
          <Reveal variant="blur">
            <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-5 py-2.5 backdrop-blur-sm">
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
          <Reveal variant="blur" delay={100}>
            <h1 className="mb-8 font-display text-5xl font-bold leading-[1.1] tracking-tight text-white md:text-6xl lg:text-7xl">
              Scale Your Pipeline
              <br />
              <span className="text-gradient">Without Hiring</span>
            </h1>
          </Reveal>

          {/* Subhead */}
          <Reveal variant="blur" delay={200}>
            <p className="mx-auto mb-12 max-w-3xl text-lg font-light leading-relaxed text-slate-400 md:text-xl">
              JARVIS PRIME runs your lead research, personalized outreach, and meeting booking — so you
              stop burning time on manual prospecting and start taking qualified calls.
            </p>
          </Reveal>

          {/* CTAs */}
          <Reveal variant="blur" delay={300}>
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
          <Reveal variant="scale" delay={400}>
            <div className="mx-auto grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { value: '8-30', label: 'Target Meetings/Mo' },
                { value: '~50%', label: "Of an SDR's Cost" },
                { value: '7 Days', label: 'To First Outreach' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="glass-card rounded-xl px-5 py-4 transition-all duration-300 hover:border-cyan-500/10"
                >
                  <AnimatedCounter
                    value={stat.value}
                    className="mb-1 block text-3xl font-bold text-gradient"
                  />
                  <div className="text-sm text-slate-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        {/* Dashboard mock */}
        <Reveal className="relative z-10 mx-auto mt-16 max-w-3xl" delay={500} variant="scale">
          <div className="glass-card rounded-2xl p-5 shadow-2xl shadow-cyan-500/[0.03]">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-400/60" />
              <span className="h-3 w-3 rounded-full bg-yellow-400/60" />
              <span className="h-3 w-3 rounded-full bg-green-400/60" />
              <span className="ml-3 text-xs text-slate-500">JARVIS PRIME · Campaign Dashboard</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: MailCheck, value: '1,240', label: 'Emails sent' },
                { icon: TrendingUp, value: '41%', label: 'Open rate' },
                { icon: CalendarCheck, value: '12', label: 'Meetings booked' },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <div
                    key={metric.label}
                    className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-4 transition-all duration-300 hover:bg-white/[0.04]"
                  >
                    <Icon className="mb-2 h-5 w-5 text-cyan-400" />
                    <AnimatedCounter
                      value={metric.value}
                      className="text-2xl font-bold text-white"
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

      <SectionDivider />

      {/* ===== HOW IT WORKS ===== */}
      <section id="how" className="relative z-10 px-4 py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-16 text-center" variant="blur">
            <span className="mb-4 inline-block rounded-full border border-cyan-500/10 bg-cyan-500/5 px-4 py-1.5 text-sm font-medium text-cyan-400">
              The Process
            </span>
            <h2 className="mb-4 font-display text-4xl font-bold text-white md:text-5xl">
              How JARVIS PRIME Works
            </h2>
            <p className="text-xl text-slate-400">Done-for-you outbound, start to booked meeting</p>
          </Reveal>

          {/* Steps with timeline */}
          <div className="relative space-y-6">
            {/* Vertical line */}
            <div className="absolute left-8 top-0 hidden h-full w-px bg-gradient-to-b from-cyan-500/30 via-violet-500/20 to-transparent lg:block" />

            {[
              {
                title: 'Strategic Research',
                desc: 'We build your ideal customer profile and identify high-intent prospects in your target market.',
                icon: Target,
              },
              {
                title: 'AI-Powered Outreach',
                desc: 'Personalized emails and LinkedIn messages crafted specifically for the decision-makers you want.',
                icon: Sparkles,
              },
              {
                title: 'Intelligent Follow-Up',
                desc: 'Automated sequences that nurture prospects and move them toward a real conversation.',
                icon: MessageSquare,
              },
              {
                title: 'Meeting Booking',
                desc: 'Qualified, time-zone-aligned prospects are booked directly onto your calendar.',
                icon: CalendarCheck,
              },
            ].map((step, idx) => {
              const Icon = step.icon;
              return (
                <Reveal key={idx} delay={idx * 100}>
                  <div className="group glass-card-hover relative rounded-xl p-6 lg:ml-16 lg:p-8">
                    {/* Step number on timeline */}
                    <div className="absolute -left-[3.55rem] top-8 hidden h-8 w-8 items-center justify-center rounded-full border border-cyan-500/30 bg-surface-50 text-sm font-bold text-cyan-400 lg:flex">
                      {idx + 1}
                    </div>
                    <div className="flex items-start gap-5 lg:gap-8">
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 transition-all duration-300 group-hover:from-cyan-500/20 group-hover:to-violet-500/20 lg:h-16 lg:w-16">
                        <Icon className="h-7 w-7 text-cyan-400 lg:h-8 lg:w-8" />
                      </div>
                      <div className="flex-1">
                        <div className="mb-1 flex items-center gap-2 lg:hidden">
                          <span className="rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-400">
                            Step {idx + 1}
                          </span>
                        </div>
                        <h3 className="mb-2 font-display text-xl font-bold text-white lg:text-2xl">{step.title}</h3>
                        <p className="text-base text-slate-400 lg:text-lg">{step.desc}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ===== RESULTS / METRICS ===== */}
      <section id="results" className="relative z-10 px-4 py-28">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute right-0 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-violet-500/[0.04] blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-6xl">
          <Reveal className="mb-16 text-center" variant="blur">
            <span className="mb-4 inline-block rounded-full border border-violet-500/10 bg-violet-500/5 px-4 py-1.5 text-sm font-medium text-violet-400">
              Performance
            </span>
            <h2 className="mb-4 font-display text-4xl font-bold text-white md:text-5xl">Results You Can Expect</h2>
            <p className="mx-auto max-w-2xl text-xl text-slate-400">
              Honest targets based on industry benchmarks — not inflated promises.
            </p>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { metric: '8-30', label: 'Target Calls/Month', icon: BarChart3 },
              { metric: '35-45%', label: 'Typical Open Rate', icon: TrendingUp },
              { metric: '5-8%', label: 'Typical Reply Rate', icon: CheckCircle2 },
              { metric: '7-14', label: 'Days to 1st Meeting', icon: Zap },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <Reveal key={idx} delay={idx * 80} variant="scale">
                  <div className="glass-card-hover group rounded-xl p-8 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 transition-all duration-300 group-hover:from-cyan-500/20 group-hover:to-violet-500/20">
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
      <section className="relative z-10 px-4 py-20">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/[0.03] via-violet-500/[0.05] to-cyan-500/[0.03]" />
        </div>
        <SectionDivider className="absolute left-0 top-0" />
        <SectionDivider className="absolute bottom-0 left-0" />

        <Reveal className="relative mx-auto max-w-4xl text-center" variant="blur">
          <h2 className="mb-4 font-display text-3xl font-bold text-white md:text-4xl">
            ROI You Can <span className="text-gradient">Measure</span>
          </h2>
          <p className="text-lg text-slate-300">
            One closed deal typically covers many months of JARVIS PRIME — at roughly half the cost of
            hiring and managing an SDR.
          </p>
        </Reveal>
      </section>

      <SectionDivider />

      {/* ===== PRICING ===== */}
      <section id="pricing" className="relative z-10 px-4 py-28">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-violet-500/[0.03] blur-[150px]" />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <Reveal className="mb-16 text-center" variant="blur">
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
            <Reveal variant="scale">
              <div className="glass-card-hover group h-full rounded-2xl p-8 transition-all duration-500 hover:-translate-y-2">
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
                  {['500 prospects monthly', 'AI personalized outreach', 'Email campaigns', 'Auto follow-ups', 'Monthly reports'].map(
                    (f) => (
                      <div key={f} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-400/70" />
                        <span className="text-slate-400">{f}</span>
                      </div>
                    )
                  )}
                </div>
                <a
                  href="/book-call"
                  className="block w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-6 py-3.5 text-center font-semibold text-white transition-all duration-300 hover:border-cyan-500/20 hover:bg-white/[0.06]"
                >
                  Book a Free Call
                </a>
              </div>
            </Reveal>

            {/* GROWTH — Featured */}
            <Reveal delay={100} variant="scale">
              <div className="group relative h-full overflow-hidden rounded-2xl p-[1px] transition-all duration-500 hover:-translate-y-3 lg:scale-105">
                {/* Animated gradient border */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500 via-violet-500 to-fuchsia-500 opacity-60" />
                <div className="relative h-full rounded-[15px] bg-surface-50 p-8">
                  <div className="absolute -top-0 right-6 rounded-b-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
                    Most Popular
                  </div>
                  <div className="mb-8">
                    <h3 className="mb-2 font-display text-2xl font-bold text-white">GROWTH</h3>
                    <p className="mb-6 text-sm text-slate-400">For agencies &amp; consultancies ready to scale.</p>
                    <div className="mb-2 flex items-baseline gap-1">
                      <span className="text-5xl font-bold text-gradient">₹49,999</span>
                      <span className="text-slate-400">/month</span>
                    </div>
                    <p className="text-sm font-semibold text-violet-400">8-15 Meetings/Month Target</p>
                  </div>
                  <div className="mb-8 space-y-3">
                    {[
                      'Everything in Starter +',
                      '2,000 prospects monthly',
                      'LinkedIn outreach',
                      'Multi-channel campaigns',
                      'CRM integration',
                      'Weekly optimization',
                      'Priority support',
                    ].map((f) => (
                      <div key={f} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-400" />
                        <span className="text-slate-300">{f}</span>
                      </div>
                    ))}
                  </div>
                  <a
                    href="/book-call"
                    className="block w-full rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-3.5 text-center font-semibold text-white transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/20"
                  >
                    Scale Your Pipeline
                  </a>
                </div>
              </div>
            </Reveal>

            {/* SCALE */}
            <Reveal delay={200} variant="scale">
              <div className="glass-card-hover group h-full rounded-2xl p-8 transition-all duration-500 hover:-translate-y-2">
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
                  {[
                    'Everything in Growth +',
                    '5,000+ prospects monthly',
                    'Dedicated campaign manager',
                    'AI lead scoring',
                    'Custom strategy',
                    'Advanced analytics',
                    'VIP support',
                  ].map((f) => (
                    <div key={f} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-400/70" />
                      <span className="text-slate-400">{f}</span>
                    </div>
                  ))}
                </div>
                <a
                  href="/book-call"
                  className="block w-full rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-3.5 text-center font-semibold text-white transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/20"
                >
                  Book a Strategy Call
                </a>
              </div>
            </Reveal>
          </div>

          {/* No contract note */}
          <Reveal variant="fade">
            <div className="mx-auto max-w-2xl glass-card rounded-2xl p-8 text-center">
              <Lock className="mx-auto mb-4 h-8 w-8 text-cyan-400/70" />
              <p className="text-slate-400">
                <span className="font-semibold text-white">No long-term contracts.</span> Month-to-month billing.
                Cancel anytime. We focus on results, not lock-in.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <SectionDivider />

      {/* ===== FAQ ===== */}
      <section id="faq" className="relative z-10 px-4 py-28">
        <div className="mx-auto max-w-4xl">
          <Reveal className="mb-16 text-center" variant="blur">
            <span className="mb-4 inline-block rounded-full border border-violet-500/10 bg-violet-500/5 px-4 py-1.5 text-sm font-medium text-violet-400">
              Support
            </span>
            <h2 className="mb-4 font-display text-4xl font-bold text-white md:text-5xl">Frequently Asked</h2>
            <p className="text-xl text-slate-400">Everything you need to know</p>
          </Reveal>
          <FaqSection />
        </div>
      </section>

      <SectionDivider />

      {/* ===== FOUNDER ===== */}
      <section className="relative z-10 px-4 py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal className="mb-12 text-center" variant="blur">
            <span className="mb-4 inline-block rounded-full border border-cyan-500/10 bg-cyan-500/5 px-4 py-1.5 text-sm font-medium text-cyan-400">
              Building in public
            </span>
            <h2 className="mb-4 font-display text-4xl font-bold text-white md:text-5xl">Meet the Founder</h2>
          </Reveal>

          <Reveal variant="scale">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 overflow-hidden rounded-2xl p-[1px] md:flex-row">
              <div className="glass-card w-full rounded-2xl p-8">
                <div className="flex flex-col items-center gap-8 md:flex-row md:items-start">
                  {/* Avatar with glow ring */}
                  <div className="relative flex-shrink-0">
                    <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-cyan-500/30 to-violet-500/30 blur-sm" />
                    <div className="relative flex h-28 w-28 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-500 text-4xl font-bold text-white">
                      AS
                    </div>
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
            </div>
          </Reveal>
        </div>
      </section>

      <SectionDivider />

      {/* ===== FEATURES ===== */}
      <section className="relative z-10 px-4 py-28">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-cyan-500/[0.03] blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-6xl">
          <Reveal className="mb-16 text-center" variant="blur">
            <span className="mb-4 inline-block rounded-full border border-cyan-500/10 bg-cyan-500/5 px-4 py-1.5 text-sm font-medium text-cyan-400">
              Capabilities
            </span>
            <h2 className="mb-4 font-display text-4xl font-bold text-white md:text-5xl">
              Everything Included, Done For You
            </h2>
            <p className="text-xl text-slate-400">No tools to learn. No team to manage. We handle it all.</p>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                icon: Users,
                title: 'Intelligent Prospect Research',
                desc: 'We find your ideal customers based on your ICP, with intent signals — so outreach lands on the right people.',
              },
              {
                icon: Sparkles,
                title: 'Personalized at Scale',
                desc: 'Every email is personalized with AI. No generic blasts — real, relevant messages that earn replies.',
              },
              {
                icon: LineChart,
                title: 'Multi-Channel Campaigns',
                desc: 'Email + LinkedIn + follow-ups, orchestrated together to maximize response rates.',
              },
              {
                icon: BarChart3,
                title: 'Transparent Reporting',
                desc: 'Track opens, replies, and booked meetings. See what is working and what we are optimizing.',
              },
              {
                icon: Shield,
                title: 'Automated Qualification',
                desc: 'Prospects are scored against your ICP before they reach your calendar — fewer junk calls.',
              },
              {
                icon: Globe,
                title: 'Your Brand, Your Domain',
                desc: 'Campaigns go out from your domain and your brand. The relationships are yours to keep.',
              },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Reveal key={idx} delay={(idx % 2) * 80} variant="scale">
                  <div className="glass-card-hover h-full rounded-xl p-8">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10">
                      <Icon className="h-6 w-6 text-cyan-400" />
                    </div>
                    <h3 className="mb-3 font-display text-xl font-bold text-white">{feature.title}</h3>
                    <p className="leading-relaxed text-slate-400">{feature.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ===== CTA ===== */}
      <section className="relative z-10 px-4 py-28">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.05] blur-[120px]" />
          <div className="absolute left-1/3 top-1/3 h-[300px] w-[300px] rounded-full bg-violet-500/[0.04] blur-[100px]" />
        </div>

        <Reveal className="relative mx-auto max-w-4xl text-center" variant="blur">
          <h2 className="mb-6 font-display text-4xl font-bold text-white md:text-5xl">
            Ready to <span className="text-gradient">Scale</span>?
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
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-400 transition-all duration-300 hover:border-cyan-500/20 hover:bg-white/[0.06] hover:text-cyan-400"
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
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-400 transition-all duration-300 hover:border-cyan-500/20 hover:bg-white/[0.06] hover:text-white"
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
    </div>
  );
}
