'use client';

import { motion, useScroll, useTransform, AnimatePresence, useSpring } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

/* ----------------------------------------------------------------------------
   Scroll progress bar (top of page)
---------------------------------------------------------------------------- */
const ScrollProgress = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed top-0 left-0 right-0 h-0.5 origin-left z-[60] bg-gradient-to-r from-cyan-400 via-purple-500 to-cyan-400"
    />
  );
};

/* ----------------------------------------------------------------------------
   Ambient animated background (aurora glow + grid)
---------------------------------------------------------------------------- */
const AmbientBackground = () => (
  <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
    {/* base */}
    <div className="absolute inset-0 bg-[#070A14]" />
    {/* subtle grid */}
    <div
      className="absolute inset-0 opacity-[0.04]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }}
    />
    {/* aurora blobs */}
    <motion.div
      className="absolute -top-40 left-1/4 w-[40rem] h-[40rem] rounded-full blur-[120px]"
      style={{ background: 'radial-gradient(circle, rgba(0,229,255,0.25), transparent 60%)' }}
      animate={{ x: [0, 80, 0], y: [0, 40, 0] }}
      transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
    />
    <motion.div
      className="absolute top-1/3 right-1/5 w-[36rem] h-[36rem] rounded-full blur-[120px]"
      style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.25), transparent 60%)' }}
      animate={{ x: [0, -60, 0], y: [0, 60, 0] }}
      transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
    />
    {/* top vignette so nav stays readable */}
    <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#070A14] to-transparent" />
  </div>
);

/* ----------------------------------------------------------------------------
   Reveal-on-scroll helper
---------------------------------------------------------------------------- */
const Reveal = ({
  children,
  delay = 0,
  y = 28,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    viewport={{ once: true, margin: '-80px' }}
    className={className}
  >
    {children}
  </motion.div>
);

/* ----------------------------------------------------------------------------
   Glass card with spotlight hover
---------------------------------------------------------------------------- */
const SpotlightCard = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -200, y: -200 });

  const handleMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={() => setPos({ x: -200, y: -200 })}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition-colors duration-300 hover:border-white/20 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(420px circle at ${pos.x}px ${pos.y}px, rgba(0,229,255,0.10), transparent 45%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
};

/* ----------------------------------------------------------------------------
   Animated counter
---------------------------------------------------------------------------- */
const Counter = ({ to, suffix = '', prefix = '' }: { to: number; suffix?: string; prefix?: string }) => {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          const duration = 1400;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(Math.round(eased * to));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [to, started]);

  return (
    <span ref={ref}>
      {prefix}
      {val}
      {suffix}
    </span>
  );
};

