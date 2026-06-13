'use client';

import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X } from 'lucide-react';

// Floating Particles Background
const FloatingParticles = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const particles = Array.from({ length: 20 }, (_, i) => i);
  
  if (!mounted) return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {particles.map((i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-cyan-400/30 rounded-full"
          initial={{
            x: Math.random() * 1000,
            y: Math.random() * 1000,
          }}
          animate={{
            x: Math.random() * 1000,
            y: Math.random() * 1000,
          }}
          transition={{
            duration: Math.random() * 20 + 10,
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
        className="absolute inset-0 opacity-20"
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
    viewport={{ once: true }}
    className={`backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 hover:border-cyan-400/50 transition-all duration-300 ${className}`}
  >
    {children}
  </motion.div>
);

// Section Wrapper
interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

const Section = ({ children, className = '', id = '' }: SectionProps) => (
  <motion.section
    id={id}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    transition={{ duration: 0.6 }}
    viewport={{ once: true }}
    className={`relative z-10 py-20 lg:py-32 ${className}`}
  >
    {children}
  </motion.section>
);

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showCalendly, setShowCalendly] = useState(false);
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 300], [1, 0.5]);

  return (
    <div className="bg-slate-950 text-white font-inter overflow-x-hidden">
      {/* Background Effects */}
      <GradientBg />
      <FloatingParticles />

      {/* Add padding-top to body to account for fixed nav */}
      <div className="pt-16">
        {/* Navigation */}
        <motion.nav
          style={{ opacity }}
          className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-slate-950/90 border-b border-white/10 h-16"
        >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center h-16">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent"
          >
            JARVIS PRIME
          </motion.div>

          {/* Desktop Menu */}
          <div className="hidden md:flex gap-8 items-center">
            {['Problem', 'Solution', 'Results', 'Pricing'].map((item, i) => (
              <motion.a
                key={item}
                href={`#${item.toLowerCase()}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="text-muted-text hover:text-cyan-400 transition-colors"
              >
                {item}
              </motion.a>
            ))}
            <motion.a
              href="#contact"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="px-6 py-2 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-lg font-semibold hover:shadow-lg hover:shadow-cyan-400/50 transition-all"
            >
              Book Call
            </motion.a>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-cyan-400"
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
              className="md:hidden bg-slate-900/95 border-t border-white/10"
            >
              <div className="px-4 py-4 space-y-3">
                {['Problem', 'Solution', 'Results', 'Pricing'].map((item) => (
                  <a
                    key={item}
                    href={`#${item.toLowerCase()}`}
                    className="block text-muted-text hover:text-cyan-400 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item}
                  </a>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Hero Section */}
      <Section className="pt-12 md:pt-20 lg:pt-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Hero Content */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <motion.h1
                className="text-5xl md:text-7xl font-bold mb-6 leading-tight"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                AI Outbound{' '}
                <span className="bg-gradient-to-r from-cyan-400 via-purple-500 to-cyan-400 bg-clip-text text-transparent animate-pulse">
                  at Scale
                </span>
              </motion.h1>

              <motion.p
                className="text-xl text-muted-text mb-8 leading-relaxed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                Generate 50-100 qualified leads per month. Book 8-12 discovery calls. Close 1-2 deals. All automated. Zero manual work required.
              </motion.p>

              <motion.div
                className="flex flex-col sm:flex-row gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => setShowCalendly(true)}
                    className="px-8 py-4 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-lg font-semibold text-slate-950 hover:shadow-2xl hover:shadow-cyan-400/50 transition-all transform hover:scale-105">
                    Book Free Strategy Call
                  </button>
                  <Link
                    href="/dashboard"
                    className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-semibold text-white hover:shadow-2xl hover:shadow-purple-500/50 transition-all transform hover:scale-105 text-center">
                    Operations Portal
                  </Link>
                </div>
              </motion.div>

              {/* Trust Badges */}
              <motion.div
                className="mt-12 flex flex-wrap gap-6 text-muted-text text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> 50+ Agencies
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> $10M+ Pipeline Generated
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> 35-40% Open Rate
                </div>
              </motion.div>
            </motion.div>

            {/* Hero Visual */}
            <motion.div
              className="relative"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <GlassmorphismCard className="p-8">
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-cyan-400/20 to-purple-500/20 rounded-lg p-4 border border-cyan-400/30">
                    <div className="text-sm font-semibold text-cyan-400 mb-2">📊 Real Results</div>
                    <div className="text-2xl font-bold">3x Pipeline Growth</div>
                    <div className="text-sm text-muted-text mt-1">In 90 Days</div>
                  </div>
                  <div className="bg-gradient-to-r from-purple-500/20 to-cyan-400/20 rounded-lg p-4 border border-purple-500/30">
                    <div className="text-sm font-semibold text-purple-400 mb-2">💰 Revenue Impact</div>
                    <div className="text-2xl font-bold">₹50K-150K MRR</div>
                    <div className="text-sm text-muted-text mt-1">New Recurring Revenue</div>
                  </div>
                  <div className="bg-gradient-to-r from-cyan-400/20 to-purple-500/20 rounded-lg p-4 border border-cyan-400/30">
                    <div className="text-sm font-semibold text-cyan-400 mb-2">⚡ Speed</div>
                    <div className="text-2xl font-bold">5 Months Payback</div>
                    <div className="text-sm text-muted-text mt-1">ROI Achieved</div>
                  </div>
                </div>
              </GlassmorphismCard>

              {/* Floating Elements */}
              <motion.div
                className="absolute -top-8 -right-8 w-24 h-24 bg-cyan-400/20 rounded-full blur-3xl"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
              <motion.div
                className="absolute -bottom-8 -left-8 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl"
                animate={{ scale: [1.2, 1, 1.2] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
            </motion.div>
          </div>
        </div>
      </Section>

      {/* Problem Section */}
      <Section id="problem" className="bg-gradient-to-b from-transparent via-slate-900/50 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-center mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            The Problem Nobody Talks About
          </motion.h2>

          <motion.p
            className="text-xl text-muted-text text-center mb-16 max-w-3xl mx-auto"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            viewport={{ once: true }}
          >
            Your pipeline is inconsistent. Your SDRs are burned out. Your CAC keeps rising. And you're stuck in a growth plateau.
          </motion.p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '📉',
                title: 'Inconsistent Pipeline',
                desc: '15-30 leads one month, 5 the next. No predictability. No control.',
              },
              {
                icon: '😫',
                title: 'Burned Out Team',
                desc: 'Manual research, copy-paste emails, spreadsheet tracking. Repetitive work = high turnover.',
              },
              {
                icon: '💸',
                title: 'Expensive Growth',
                desc: 'SDRs cost ₹35L+/year. Ad costs keep rising. CAC is out of control.',
              },
            ].map((item, i) => (
              <GlassmorphismCard key={i} delay={i * 0.1}>
                <div className="text-4xl mb-4">{item.icon}</div>
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-muted-text">{item.desc}</p>
              </GlassmorphismCard>
            ))}
          </div>
        </div>
      </Section>

      {/* Solution Section */}
      <Section id="solution">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-center mb-16"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Meet JARVIS PRIME
          </motion.h2>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h3 className="text-3xl font-bold mb-6">AI-Powered Sales Automation</h3>
              <p className="text-muted-text text-lg mb-8">
                We automate your entire outbound process: finding prospects, personalizing outreach, tracking engagement, and routing leads to your sales team. Zero manual work required.
              </p>

              <div className="space-y-4">
                {[
                  'Find 500+ qualified prospects in your market',
                  'Send personalized emails at scale (AI-powered)',
                  'Track every open, click, and reply in real-time',
                  'Auto-route hot leads to your sales team',
                  'Optimize based on performance data',
                ].map((feature, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-3"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    viewport={{ once: true }}
                  >
                    <span className="text-cyan-400 text-xl mt-1">✓</span>
                    <span className="text-lg">{feature}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              {[
                { title: 'ICP Scoring', desc: 'Only reach prospects that fit your model' },
                { title: 'Personalization', desc: 'Research-backed, relevant emails' },
                { title: 'Automation', desc: '24/7 outreach, zero manual work' },
                { title: 'Analytics', desc: 'Real-time performance dashboards' },
              ].map((item, i) => (
                <GlassmorphismCard key={i} delay={i * 0.1}>
                  <h4 className="text-lg font-semibold mb-2">{item.title}</h4>
                  <p className="text-muted-text">{item.desc}</p>
                </GlassmorphismCard>
              ))}
            </motion.div>
          </div>
        </div>
      </Section>

      {/* How It Works Section */}
      <Section className="bg-gradient-to-b from-slate-900/50 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-center mb-16"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            How It Works
          </motion.h2>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                step: '1',
                title: 'Define ICP',
                desc: 'We workshop your ideal customer profile',
              },
              {
                step: '2',
                title: 'Build List',
                desc: '500+ qualified prospects identified',
              },
              {
                step: '3',
                title: 'Send Campaigns',
                desc: 'Personalized sequences at scale',
              },
              {
                step: '4',
                title: 'Close Deals',
                desc: 'Qualified leads → sales team → revenue',
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.15 }}
                viewport={{ once: true }}
              >
                <GlassmorphismCard>
                  <div className="text-5xl font-bold text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                  <p className="text-muted-text">{item.desc}</p>
                </GlassmorphismCard>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Results Section */}
      <Section id="results">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-center mb-4"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Proven Results
          </motion.h2>

          <motion.p
            className="text-xl text-muted-text text-center mb-16 max-w-3xl mx-auto"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            viewport={{ once: true }}
          >
            From Crescendo Ventures (real customer, real data)
          </motion.p>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
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
                viewport={{ once: true }}
              >
                <GlassmorphismCard className="text-center">
                  <div className="text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent mb-4">
                    {item.metric}
                  </div>
                  <p className="text-lg text-muted-text">{item.desc}</p>
                </GlassmorphismCard>
              </motion.div>
            ))}
          </div>

          {/* Detailed Results */}
          <GlassmorphismCard className="p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-2xl font-semibold mb-6 text-cyan-400">Email Performance</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Open Rate', value: '38%' },
                    { label: 'Click Rate', value: '7.2%' },
                    { label: 'Reply Rate', value: '4.1%' },
                    { label: 'Conversion to Meeting', value: '2.9%' },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-muted-text">{item.label}</span>
                      <span className="font-bold text-lg">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-semibold mb-6 text-purple-400">Sales Impact</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Meetings/Month', value: '11-13' },
                    { label: 'Close Rate', value: '26%' },
                    { label: 'Deals/Month', value: '2-3' },
                    { label: 'Cost per Lead', value: '₹750' },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-muted-text">{item.label}</span>
                      <span className="font-bold text-lg">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </GlassmorphismCard>
        </div>
      </Section>

      {/* Testimonials Section */}
      <Section className="bg-gradient-to-b from-transparent via-slate-900/50 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-center mb-16"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            What Our Customers Say
          </motion.h2>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                quote:
                  'We went from 15 leads/month to 150 leads/month in 90 days. No hiring. Same team. Better results.',
                author: 'Priya Sharma',
                title: 'CEO, Crescendo Ventures',
                metric: '10x Growth',
              },
              {
                quote:
                  'Our close rate improved 40% because the leads were higher quality. Every prospect was actually a fit.',
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
                viewport={{ once: true }}
              >
                <GlassmorphismCard className="flex flex-col h-full">
                  <p className="text-lg mb-6 flex-grow italic">"{item.quote}"</p>
                  <div>
                    <div className="font-semibold">{item.author}</div>
                    <div className="text-sm text-muted-text">{item.title}</div>
                    <div className="text-cyan-400 font-semibold mt-2 text-sm">{item.metric}</div>
                  </div>
                </GlassmorphismCard>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Pricing Section */}
      <Section id="pricing">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-center mb-4"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Simple, Transparent Pricing
          </motion.h2>

          <motion.p
            className="text-xl text-muted-text text-center mb-16 max-w-3xl mx-auto"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            viewport={{ once: true }}
          >
            No setup fees. No long-term contracts. Cancel anytime.
          </motion.p>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {[
              {
                name: 'Starter',
                price: '₹12,000',
                period: '/month',
                cta: 'Get Started',
                features: ['1,000 emails/month', 'Basic ICP', 'Lead routing', 'Weekly optimization'],
                highlighted: false,
              },
              {
                name: 'Professional',
                price: '₹29,000',
                period: '/month',
                cta: 'Most Popular',
                features: ['5,000 emails/month', 'Advanced ICP', 'Lead routing + LinkedIn', 'Bi-weekly calls', 'Advanced analytics'],
                highlighted: true,
              },
              {
                name: 'Enterprise',
                price: 'Custom',
                period: '',
                cta: 'Contact Us',
                features: ['Unlimited emails', 'Full Salesforce sync', 'Phone automation', 'Dedicated AM', 'Custom sequences'],
                highlighted: false,
              },
            ].map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.15 }}
                viewport={{ once: true }}
                className={plan.highlighted ? 'md:scale-105' : ''}
              >
                <GlassmorphismCard
                  className={`flex flex-col h-full ${
                    plan.highlighted ? 'border-cyan-400/80 bg-cyan-400/5' : ''
                  }`}
                >
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <div className="mb-6">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-text">{plan.period}</span>
                  </div>

                  <ul className="space-y-3 mb-8 flex-grow">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <span className="text-cyan-400 mt-1">✓</span>
                        <span className="text-muted-text">{feature}</span>
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
                    {plan.cta}
                  </button>
                </GlassmorphismCard>
              </motion.div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-muted-text">
              Get 90 days free to test everything.{' '}
              <a href="#contact" className="text-cyan-400 font-semibold hover:underline">
                No credit card required.
              </a>
            </p>
          </div>
        </div>
      </Section>

      {/* FAQ Section */}
      <Section className="bg-gradient-to-b from-slate-900/50 to-transparent">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-center mb-16"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Frequently Asked Questions
          </motion.h2>

          <div className="space-y-4">
            {[
              {
                q: 'How long before we see results?',
                a: 'Week 1-2: system setup. Week 3-4: first meetings. Month 3: first deals closing with ₹50K-150K new MRR.',
              },
              {
                q: 'Can we cancel anytime?',
                a: 'Yes. No long-term contracts. Month-to-month. Cancel anytime with no penalties.',
              },
              {
                q: 'Do you guarantee results?',
                a: 'We guarantee 30+ leads + 5+ meetings in 90 days, or we refund your investment. Results depend on your product and sales team.',
              },
              {
                q: 'What if we already do outbound?',
                a: 'We can improve your results 3-5x with better personalization, ICP scoring, and automation.',
              },
              {
                q: 'How many emails can we send per day?',
                a: 'Starter: 100/day. Professional: 500/day. Enterprise: Unlimited. All automated, personalized.',
              },
              {
                q: 'Do we need to hire someone?',
                a: 'No. Everything is automated. Your existing team handles calls and closes. Zero hiring required.',
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                viewport={{ once: true }}
              >
                <GlassmorphismCard>
                  <h3 className="text-lg font-semibold mb-3 text-cyan-400">{item.q}</h3>
                  <p className="text-muted-text">{item.a}</p>
                </GlassmorphismCard>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Contact Section */}
      <Section id="contact" className="py-20 md:py-32">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.h2
            className="text-4xl md:text-5xl font-bold mb-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Ready to 3x Your Pipeline?
          </motion.h2>

          <motion.p
            className="text-xl text-muted-text mb-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            viewport={{ once: true }}
          >
            Let's talk about your specific situation and show you exactly how this would work for your business.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            viewport={{ once: true }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <button className="px-8 py-4 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-lg font-semibold text-slate-950 hover:shadow-2xl hover:shadow-cyan-400/50 transition-all transform hover:scale-105">
              Book Free Strategy Call
            </button>
            <button className="px-8 py-4 border border-cyan-400/50 rounded-lg font-semibold hover:bg-cyan-400/10 transition-all">
              Email: anuj@jarvisprime.com
            </button>
          </motion.div>

          <motion.p
            className="text-muted-text mt-8"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            viewport={{ once: true }}
          >
            No credit card required. No contracts. 90-day free pilot available.
          </motion.p>
        </div>
      </Section>

      {/* Footer */}
      <motion.footer
        className="border-t border-white/10 bg-slate-950/50 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-bold text-lg mb-4">JARVIS PRIME</h3>
              <p className="text-muted-text">AI-powered outbound sales automation.</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-muted-text">
                <li><a href="#" className="hover:text-cyan-400 transition">Features</a></li>
                <li><a href="#pricing" className="hover:text-cyan-400 transition">Pricing</a></li>
                <li><a href="#" className="hover:text-cyan-400 transition">Case Studies</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-muted-text">
                <li><a href="#" className="hover:text-cyan-400 transition">About</a></li>
                <li><a href="#" className="hover:text-cyan-400 transition">Blog</a></li>
                <li><a href="#" className="hover:text-cyan-400 transition">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-muted-text">
                <li><a href="#" className="hover:text-cyan-400 transition">Privacy</a></li>
                <li><a href="#" className="hover:text-cyan-400 transition">Terms</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8 text-center text-muted-text">
            <p>© 2026 JARVIS PRIME. All rights reserved. Made with ❤️ for B2B companies.</p>
          </div>
        </div>
      </motion.footer>

      {/* Calendly Modal */}
      <AnimatePresence>
        {showCalendly && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowCalendly(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            >
              <div className="sticky top-0 flex justify-between items-center p-6 border-b border-white/10 bg-slate-900">
                <h2 className="text-2xl font-bold">Book Your Free Strategy Call</h2>
                <button
                  onClick={() => setShowCalendly(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6">
                <div className="mb-6">
                  <p className="text-muted-text mb-4">
                    Schedule a 30-minute strategy call with our team to discuss how JARVIS PRIME can help you generate qualified leads and close more deals.
                  </p>
                  <div className="space-y-3 text-sm text-muted-text">
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400">✓</span> Personalized strategy for your business
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400">✓</span> ROI projections based on your niche
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400">✓</span> Free audit of your current outreach process
                    </div>
                  </div>
                </div>
                
                {/* Calendly Embed */}
                <div className="bg-slate-800 rounded-lg p-4 border border-white/10">
                  <p className="text-center text-muted-text mb-4">
                    📅 Calendly integration would appear here
                  </p>
                  <a
                    href="https://calendly.com/your-username/30min"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full px-6 py-3 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-lg font-semibold text-slate-950 text-center hover:shadow-lg hover:shadow-cyan-400/50 transition-all"
                  >
                    Open Calendly Link
                  </a>
                  <p className="text-xs text-muted-text text-center mt-3">
                    💡 Tip: Replace the URL above with your actual Calendly link
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
