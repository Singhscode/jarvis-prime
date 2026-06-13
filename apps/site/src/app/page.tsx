'use client';

import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import Link from 'next/link';

// Floating Particles Background
const FloatingParticles = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const particles = Array.from({ length: 15 }, (_, i) => i);
  
  if (!mounted) return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {particles.map((i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-cyan-400/20 rounded-full"
          initial={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
          }}
          animate={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
          }}
          transition={{
            duration: Math.random() * 20 + 15,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
};

// Animated Gradient Background
const GradientBg = () => {
  return (
    <div className="fixed inset-0 z-0">
      <motion.div
        className="absolute inset-0 opacity-15"
        animate={{
          background: [
            'radial-gradient(circle at 20% 50%, #00E5FF 0%, #0B1020 50%)',
            'radial-gradient(circle at 80% 50%, #7C3AED 0%, #0B1020 50%)',
            'radial-gradient(circle at 20% 50%, #00E5FF 0%, #0B1020 50%)',
          ],
        }}
        transition={{ duration: 8, repeat: Infinity }}
      />
    </div>
  );
};

// Glassmorphism Card
interface CardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

const GlassmorphismCard = ({ children, className = '', delay = 0 }: CardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.6 }}
    viewport={{ once: true, margin: '-100px' }}
    className={`backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 md:p-8 hover:border-cyan-400/50 transition-all duration-300 ${className}`}
  >
    {children}
  </motion.div>
);

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showCalendly, setShowCalendly] = useState(false);
  const { scrollY } = useScroll();
  const navOpacity = useTransform(scrollY, [0, 300], [1, 0.9]);

  return (
    <div className="bg-slate-950 text-white font-inter overflow-x-hidden">
      {/* Background Effects */}
      <GradientBg />
      <FloatingParticles />

      {/* Navigation */}
      <motion.nav
        style={{ opacity: navOpacity }}
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-2xl bg-slate-950/90 border-b border-white/10 shadow-xl h-16"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center gap-4 h-16">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xl md:text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent flex-shrink-0"
          >
            JARVIS
          </motion.div>

          {/* Desktop Menu */}
          <div className="hidden md:flex gap-1 items-center justify-center flex-1">
            {['Problem', 'Solution', 'Results', 'Pricing'].map((item, i) => (
              <motion.a
                key={item}
                href={`#${item.toLowerCase()}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="px-4 py-2 text-sm text-gray-300 hover:text-cyan-400 transition-colors whitespace-nowrap"
              >
                {item}
              </motion.a>
            ))}
          </div>

          <motion.button
            onClick={() => setShowCalendly(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="hidden md:block px-5 py-2 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-lg font-semibold text-sm text-slate-950 hover:shadow-lg hover:shadow-cyan-400/50 transition-all flex-shrink-0"
          >
            Book Call
          </motion.button>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-cyan-400 flex-shrink-0 w-8 h-8 flex items-center justify-center"
          >
            ☰
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden bg-slate-900/98 border-t border-white/10"
            >
              <div className="px-4 py-4 space-y-2">
                {['Problem', 'Solution', 'Results', 'Pricing'].map((item) => (
                  <a
                    key={item}
                    href={`#${item.toLowerCase()}`}
                    className="block text-gray-300 hover:text-cyan-400 transition-colors py-2 px-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item}
                  </a>
                ))}
                <button 
                  onClick={() => {
                    setShowCalendly(true);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-lg font-semibold text-slate-950 hover:shadow-lg transition-all mt-3"
                >
                  Book Call
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Hero Section */}
      <section className="relative z-10 mt-16 pt-20 md:pt-32 pb-20 md:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 md:gap-16 items-center">
            {/* Hero Content */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="space-y-8"
            >
              <div>
                <motion.h1
                  className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.8 }}
                >
                  AI Outbound{' '}
                  <span className="bg-gradient-to-r from-cyan-400 via-purple-500 to-cyan-400 bg-clip-text text-transparent">
                    at Scale
                  </span>
                </motion.h1>

                <motion.p
                  className="text-lg md:text-xl text-gray-300 leading-relaxed"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.8 }}
                >
                  Generate 50-100 qualified leads per month. Book 8-12 calls. Close 1-2 deals. All automated. Zero manual work.
                </motion.p>
              </div>

              <motion.div
                className="flex flex-col sm:flex-row gap-4 pt-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.8 }}
              >
                <button 
                  onClick={() => setShowCalendly(true)}
                  className="px-8 py-4 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-lg font-semibold text-slate-950 hover:shadow-2xl hover:shadow-cyan-400/50 transition-all duration-300 transform hover:scale-105 active:scale-95">
                  Book Free Strategy Call
                </button>
                <Link
                  href="/dashboard"
                  className="px-8 py-4 bg-white/10 border border-white/20 rounded-lg font-semibold text-white hover:bg-white/20 hover:border-cyan-400/50 transition-all duration-300 text-center">
                  Operations Portal
                </Link>
              </motion.div>

              {/* Trust Badges */}
              <motion.div
                className="pt-8 space-y-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.8 }}
              >
                {[
                  '✓ 50+ Agencies Using',
                  '✓ $10M+ Pipeline Generated',
                  '✓ 35-40% Open Rate',
                ].map((text, i) => (
                  <div key={i} className="text-gray-300 text-sm flex items-center gap-2">
                    <span className="text-cyan-400 font-bold">✓</span> {text.replace('✓ ', '')}
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* Hero Cards */}
            <motion.div
              className="relative"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            >
              <div className="space-y-5">
                <motion.div
                  className="bg-gradient-to-br from-cyan-400/15 to-purple-500/15 rounded-xl p-6 md:p-8 border border-cyan-400/30 backdrop-blur-xl"
                  whileHover={{ scale: 1.02, y: -5 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="text-sm font-semibold text-cyan-400 mb-3">📊 Real Results</div>
                  <div className="text-3xl md:text-4xl font-bold">3x Pipeline Growth</div>
                  <div className="text-sm text-gray-400 mt-2">In 90 Days</div>
                </motion.div>

                <motion.div
                  className="bg-gradient-to-br from-purple-500/15 to-cyan-400/15 rounded-xl p-6 md:p-8 border border-purple-500/30 backdrop-blur-xl"
                  whileHover={{ scale: 1.02, y: -5 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="text-sm font-semibold text-purple-400 mb-3">💰 Revenue Impact</div>
                  <div className="text-3xl md:text-4xl font-bold">₹50K-150K MRR</div>
                  <div className="text-sm text-gray-400 mt-2">New Recurring Revenue</div>
                </motion.div>

                <motion.div
                  className="bg-gradient-to-br from-cyan-400/15 to-purple-500/15 rounded-xl p-6 md:p-8 border border-cyan-400/30 backdrop-blur-xl"
                  whileHover={{ scale: 1.02, y: -5 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="text-sm font-semibold text-cyan-400 mb-3">⚡ Speed</div>
                  <div className="text-3xl md:text-4xl font-bold">5 Months Payback</div>
                  <div className="text-sm text-gray-400 mt-2">ROI Achieved</div>
                </motion.div>
              </div>

              {/* Floating Glow Elements */}
              <motion.div
                className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-400/5 rounded-full blur-3xl pointer-events-none"
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 5, repeat: Infinity }}
              />
              <motion.div
                className="absolute -bottom-20 -left-20 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"
                animate={{ scale: [1.2, 1, 1.2], opacity: [0.6, 0.3, 0.6] }}
                transition={{ duration: 5, repeat: Infinity, delay: 0.3 }}
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section id="problem" className="relative z-10 py-20 md:py-32 bg-gradient-to-b from-transparent via-slate-900/40 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: '-100px' }}
            className="mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">The Problem Nobody Talks About</h2>
            <p className="text-lg md:text-xl text-gray-300 text-center max-w-3xl mx-auto">
              Your pipeline is inconsistent. Your SDRs are burned out. Your CAC keeps rising. Growth plateau.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {[
              {
                icon: '📉',
                title: 'Inconsistent Pipeline',
                desc: '15-30 leads one month, 5 the next. No predictability.',
              },
              {
                icon: '😫',
                title: 'Burned Out Team',
                desc: 'Manual research, emails, tracking. Repetitive work = turnover.',
              },
              {
                icon: '💸',
                title: 'Expensive Growth',
                desc: 'SDRs cost ₹35L+/year. Ad costs rising. CAC out of control.',
              },
            ].map((item, i) => (
              <GlassmorphismCard key={i} delay={i * 0.1}>
                <div className="text-5xl mb-4">{item.icon}</div>
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-gray-400">{item.desc}</p>
              </GlassmorphismCard>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section id="solution" className="relative z-10 py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-center mb-16 md:mb-20"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: '-100px' }}
          >
            Meet JARVIS PRIME
          </motion.h2>

          <div className="grid lg:grid-cols-2 gap-12 md:gap-16 items-start">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true, margin: '-100px' }}
              className="space-y-8"
            >
              <div>
                <h3 className="text-3xl font-bold mb-4">AI-Powered Sales Automation</h3>
                <p className="text-gray-300 text-lg leading-relaxed">
                  We automate your entire outbound: finding prospects, personalizing outreach, tracking engagement, routing leads. Zero manual work.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  'Find 500+ qualified prospects',
                  'Send personalized AI emails at scale',
                  'Track opens, clicks, replies in real-time',
                  'Auto-route hot leads to sales',
                  'Optimize based on performance',
                ].map((feature, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-3"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    viewport={{ once: true, margin: '-100px' }}
                  >
                    <span className="text-cyan-400 text-xl font-bold mt-1 flex-shrink-0">✓</span>
                    <span className="text-lg text-gray-200">{feature}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true, margin: '-100px' }}
              className="space-y-5"
            >
              {[
                { title: 'ICP Scoring', desc: 'Only reach prospects that fit your model' },
                { title: 'Personalization', desc: 'Research-backed, relevant emails' },
                { title: 'Automation', desc: '24/7 outreach, zero manual work' },
                { title: 'Analytics', desc: 'Real-time performance dashboards' },
              ].map((item, i) => (
                <GlassmorphismCard key={i} delay={i * 0.1}>
                  <h4 className="text-lg font-semibold mb-2">{item.title}</h4>
                  <p className="text-gray-400">{item.desc}</p>
                </GlassmorphismCard>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative z-10 py-20 md:py-32 bg-gradient-to-b from-transparent via-slate-900/40 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-center mb-16 md:mb-20"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: '-100px' }}
          >
            How It Works
          </motion.h2>

          <div className="grid md:grid-cols-4 gap-6 md:gap-8">
            {[
              { step: '1', title: 'Define ICP', desc: 'Workshop your ideal customer profile' },
              { step: '2', title: 'Build List', desc: '500+ qualified prospects identified' },
              { step: '3', title: 'Send Campaigns', desc: 'Personalized sequences at scale' },
              { step: '4', title: 'Close Deals', desc: 'Qualified leads → sales → revenue' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.12 }}
                viewport={{ once: true, margin: '-100px' }}
              >
                <GlassmorphismCard className="h-full">
                  <div className="text-5xl md:text-6xl font-bold text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                  <p className="text-gray-400">{item.desc}</p>
                </GlassmorphismCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section id="results" className="relative z-10 py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: '-100px' }}
            className="mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">Proven Results</h2>
            <p className="text-lg text-gray-300 text-center">From real customers, real data</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8 mb-12">
            {[
              { metric: '3x', desc: 'Pipeline Growth' },
              { metric: '₹1.2L', desc: 'New MRR Added' },
              { metric: '5 Mo', desc: 'Payback Period' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true, margin: '-100px' }}
              >
                <GlassmorphismCard className="text-center h-full">
                  <div className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent mb-4">
                    {item.metric}
                  </div>
                  <p className="text-lg text-gray-400">{item.desc}</p>
                </GlassmorphismCard>
              </motion.div>
            ))}
          </div>

          <GlassmorphismCard className="p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-12">
              <div>
                <h3 className="text-2xl font-semibold mb-6 text-cyan-400">Email Performance</h3>
                <div className="space-y-5">
                  {[
                    { label: 'Open Rate', value: '38%' },
                    { label: 'Click Rate', value: '7.2%' },
                    { label: 'Reply Rate', value: '4.1%' },
                    { label: 'Meeting Conversion', value: '2.9%' },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center border-b border-white/10 pb-3 last:border-0">
                      <span className="text-gray-300">{item.label}</span>
                      <span className="font-bold text-lg text-cyan-400">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-semibold mb-6 text-purple-400">Sales Impact</h3>
                <div className="space-y-5">
                  {[
                    { label: 'Meetings/Month', value: '11-13' },
                    { label: 'Close Rate', value: '26%' },
                    { label: 'Deals/Month', value: '2-3' },
                    { label: 'Cost per Lead', value: '₹750' },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center border-b border-white/10 pb-3 last:border-0">
                      <span className="text-gray-300">{item.label}</span>
                      <span className="font-bold text-lg text-purple-400">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </GlassmorphismCard>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="relative z-10 py-20 md:py-32 bg-gradient-to-b from-transparent via-slate-900/40 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-center mb-16 md:mb-20"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: '-100px' }}
          >
            What Our Customers Say
          </motion.h2>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                quote: 'We went from 15 leads/month to 150 leads/month in 90 days. No hiring. Same team. Better results.',
                author: 'Priya Sharma',
                title: 'CEO, Crescendo Ventures',
                metric: '10x Growth',
              },
              {
                quote: 'Our close rate improved 40% because leads were higher quality. Every prospect was actually a fit.',
                author: 'Vikram Patel',
                title: 'VP Sales, Crescendo Ventures',
                metric: '+40% Close Rate',
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.2 }}
                viewport={{ once: true, margin: '-100px' }}
              >
                <GlassmorphismCard className="flex flex-col h-full">
                  <p className="text-lg mb-8 flex-grow italic text-gray-200">"{item.quote}"</p>
                  <div className="pt-4 border-t border-white/10">
                    <div className="font-semibold">{item.author}</div>
                    <div className="text-sm text-gray-400">{item.title}</div>
                    <div className="text-cyan-400 font-semibold mt-2 text-sm">{item.metric}</div>
                  </div>
                </GlassmorphismCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="relative z-10 py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: '-100px' }}
            className="mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">Simple, Transparent Pricing</h2>
            <p className="text-lg text-gray-300 text-center">No setup fees. No long-term contracts. Cancel anytime.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8 mb-12">
            {[
              {
                name: 'Starter',
                price: '₹12,000',
                period: '/month',
                features: ['1,000 emails/month', 'Basic ICP', 'Lead routing', 'Weekly optimization'],
              },
              {
                name: 'Professional',
                price: '₹29,000',
                period: '/month',
                features: ['5,000 emails/month', 'Advanced ICP', 'Lead routing + LinkedIn', 'Bi-weekly calls', 'Advanced analytics'],
                highlighted: true,
              },
              {
                name: 'Enterprise',
                price: 'Custom',
                period: '',
                features: ['Unlimited emails', 'Full Salesforce sync', 'Phone automation', 'Dedicated AM', 'Custom sequences'],
              },
            ].map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.12 }}
                viewport={{ once: true, margin: '-100px' }}
                className={plan.highlighted ? 'md:scale-105 md:-my-4' : ''}
              >
                <GlassmorphismCard
                  className={`flex flex-col h-full ${
                    plan.highlighted ? 'border-cyan-400/80 bg-cyan-400/5' : ''
                  }`}
                >
                  <h3 className="text-2xl font-bold mb-4">{plan.name}</h3>
                  <div className="mb-8">
                    <span className="text-4xl md:text-5xl font-bold">{plan.price}</span>
                    <span className="text-gray-400 text-sm">{plan.period}</span>
                  </div>

                  <ul className="space-y-3 mb-8 flex-grow">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <span className="text-cyan-400 mt-1 flex-shrink-0">✓</span>
                        <span className="text-gray-300 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    className={`w-full py-3 rounded-lg font-semibold transition-all ${
                      plan.highlighted
                        ? 'bg-gradient-to-r from-cyan-400 to-purple-500 text-slate-950 hover:shadow-lg hover:shadow-cyan-400/50'
                        : 'border border-cyan-400/50 hover:bg-cyan-400/10'
                    }`}
                  >
                    Get Started
                  </button>
                </GlassmorphismCard>
              </motion.div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-gray-300">
              Get 90 days free to test. <span className="text-cyan-400 font-semibold">No credit card required.</span>
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-20 md:py-32 bg-gradient-to-b from-transparent via-slate-900/40 to-transparent">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: '-100px' }}
            className="space-y-8"
          >
            <h2 className="text-4xl md:text-5xl font-bold">Ready to Scale Your Outbound?</h2>
            <p className="text-xl text-gray-300">
              Schedule a free 30-minute strategy call. We'll audit your current process and show you exactly how to 3x your pipeline.
            </p>
            <button 
              onClick={() => setShowCalendly(true)}
              className="inline-block px-10 py-4 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-lg font-semibold text-slate-950 hover:shadow-2xl hover:shadow-cyan-400/50 transition-all duration-300 transform hover:scale-105"
            >
              Book Your Free Call
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-12 md:py-16 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent mb-4">
                JARVIS PRIME
              </div>
              <p className="text-gray-400 text-sm">AI-powered sales automation</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <div className="space-y-2 text-sm text-gray-400">
                <a href="#" className="hover:text-cyan-400 transition-colors">Features</a>
                <a href="#pricing" className="hover:text-cyan-400 transition-colors">Pricing</a>
                <a href="#" className="hover:text-cyan-400 transition-colors">Enterprise</a>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <div className="space-y-2 text-sm text-gray-400">
                <a href="#" className="hover:text-cyan-400 transition-colors">About</a>
                <a href="#" className="hover:text-cyan-400 transition-colors">Blog</a>
                <a href="#" className="hover:text-cyan-400 transition-colors">Contact</a>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <div className="space-y-2 text-sm text-gray-400">
                <a href="#" className="hover:text-cyan-400 transition-colors">Privacy</a>
                <a href="#" className="hover:text-cyan-400 transition-colors">Terms</a>
                <a href="#" className="hover:text-cyan-400 transition-colors">Security</a>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 text-center text-sm text-gray-400">
            <p>© 2026 JARVIS PRIME. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