/* ----------------------------------------------------------------------------
   Page
---------------------------------------------------------------------------- */
export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showCalendly, setShowCalendly] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Booking form state
  const [form, setForm] = useState({ name: '', email: '', company: '', phone: '', message: '' });
  const [formStatus, setFormStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus('submitting');
    setFormError('');
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Something went wrong. Please try again.');
        setFormStatus('error');
        return;
      }
      setFormStatus('success');
    } catch {
      setFormError('Network error. Please try again.');
      setFormStatus('error');
    }
  };

  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 600], [0, 120]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = ['Problem', 'Solution', 'Results', 'Pricing'];

  return (
    <div className="relative min-h-screen bg-[#070A14] text-white antialiased overflow-x-hidden">
      <ScrollProgress />
      <AmbientBackground />

      {/* ===================== NAV ===================== */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'border-b border-white/10 bg-[#070A14]/80 backdrop-blur-xl'
            : 'border-b border-transparent bg-transparent'
        }`}
      >
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 text-sm font-black text-slate-950">
              J
            </span>
            <span className="text-lg font-bold tracking-tight">
              JARVIS <span className="text-gradient">PRIME</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                {item}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="hidden rounded-lg px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:text-white sm:block"
            >
              Portal
            </Link>
            <button
              onClick={() => setShowCalendly(true)}
              className="group relative hidden overflow-hidden rounded-lg bg-gradient-to-r from-cyan-400 to-purple-500 px-5 py-2 text-sm font-semibold text-slate-950 transition-all hover:shadow-lg hover:shadow-cyan-400/30 md:block"
            >
              Book a Call
            </button>
            <button
              onClick={() => setMobileMenuOpen((s) => !s)}
              className="grid h-10 w-10 place-items-center rounded-lg text-cyan-400 hover:bg-white/5 md:hidden"
              aria-label="Toggle menu"
            >
              ☰
            </button>
          </div>
        </nav>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-white/10 bg-[#070A14]/95 backdrop-blur-xl md:hidden"
            >
              <div className="space-y-1 px-4 py-4">
                {navLinks.map((item) => (
                  <a
                    key={item}
                    href={`#${item.toLowerCase()}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-gray-300 hover:bg-white/5 hover:text-white"
                  >
                    {item}
                  </a>
                ))}
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-2 text-gray-300 hover:bg-white/5 hover:text-white"
                >
                  Operations Portal
                </Link>
                <button
                  onClick={() => {
                    setShowCalendly(true);
                    setMobileMenuOpen(false);
                  }}
                  className="mt-2 w-full rounded-lg bg-gradient-to-r from-cyan-400 to-purple-500 px-4 py-2.5 font-semibold text-slate-950"
                >
                  Book a Call
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ===================== HERO ===================== */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-24 pt-32 sm:px-6 md:pt-40 lg:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div style={{ y: heroY }}>
            <Reveal>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-gray-300 backdrop-blur-xl">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                </span>
                AI agents live & generating pipeline 24/7
              </div>
            </Reveal>

            <Reveal delay={0.05}>
              <h1 className="text-balance text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                Your outbound,
                <br />
                <span className="text-gradient">fully automated.</span>
              </h1>
            </Reveal>

            <Reveal delay={0.12}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-400">
                JARVIS PRIME finds your ideal prospects, writes personalized emails, and books
                qualified calls on autopilot. 50–100 leads a month. Zero manual work.
              </p>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <button
                  onClick={() => setShowCalendly(true)}
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-cyan-400 to-purple-500 px-8 py-4 font-semibold text-slate-950 transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:shadow-cyan-400/30 active:scale-95"
                >
                  <span className="relative z-10">Book Free Strategy Call</span>
                  <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-500 group-hover:translate-x-full" />
                </button>
                <Link
                  href="/dashboard"
                  className="rounded-xl border border-white/15 bg-white/5 px-8 py-4 text-center font-semibold text-white backdrop-blur-xl transition-all duration-300 hover:border-cyan-400/40 hover:bg-white/10"
                >
                  View Live Dashboard
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.26}>
              <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> 50+ agencies onboarded
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> $10M+ pipeline generated
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> 38% avg. open rate
                </div>
              </div>
            </Reveal>
          </motion.div>

          {/* Hero visual: live activity panel */}
          <Reveal delay={0.2} y={40}>
            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-cyan-400/20 to-purple-500/20 blur-2xl" />
              <SpotlightCard className="relative p-6 sm:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-400/80" />
                    <div className="h-3 w-3 rounded-full bg-yellow-400/80" />
                    <div className="h-3 w-3 rounded-full bg-green-400/80" />
                  </div>
                  <span className="font-mono text-xs text-gray-500">live · agent feed</span>
                </div>

                <div className="space-y-3">
                  {[
                    { icon: '🎯', label: 'New prospect sourced', sub: 'Founder · SaaS · 25 ICP', tone: 'cyan' },
                    { icon: '✉️', label: 'Personalized email sent', sub: 'Sequence step 2 of 5', tone: 'purple' },
                    { icon: '🔥', label: 'Hot reply detected', sub: 'Score 23/25 · alert sent', tone: 'cyan' },
                    { icon: '📅', label: 'Discovery call booked', sub: 'Tomorrow · 3:00 PM IST', tone: 'purple' },
                  ].map((row, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.15 }}
                      viewport={{ once: true }}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <div
                        className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg text-lg ${
                          row.tone === 'cyan' ? 'bg-cyan-400/10' : 'bg-purple-500/10'
                        }`}
                      >
                        {row.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{row.label}</div>
                        <div className="truncate text-xs text-gray-500">{row.sub}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-6 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gradient">
                      <Counter to={1000} suffix="+" />
                    </div>
                    <div className="text-[11px] text-gray-500">emails/mo</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gradient">
                      <Counter to={40} suffix="+" />
                    </div>
                    <div className="text-[11px] text-gray-500">replies/mo</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gradient">
                      <Counter to={12} />
                    </div>
                    <div className="text-[11px] text-gray-500">calls/mo</div>
                  </div>
                </div>
              </SpotlightCard>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== LOGO STRIP ===================== */}
      <section className="relative z-10 border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Reveal>
            <p className="mb-6 text-center text-xs font-medium uppercase tracking-widest text-gray-500">
              Trusted by modern revenue teams
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 opacity-60">
              {['Crescendo', 'NorthPeak', 'Vantage', 'BlueOrbit', 'Helix', 'Marlin'].map((b) => (
                <span key={b} className="text-lg font-semibold tracking-tight text-gray-400">
                  {b}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== PROBLEM ===================== */}
      <section id="problem" className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-8">
        <Reveal className="mx-auto mb-16 max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-cyan-400">The problem</span>
          <h2 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Growth shouldn&apos;t be this fragile</h2>
          <p className="mt-4 text-lg text-gray-400">
            Inconsistent pipeline, burned-out reps, and a rising cost of acquisition. Sound familiar?
          </p>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: '📉', title: 'Unpredictable pipeline', desc: '30 leads one month, 5 the next. Impossible to forecast or plan around.' },
            { icon: '😮‍💨', title: 'Burned-out SDRs', desc: 'Manual research and copy-paste outreach drives churn and inconsistency.' },
            { icon: '💸', title: 'Rising CAC', desc: 'SDRs cost ₹35L+/yr and ad costs keep climbing while returns shrink.' },
          ].map((c, i) => (
            <Reveal key={c.title} delay={i * 0.1}>
              <SpotlightCard className="h-full p-8">
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-2xl">{c.icon}</div>
                <h3 className="mb-2 text-xl font-semibold">{c.title}</h3>
                <p className="text-gray-400">{c.desc}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== SOLUTION ===================== */}
      <section id="solution" className="relative z-10 border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-8">
          <Reveal className="mx-auto mb-16 max-w-2xl text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-purple-400">The solution</span>
            <h2 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">One system. The entire funnel.</h2>
            <p className="mt-4 text-lg text-gray-400">
              JARVIS PRIME runs sourcing, personalization, outreach, and routing — end to end.
            </p>
          </Reveal>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: '🎯', title: 'ICP Scoring', desc: 'Every prospect scored 0–25 against your ideal profile.' },
              { icon: '✍️', title: 'AI Personalization', desc: 'Research-backed emails written for each contact.' },
              { icon: '⚡', title: '24/7 Automation', desc: 'Sequences run around the clock with zero input.' },
              { icon: '📊', title: 'Live Analytics', desc: 'Track opens, replies and meetings in real time.' },
            ].map((c, i) => (
              <Reveal key={c.title} delay={i * 0.08}>
                <SpotlightCard className="h-full p-7">
                  <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/15 to-purple-500/15 text-2xl">
                    {c.icon}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{c.title}</h3>
                  <p className="text-sm text-gray-400">{c.desc}</p>
                </SpotlightCard>
              </Reveal>
            ))}
          </div>

          {/* How it works steps */}
          <div className="mt-20">
            <Reveal className="mb-12 text-center">
              <h3 className="text-2xl font-bold sm:text-3xl">How it works</h3>
            </Reveal>
            <div className="relative grid gap-8 md:grid-cols-4">
              {[
                { step: '01', title: 'Define ICP', desc: 'We workshop your ideal customer profile.' },
                { step: '02', title: 'Build list', desc: '500+ qualified prospects identified.' },
                { step: '03', title: 'Run campaigns', desc: 'Personalized sequences at scale.' },
                { step: '04', title: 'Close deals', desc: 'Hot leads routed straight to sales.' },
              ].map((s, i) => (
                <Reveal key={s.step} delay={i * 0.1}>
                  <div className="relative">
                    <div className="mb-4 font-mono text-5xl font-bold text-gradient">{s.step}</div>
                    <h4 className="mb-2 text-lg font-semibold">{s.title}</h4>
                    <p className="text-sm text-gray-400">{s.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== RESULTS ===================== */}
      <section id="results" className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-8">
        <Reveal className="mx-auto mb-16 max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-cyan-400">The results</span>
          <h2 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Numbers that compound</h2>
          <p className="mt-4 text-lg text-gray-400">Real data from Crescendo Ventures over 90 days.</p>
        </Reveal>

        <div className="mb-10 grid gap-6 sm:grid-cols-3">
          {[
            { value: <Counter to={3} suffix="x" />, label: 'Pipeline growth' },
            { value: <><span>₹</span><Counter to={120} suffix="K" /></>, label: 'New MRR added' },
            { value: <Counter to={5} suffix=" mo" />, label: 'Payback period' },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 0.1}>
              <SpotlightCard className="p-10 text-center">
                <div className="text-5xl font-extrabold text-gradient sm:text-6xl">{s.value}</div>
                <p className="mt-3 text-gray-400">{s.label}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <SpotlightCard className="p-8 sm:p-12">
            <div className="grid gap-12 md:grid-cols-2">
              <div>
                <h3 className="mb-6 text-xl font-semibold text-cyan-400">Email performance</h3>
                <div className="space-y-4">
                  {[
                    ['Open rate', '38%'],
                    ['Click rate', '7.2%'],
                    ['Reply rate', '4.1%'],
                    ['Meeting conversion', '2.9%'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between border-b border-white/10 pb-3 last:border-0">
                      <span className="text-gray-400">{k}</span>
                      <span className="text-lg font-bold text-white">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-6 text-xl font-semibold text-purple-400">Sales impact</h3>
                <div className="space-y-4">
                  {[
                    ['Meetings / month', '11–13'],
                    ['Close rate', '26%'],
                    ['Deals / month', '2–3'],
                    ['Cost per lead', '₹750'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between border-b border-white/10 pb-3 last:border-0">
                      <span className="text-gray-400">{k}</span>
                      <span className="text-lg font-bold text-white">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SpotlightCard>
        </Reveal>

        {/* testimonials */}
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {[
            { quote: 'We went from 15 to 150 leads a month in 90 days. No new hires. Same team, far better results.', author: 'Priya Sharma', role: 'CEO, Crescendo Ventures', tag: '10x growth' },
            { quote: 'Close rate jumped 40% because every lead was actually a fit. The ICP scoring is the magic.', author: 'Vikram Patel', role: 'VP Sales, Crescendo Ventures', tag: '+40% close rate' },
          ].map((t, i) => (
            <Reveal key={i} delay={i * 0.12}>
              <SpotlightCard className="flex h-full flex-col p-8">
                <div className="mb-4 text-3xl text-cyan-400">&ldquo;</div>
                <p className="flex-grow text-lg italic text-gray-200">{t.quote}</p>
                <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-5">
                  <div>
                    <div className="font-semibold">{t.author}</div>
                    <div className="text-sm text-gray-500">{t.role}</div>
                  </div>
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-400">
                    {t.tag}
                  </span>
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== PRICING ===================== */}
      <section id="pricing" className="relative z-10 border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-8">
          <Reveal className="mx-auto mb-16 max-w-2xl text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-purple-400">Pricing</span>
            <h2 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Simple, transparent plans</h2>
            <p className="mt-4 text-lg text-gray-400">No setup fees. No long contracts. Cancel anytime.</p>
          </Reveal>

          <div className="grid items-stretch gap-6 md:grid-cols-3">
            {[
              { name: 'Starter', price: '₹12,000', period: '/mo', features: ['1,000 emails/month', 'Basic ICP scoring', 'Lead routing', 'Weekly optimization'], highlighted: false },
              { name: 'Professional', price: '₹29,000', period: '/mo', features: ['5,000 emails/month', 'Advanced ICP', 'LinkedIn + email', 'Bi-weekly strategy calls', 'Advanced analytics'], highlighted: true },
              { name: 'Enterprise', price: 'Custom', period: '', features: ['Unlimited emails', 'Full CRM sync', 'Phone automation', 'Dedicated manager', 'Custom sequences'], highlighted: false },
            ].map((plan, i) => (
              <Reveal key={plan.name} delay={i * 0.1}>
                <div className={`relative h-full ${plan.highlighted ? 'md:-mt-4 md:mb-4' : ''}`}>
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-gradient-to-r from-cyan-400 to-purple-500 px-4 py-1 text-xs font-bold text-slate-950">
                      MOST POPULAR
                    </div>
                  )}
                  <SpotlightCard
                    className={`flex h-full flex-col p-8 ${
                      plan.highlighted ? 'border-cyan-400/40 bg-cyan-400/[0.04]' : ''
                    }`}
                  >
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <div className="mt-4 mb-8">
                      <span className="text-4xl font-extrabold sm:text-5xl">{plan.price}</span>
                      <span className="text-sm text-gray-500">{plan.period}</span>
                    </div>
                    <ul className="mb-8 flex-grow space-y-3">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-3 text-sm text-gray-300">
                          <span className="mt-0.5 text-cyan-400">✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => setShowCalendly(true)}
                      className={`w-full rounded-xl py-3 font-semibold transition-all ${
                        plan.highlighted
                          ? 'bg-gradient-to-r from-cyan-400 to-purple-500 text-slate-950 hover:shadow-lg hover:shadow-cyan-400/30'
                          : 'border border-white/15 text-white hover:border-cyan-400/40 hover:bg-white/5'
                      }`}
                    >
                      Get started
                    </button>
                  </SpotlightCard>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-10 text-center">
            <p className="text-gray-400">
              Try it for 90 days free.{' '}
              <span className="font-semibold text-cyan-400">No credit card required.</span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ===================== FINAL CTA ===================== */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-400/10 to-purple-500/10 p-12 text-center backdrop-blur-xl sm:p-16">
            <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-purple-500/20 blur-3xl" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
                Ready to scale your outbound?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-gray-300">
                Book a free 30-minute strategy call. We&apos;ll audit your funnel and map your path to 3x pipeline.
              </p>
              <button
                onClick={() => setShowCalendly(true)}
                className="mt-8 inline-block rounded-xl bg-gradient-to-r from-cyan-400 to-purple-500 px-10 py-4 font-semibold text-slate-950 transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:shadow-cyan-400/30 active:scale-95"
              >
                Book Your Free Call
              </button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="relative z-10 border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 text-sm font-black text-slate-950">
                  J
                </span>
                <span className="text-lg font-bold">JARVIS PRIME</span>
              </div>
              <p className="mt-4 max-w-xs text-sm text-gray-500">
                AI-powered outbound automation for modern revenue teams.
              </p>
            </div>
            {[
              { h: 'Product', items: ['Features', 'Pricing', 'Enterprise', 'Dashboard'] },
              { h: 'Company', items: ['About', 'Blog', 'Careers', 'Contact'] },
              { h: 'Legal', items: ['Privacy', 'Terms', 'Security', 'DPA'] },
            ].map((col) => (
              <div key={col.h}>
                <h4 className="mb-4 text-sm font-semibold text-white">{col.h}</h4>
                <ul className="space-y-2.5">
                  {col.items.map((it) => (
                    <li key={it}>
                      <a href="#" className="text-sm text-gray-500 transition-colors hover:text-cyan-400">
                        {it}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
            <p className="text-sm text-gray-500">© 2026 JARVIS PRIME. All rights reserved.</p>
            <div className="flex gap-4 text-sm text-gray-500">
              <a href="#" className="hover:text-cyan-400">Twitter</a>
              <a href="#" className="hover:text-cyan-400">LinkedIn</a>
              <a href="#" className="hover:text-cyan-400">GitHub</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ===================== BOOKING MODAL ===================== */}
      <AnimatePresence>
        {showCalendly && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setShowCalendly(false);
              setFormStatus('idle');
            }}
            className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0B1020] p-8"
            >
              <button
                onClick={() => {
                  setShowCalendly(false);
                  setFormStatus('idle');
                }}
                className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-white/5 hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>

              {formStatus === 'success' ? (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-cyan-400/15 text-3xl">
                    ✓
                  </div>
                  <div className="text-2xl font-bold">You&apos;re in!</div>
                  <p className="mt-2 text-sm text-gray-400">
                    Thanks {form.name.split(' ')[0] || 'there'} — we&apos;ve got your request and will reach
                    out within 24 hours to lock in a time.
                  </p>
                  <button
                    onClick={() => {
                      setShowCalendly(false);
                      setFormStatus('idle');
                    }}
                    className="mt-6 w-full rounded-xl bg-gradient-to-r from-cyan-400 to-purple-500 py-3 font-semibold text-slate-950"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-1 text-2xl font-bold">Book your free call</div>
                  <p className="mb-6 text-sm text-gray-400">
                    Tell us a bit about you. We&apos;ll reach out within 24 hours to schedule your
                    30-minute strategy session.
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-3">
                    <input
                      required
                      type="text"
                      placeholder="Your name *"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-cyan-400/50"
                    />
                    <input
                      required
                      type="email"
                      placeholder="Work email *"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-cyan-400/50"
                    />
                    <input
                      type="text"
                      placeholder="Company"
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-cyan-400/50"
                    />
                    <input
                      type="tel"
                      placeholder="Phone (optional)"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-cyan-400/50"
                    />
                    <textarea
                      placeholder="What are you hoping to achieve? (optional)"
                      rows={3}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-cyan-400/50"
                    />

                    {formStatus === 'error' && (
                      <p className="text-sm text-red-400">{formError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={formStatus === 'submitting'}
                      className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-purple-500 py-3 font-semibold text-slate-950 transition-all hover:shadow-lg hover:shadow-cyan-400/30 disabled:opacity-60"
                    >
                      {formStatus === 'submitting' ? 'Sending…' : 'Request my call'}
                    </button>
                  </form>
                  <p className="mt-3 text-center text-xs text-gray-500">
                    No spam. We&apos;ll only use this to schedule your call.
                  </p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
