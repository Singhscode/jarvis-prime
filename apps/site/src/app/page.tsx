import Header from '@/components/Header';
import Reveal from '@/components/Reveal';
import FaqSection from '@/components/FaqSection';
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
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="relative w-full overflow-x-hidden bg-slate-950">
      <Header />

      {/* Hero Section */}
      <section className="relative z-10 px-4 pb-28 pt-40 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute right-0 top-0 h-96 w-96 animate-pulse rounded-full bg-blue-500 opacity-10 mix-blend-multiply blur-3xl"></div>
          <div
            className="absolute bottom-0 left-0 h-96 w-96 animate-pulse rounded-full bg-cyan-500 opacity-10 mix-blend-multiply blur-3xl"
            style={{ animationDelay: '2s' }}
          ></div>
        </div>

        <div className="relative z-10 mx-auto max-w-5xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400"></span>
            <span className="text-sm font-semibold text-blue-300">AI-Powered Outbound · Based in Gurgaon, India</span>
          </div>

          <h1 className="mb-8 bg-gradient-to-r from-white via-blue-200 to-cyan-200 bg-clip-text text-5xl font-black leading-tight text-transparent md:text-6xl lg:text-7xl">
            Scale Your Pipeline Without Hiring
          </h1>

          <p className="mx-auto mb-12 max-w-3xl text-xl font-light leading-relaxed text-slate-300 md:text-2xl">
            JARVIS PRIME runs your lead research, personalized outreach, and meeting booking — so you
            stop burning time on manual prospecting and start taking qualified calls.
          </p>

          <div className="mb-16 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="/book-call"
              className="group flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-4 text-lg font-bold text-white transition-all hover:shadow-2xl hover:shadow-blue-500/50"
            >
              Book a Free Strategy Call
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="#how"
              className="rounded-lg border-2 border-slate-600 px-8 py-4 font-semibold text-slate-300 transition-all hover:border-blue-500 hover:text-blue-300"
            >
              See How It Works
            </a>
          </div>

          <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="mb-1 text-3xl font-bold text-cyan-400">8-30</div>
              <div className="text-sm text-slate-300">Target Meetings/Mo</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="mb-1 text-3xl font-bold text-cyan-400">~50%</div>
              <div className="text-sm text-slate-300">Of an SDR's Cost</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="mb-1 text-3xl font-bold text-cyan-400">7 Days</div>
              <div className="text-sm text-slate-300">To First Outreach</div>
            </div>
          </div>
        </div>

        {/* Hero product visual — a simple, honest "pipeline" mock */}
        <Reveal className="relative z-10 mx-auto mt-16 max-w-3xl" delay={150}>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5 shadow-2xl shadow-blue-500/10 backdrop-blur">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-400/70"></span>
              <span className="h-3 w-3 rounded-full bg-yellow-400/70"></span>
              <span className="h-3 w-3 rounded-full bg-green-400/70"></span>
              <span className="ml-3 text-xs text-slate-500">JARVIS PRIME · Campaign Dashboard</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
                <MailCheck className="mb-2 h-5 w-5 text-cyan-400" />
                <div className="text-2xl font-black text-white">1,240</div>
                <div className="text-xs text-slate-400">Emails sent</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
                <TrendingUp className="mb-2 h-5 w-5 text-cyan-400" />
                <div className="text-2xl font-black text-white">41%</div>
                <div className="text-xs text-slate-400">Open rate</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
                <CalendarCheck className="mb-2 h-5 w-5 text-cyan-400" />
                <div className="text-2xl font-black text-white">12</div>
                <div className="text-xs text-slate-400">Meetings booked</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-xs font-bold text-white">
                  RS
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Meeting booked · Growth-stage agency</div>
                  <div className="text-xs text-slate-400">Tomorrow, 3:00 PM · qualified</div>
                </div>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-500">Illustrative dashboard — sample numbers.</p>
          </div>
        </Reveal>
      </section>

      {/* How It Works */}
      <section id="how" className="relative z-10 bg-slate-900 px-4 py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-black text-white md:text-5xl">How JARVIS PRIME Works</h2>
            <p className="text-xl text-slate-300">Done-for-you outbound, start to booked meeting</p>
          </Reveal>

          <div className="space-y-6">
            {[
              {
                title: 'Strategic Research',
                desc: 'We build your ideal customer profile and identify high-intent prospects in your target market.',
                icon: Users,
              },
              {
                title: 'AI-Powered Outreach',
                desc: 'Personalized emails and LinkedIn messages crafted specifically for the decision-makers you want.',
                icon: Zap,
              },
              {
                title: 'Intelligent Follow-Up',
                desc: 'Automated sequences that nurture prospects and move them toward a real conversation.',
                icon: TrendingUp,
              },
              {
                title: 'Meeting Booking',
                desc: 'Qualified, time-zone-aligned prospects are booked directly onto your calendar.',
                icon: CheckCircle2,
              },
            ].map((step, idx) => {
              const Icon = step.icon;
              return (
                <Reveal key={idx} delay={idx * 80}>
                  <div className="group rounded-xl border border-slate-700 bg-gradient-to-r from-slate-800 to-slate-800/50 p-8 transition-all hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10">
                    <div className="flex items-start gap-8">
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600">
                        <Icon className="h-8 w-8 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="mb-2 text-2xl font-bold text-white">{step.title}</h3>
                        <p className="text-lg text-slate-300">{step.desc}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Results / Metrics */}
      <section id="results" className="relative z-10 bg-slate-950 px-4 py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-black text-white md:text-5xl">Results You Can Expect</h2>
            <p className="mx-auto max-w-2xl text-xl text-slate-300">
              Honest targets based on industry benchmarks — not inflated promises.
            </p>
          </Reveal>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { metric: '8-30', label: 'Target Calls/Month', icon: BarChart3 },
              { metric: '35-45%', label: 'Typical Open Rate', icon: TrendingUp },
              { metric: '5-8%', label: 'Typical Reply Rate', icon: CheckCircle2 },
              { metric: '7-14', label: 'Days to 1st Meeting', icon: Zap },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <Reveal key={idx} delay={idx * 80}>
                  <div className="group rounded-xl border border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 p-8 text-center transition-all hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10">
                    <Icon className="mx-auto mb-4 h-10 w-10 text-cyan-400 transition-transform group-hover:scale-110" />
                    <div className="mb-2 text-4xl font-black text-white">{item.metric}</div>
                    <div className="font-medium text-slate-300">{item.label}</div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ROI band */}
      <section className="relative z-10 border-y border-slate-700 bg-gradient-to-r from-blue-950/50 to-cyan-950/50 px-4 py-20">
        <Reveal className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 text-3xl font-black text-white md:text-4xl">ROI You Can Measure</h2>
          <p className="text-lg text-slate-200">
            One closed deal typically covers many months of JARVIS PRIME — at roughly half the cost of
            hiring and managing an SDR.
          </p>
        </Reveal>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 bg-slate-900 px-4 py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-16 text-center">
            <h2 className="mb-6 text-4xl font-black text-white md:text-5xl">Simple, Results-Based Pricing</h2>
            <p className="mx-auto max-w-2xl text-xl text-slate-300">
              Choose your scale. Month-to-month. Cancel anytime.
            </p>
          </Reveal>

          <div className="mb-16 grid gap-8 md:grid-cols-3">
            {/* STARTER */}
            <Reveal>
              <div className="group h-full rounded-2xl border border-slate-700 bg-slate-800 p-8 transition-all hover:-translate-y-2 hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10">
                <div className="mb-8">
                  <h3 className="mb-2 text-2xl font-black text-white">STARTER</h3>
                  <p className="mb-6 text-sm text-slate-400">For freelancers &amp; small teams testing outbound.</p>
                  <div className="mb-2 flex items-baseline gap-1">
                    <span className="text-5xl font-black text-white">₹24,999</span>
                    <span className="text-slate-400">/month</span>
                  </div>
                  <p className="text-sm font-semibold text-cyan-400">3-5 Meetings/Month Target</p>
                </div>
                <div className="mb-8 space-y-3">
                  {['500 prospects monthly', 'AI personalized outreach', 'Email campaigns', 'Auto follow-ups', 'Monthly reports'].map(
                    (f) => (
                      <div key={f} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-400" />
                        <span className="text-slate-300">{f}</span>
                      </div>
                    )
                  )}
                </div>
                <a
                  href="/book-call"
                  className="block w-full rounded-lg border-2 border-slate-600 px-6 py-3 text-center font-bold text-white transition-all hover:border-cyan-500 hover:bg-slate-700"
                >
                  Book a Free Call
                </a>
              </div>
            </Reveal>

            {/* GROWTH */}
            <Reveal delay={100}>
              <div className="group relative h-full rounded-2xl border-2 border-blue-500 bg-gradient-to-br from-blue-600 to-cyan-600 p-8 shadow-2xl transition-all hover:-translate-y-3 md:scale-105">
                <div className="absolute -top-5 right-6 rounded-full bg-white px-4 py-1 text-sm font-black text-blue-600">
                  MOST POPULAR
                </div>
                <div className="mb-8">
                  <h3 className="mb-2 text-2xl font-black text-white">GROWTH</h3>
                  <p className="mb-6 text-sm text-blue-100">For agencies &amp; consultancies ready to scale.</p>
                  <div className="mb-2 flex items-baseline gap-1">
                    <span className="text-5xl font-black text-white">₹49,999</span>
                    <span className="text-blue-100">/month</span>
                  </div>
                  <p className="text-sm font-semibold text-blue-50">8-15 Meetings/Month Target</p>
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
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-white" />
                      <span className="text-blue-50">{f}</span>
                    </div>
                  ))}
                </div>
                <a
                  href="/book-call"
                  className="block w-full rounded-lg bg-white px-6 py-3 text-center font-bold text-blue-600 transition-all hover:bg-slate-100"
                >
                  Scale Your Pipeline
                </a>
              </div>
            </Reveal>

            {/* SCALE */}
            <Reveal delay={200}>
              <div className="group h-full rounded-2xl border border-slate-700 bg-slate-800 p-8 transition-all hover:-translate-y-2 hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10">
                <div className="mb-8">
                  <h3 className="mb-2 text-2xl font-black text-white">SCALE</h3>
                  <p className="mb-6 text-sm text-slate-400">For established teams wanting maximum volume.</p>
                  <div className="mb-2 flex items-baseline gap-1">
                    <span className="text-5xl font-black text-white">₹99,999</span>
                    <span className="text-slate-400">/month</span>
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
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-400" />
                      <span className="text-slate-300">{f}</span>
                    </div>
                  ))}
                </div>
                <a
                  href="/book-call"
                  className="block w-full rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 text-center font-bold text-white transition-all hover:shadow-lg"
                >
                  Book a Strategy Call
                </a>
              </div>
            </Reveal>
          </div>

          <div className="mx-auto max-w-2xl rounded-2xl border border-slate-700 bg-slate-800/50 p-8 text-center">
            <Lock className="mx-auto mb-4 h-8 w-8 text-cyan-400" />
            <p className="text-slate-300">
              <span className="font-bold text-white">No long-term contracts.</span> Month-to-month billing.
              Cancel anytime. We focus on results, not lock-in.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 border-t border-slate-700 bg-slate-900 px-4 py-28">
        <div className="mx-auto max-w-4xl">
          <Reveal className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-black text-white md:text-5xl">Frequently Asked</h2>
            <p className="text-xl text-slate-300">Everything you need to know</p>
          </Reveal>
          <FaqSection />
        </div>
      </section>

      {/* Founder + Founding clients (honest, replaces testimonials) */}
      <section className="relative z-10 border-y border-slate-800 bg-slate-900 px-4 py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal className="mb-12 text-center">
            <span className="mb-4 inline-block rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1 text-sm font-semibold text-cyan-300">
              Building in public
            </span>
            <h2 className="mb-4 text-4xl font-black text-white md:text-5xl">Meet the Founder</h2>
          </Reveal>

          <Reveal>
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 rounded-2xl border border-slate-700 bg-slate-800/50 p-8 text-center md:flex-row md:text-left">
              {/* Replace this initials avatar with a real photo at /founder.jpg when ready */}
              <div className="flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 text-4xl font-black text-white">
                AS
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">Anuj Singh</h3>
                <p className="mb-4 text-sm font-semibold text-cyan-400">Founder, JARVIS PRIME · Gurgaon, India</p>
                <p className="leading-relaxed text-slate-300">
                  I started JARVIS PRIME because hiring SDRs is slow, expensive, and unpredictable for
                  most agencies. We&apos;re a new company taking on our first founding clients — which
                  means you get direct, founder-led attention and an honest, results-first partnership
                  as we grow together.
                </p>
                <a
                  href="https://www.linkedin.com/company/jarvis-prime-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 font-semibold text-cyan-400 hover:text-cyan-300"
                >
                  Connect on LinkedIn
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 bg-slate-950 px-4 py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-black text-white md:text-5xl">Everything Included, Done For You</h2>
            <p className="text-xl text-slate-300">No tools to learn. No team to manage. We handle it all.</p>
          </Reveal>

          <div className="grid gap-8 md:grid-cols-2">
            {[
              {
                icon: Users,
                title: 'Intelligent Prospect Research',
                desc: 'We find your ideal customers based on your ICP, with intent signals — so outreach lands on the right people.',
              },
              {
                icon: Zap,
                title: 'Personalized at Scale',
                desc: 'Every email is personalized with AI. No generic blasts — real, relevant messages that earn replies.',
              },
              {
                icon: TrendingUp,
                title: 'Multi-Channel Campaigns',
                desc: 'Email + LinkedIn + follow-ups, orchestrated together to maximize response rates.',
              },
              {
                icon: BarChart3,
                title: 'Transparent Reporting',
                desc: 'Track opens, replies, and booked meetings. See what is working and what we are optimizing.',
              },
              {
                icon: CheckCircle2,
                title: 'Automated Qualification',
                desc: 'Prospects are scored against your ICP before they reach your calendar — fewer junk calls.',
              },
              {
                icon: Lock,
                title: 'Your Brand, Your Domain',
                desc: 'Campaigns go out from your domain and your brand. The relationships are yours to keep.',
              },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Reveal key={idx} delay={(idx % 2) * 80}>
                  <div className="h-full rounded-xl border border-slate-700 bg-slate-800/30 p-8 transition-all hover:border-cyan-500/50 hover:bg-slate-800/50">
                    <Icon className="mb-4 h-12 w-12 text-cyan-400" />
                    <h3 className="mb-3 text-2xl font-bold text-white">{feature.title}</h3>
                    <p className="leading-relaxed text-slate-300">{feature.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-slate-800 bg-gradient-to-r from-blue-950/50 to-cyan-950/50 px-4 py-28">
        <Reveal className="mx-auto max-w-4xl text-center">
          <h2 className="mb-6 text-4xl font-black text-white md:text-5xl">Ready to Scale?</h2>
          <p className="mx-auto mb-12 max-w-2xl text-xl text-slate-200">
            Book a free strategy call and we&apos;ll map out exactly how JARVIS PRIME can fill your
            pipeline over the next 60 days.
          </p>
          <a
            href="/book-call"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-10 py-5 text-lg font-bold text-white transition-all hover:shadow-2xl hover:shadow-cyan-500/50"
          >
            Book Your Free Call
            <ArrowRight className="h-6 w-6" />
          </a>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800 bg-slate-950 px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 grid gap-12 md:grid-cols-4">
            <div>
              <img src="/logo-white.svg" alt="JARVIS PRIME" className="mb-4 h-8 w-auto" />
              <p className="text-sm text-slate-400">
                AI-powered outbound automation for agencies and B2B companies that want to scale.
              </p>
            </div>
            <div>
              <h3 className="mb-4 font-bold text-white">Product</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#pricing" className="transition-colors hover:text-cyan-400">Pricing</a></li>
                <li><a href="#how" className="transition-colors hover:text-cyan-400">How It Works</a></li>
                <li><a href="#faq" className="transition-colors hover:text-cyan-400">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 font-bold text-white">Company</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="mailto:hello@jarvisprime.me" className="transition-colors hover:text-cyan-400">Contact</a></li>
                <li><a href="tel:+918810500723" className="transition-colors hover:text-cyan-400">Call Us</a></li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 font-bold text-white">Connect</h3>
              <div className="flex gap-3">
                <a
                  href="https://www.linkedin.com/company/jarvis-prime-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="JARVIS PRIME on LinkedIn"
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 transition-all hover:bg-blue-600"
                >
                  <svg className="h-5 w-5 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
                <a
                  href="https://x.com/jarvisprime_ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="JARVIS PRIME on X"
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 transition-all hover:bg-black"
                >
                  <svg className="h-5 w-5 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 text-center text-sm text-slate-500">
            <p>&copy; 2026 JARVIS PRIME. AI Outbound System · Gurgaon, India.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
