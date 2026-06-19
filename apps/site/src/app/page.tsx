'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import { ArrowRight, CheckCircle2, TrendingUp, Users, Zap, BarChart3, Lock } from 'lucide-react';

export default function HomePage() {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  return (
    <div className="relative w-full overflow-x-hidden bg-slate-950">
      <Header />
      
      {/* Hero Section - Premium Dark */}
      <section className="relative z-10 pt-40 pb-32 px-4 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full mb-8">
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
            <span className="text-sm font-semibold text-blue-300">AI-Powered Outbound</span>
          </div>

          <h1 className="text-6xl md:text-7xl lg:text-8xl font-black mb-8 leading-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-200 to-cyan-200">
            Scale Your Pipeline Without Hiring
          </h1>

          <p className="text-xl md:text-2xl text-slate-300 mb-12 max-w-3xl mx-auto leading-relaxed font-light">
            JARVIS PRIME automates lead research, personalized outreach, and meeting booking. Stop burning out on manual prospecting. Get 8-30 qualified calls/month on autopilot.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <a href="/book-call" className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-lg rounded-lg hover:shadow-2xl hover:shadow-blue-500/50 transition-all flex items-center gap-2">
              Get Started Free
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a href="#how" className="px-8 py-4 border-2 border-slate-600 text-slate-300 hover:border-blue-500 hover:text-blue-300 rounded-lg font-semibold transition-all">
              See How It Works
            </a>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-cyan-400 mb-1">8-30</div>
              <div className="text-sm text-slate-400">Qualified Meetings/Mo</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-cyan-400 mb-1">50%</div>
              <div className="text-sm text-slate-400">Cost of Hiring SDR</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-cyan-400 mb-1">7 Days</div>
              <div className="text-sm text-slate-400">To First Outreach</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how" className="relative z-10 py-32 px-4 bg-slate-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-black mb-4 text-white">
              How JARVIS PRIME Works
            </h2>
            <p className="text-xl text-slate-400">
              Done-for-you outbound that actually converts
            </p>
          </div>

          <div className="space-y-6">
            {[
              {
                num: '01',
                title: 'Strategic Research',
                desc: 'We build your ideal customer profile and identify high-intent prospects in your target market.',
                icon: Users
              },
              {
                num: '02',
                title: 'AI-Powered Outreach',
                desc: 'Personalized emails and LinkedIn campaigns crafted specifically for decision-makers.',
                icon: Zap
              },
              {
                num: '03',
                title: 'Intelligent Follow-Up',
                desc: 'Automated sequences that nurture relationships and move prospects toward conversations.',
                icon: TrendingUp
              },
              {
                num: '04',
                title: 'Meeting Booking',
                desc: 'Qualified prospects are qualified, time-zone aligned, and booked directly on your calendar.',
                icon: CheckCircle2
              }
            ].map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={idx} className="group">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-800/50 border border-slate-700 hover:border-blue-500/50 rounded-xl p-8 transition-all hover:shadow-lg hover:shadow-blue-500/10">
                    <div className="flex gap-8 items-start">
                      <div className="flex-shrink-0">
                        <div className="flex items-center justify-center h-16 w-16 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600">
                          <Icon className="w-8 h-8 text-white" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-white mb-2">{step.title}</h3>
                        <p className="text-slate-400 text-lg">{step.desc}</p>
                      </div>
                    </div>
                  </div>
                  {idx < 3 && (
                    <div className="flex justify-end pr-8 py-4">
                      <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-transparent"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Results/Metrics Section */}
      <section id="results" className="relative z-10 py-32 px-4 bg-slate-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-black mb-4 text-white">
              Enterprise-Grade Results
            </h2>
            <p className="text-xl text-slate-400">
              Real metrics from real outbound campaigns
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { metric: '8-30', label: 'Qualified Calls/Month', icon: BarChart3 },
              { metric: '35-45%', label: 'Email Open Rate', icon: TrendingUp },
              { metric: '5-8%', label: 'Reply Rate', icon: CheckCircle2 },
              { metric: '7-14', label: 'Days to 1st Meeting', icon: Zap }
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="group bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 hover:border-blue-500/50 rounded-xl p-8 text-center transition-all hover:shadow-lg hover:shadow-blue-500/10">
                  <Icon className="w-10 h-10 text-cyan-400 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                  <div className="text-4xl font-black text-white mb-2">{item.metric}</div>
                  <div className="text-slate-400 font-medium">{item.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ROI Section */}
      <section className="relative z-10 py-20 px-4 bg-gradient-to-r from-blue-950/50 to-cyan-950/50 border-y border-slate-700">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            ROI You Can Measure Immediately
          </h2>
          <p className="text-lg text-slate-300">
            One qualified deal typically pays for 6+ months of JARVIS PRIME. Your cost per meeting drops by 70% vs hiring an SDR.
          </p>
        </div>
      </section>

      {/* Premium Pricing Section */}
      <section id="pricing" className="relative z-10 py-32 px-4 bg-slate-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-black mb-6 text-white">
              Enterprise Pricing
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Choose your scale. Pay only for results. Cancel anytime.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {/* STARTER */}
            <div className="relative group rounded-2xl p-8 bg-slate-800 border border-slate-700 hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10 transition-all hover:-translate-y-2">
              <div className="mb-8">
                <h3 className="text-2xl font-black text-white mb-2">STARTER</h3>
                <p className="text-sm text-slate-400 mb-6">Perfect for testing. Freelancers & small teams.</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-5xl font-black text-white">₹24,999</span>
                  <span className="text-slate-400">/month</span>
                </div>
                <p className="text-sm text-cyan-400 font-semibold">3-5 Meetings/Month Expected</p>
              </div>

              <div className="space-y-3 mb-8">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">500 prospects monthly</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">AI personalized outreach</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Email campaigns</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Auto follow-ups</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Monthly reports</span>
                </div>
              </div>

              <a href="/book-call" className="w-full py-3 px-6 rounded-lg font-bold text-center border-2 border-slate-600 text-white hover:border-cyan-500 hover:bg-slate-700 transition-all">
                Start Free Trial
              </a>
            </div>

            {/* GROWTH - FEATURED */}
            <div className="relative group rounded-2xl p-8 bg-gradient-to-br from-blue-600 to-cyan-600 border-2 border-blue-500 shadow-2xl hover:shadow-3xl hover:-translate-y-4 transition-all md:scale-105">
              <div className="absolute -top-5 right-6 bg-white text-blue-600 px-4 py-1 rounded-full font-black text-sm">
                MOST POPULAR
              </div>

              <div className="mb-8">
                <h3 className="text-2xl font-black text-white mb-2">GROWTH</h3>
                <p className="text-sm text-blue-100 mb-6">Best for scaling. Agencies & consulting.</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-5xl font-black text-white">₹49,999</span>
                  <span className="text-blue-100">/month</span>
                </div>
                <p className="text-sm text-blue-50 font-semibold">8-15 Meetings/Month Expected</p>
              </div>

              <div className="space-y-3 mb-8">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-blue-50">Everything in Starter +</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-blue-50">2,000 prospects monthly</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-blue-50">LinkedIn outreach</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-blue-50">Multi-channel campaigns</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-blue-50">CRM integration</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-blue-50">Weekly optimization</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-blue-50">Priority support</span>
                </div>
              </div>

              <a href="/book-call" className="w-full py-3 px-6 rounded-lg font-bold text-center bg-white text-blue-600 hover:bg-slate-100 transition-all">
                Scale Your Pipeline
              </a>
            </div>

            {/* SCALE */}
            <div className="relative group rounded-2xl p-8 bg-slate-800 border border-slate-700 hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10 transition-all hover:-translate-y-2">
              <div className="mb-8">
                <h3 className="text-2xl font-black text-white mb-2">SCALE</h3>
                <p className="text-sm text-slate-400 mb-6">Enterprise growth. Maximum results.</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-5xl font-black text-white">₹99,999</span>
                  <span className="text-slate-400">/month</span>
                </div>
                <p className="text-sm text-cyan-400 font-semibold">15-30 Meetings/Month Expected</p>
              </div>

              <div className="space-y-3 mb-8">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Everything in Growth +</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">5,000+ prospects monthly</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Dedicated campaign manager</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">AI lead scoring</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Custom strategy</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Advanced analytics</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">VIP support</span>
                </div>
              </div>

              <a href="/book-call" className="w-full py-3 px-6 rounded-lg font-bold text-center bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg transition-all">
                Enterprise Access
              </a>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 text-center max-w-2xl mx-auto">
            <Lock className="w-8 h-8 text-cyan-400 mx-auto mb-4" />
            <p className="text-slate-300">
              <span className="font-bold text-white">No long-term contracts.</span> Month-to-month billing. Cancel anytime. We focus on results, not lock-in.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="relative z-10 py-32 px-4 bg-slate-900 border-t border-slate-700">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-black mb-4 text-white">
              Frequently Asked
            </h2>
            <p className="text-xl text-slate-400">
              Everything you need to know
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                q: 'How quickly can campaigns launch?',
                a: 'We can launch your first campaign within 7-10 days of onboarding. You\'ll see initial outreach results within 2-3 weeks, and first qualified meetings typically appear within 3-4 weeks.'
              },
              {
                q: 'Do you work with agencies?',
                a: 'Yes, agencies are our specialty. We work with marketing agencies, development agencies, recruiting firms, and B2B consultancies. Our system is optimized for service-based businesses with high-ticket offerings.'
              },
              {
                q: 'Do you provide leads or just the system?',
                a: 'We provide everything—research, prospect targeting, personalized outreach, follow-ups, and meeting bookings. You get qualified prospects delivered to your calendar. It\'s done-for-you, not DIY.'
              },
              {
                q: 'Is there a long-term contract?',
                a: 'No. All plans are month-to-month. No setup fees, no long-term commitment. If we\'re not delivering results, you can cancel anytime. We\'re confident in our results.'
              },
              {
                q: 'How are meetings qualified?',
                a: 'We use AI lead scoring to qualify prospects based on your ICP (Ideal Customer Profile). Each person we book has been pre-qualified for relevance, budget authority, and buying timeline before they hit your calendar.'
              },
              {
                q: 'How is this different from hiring an SDR?',
                a: 'Hiring an SDR costs ₹1.5L-2L/month, takes 2-3 months to ramp, and requires management overhead. JARVIS PRIME is predictable, instant, and done-for-you at a fraction of the cost. Plus, we guarantee results.'
              }
            ].map((faq, idx) => (
              <div key={idx} className="border border-slate-700 rounded-xl overflow-hidden bg-slate-800/50 hover:bg-slate-800 transition-all">
                <button
                  onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
                  className="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-slate-700/50 transition-colors"
                >
                  <span className="font-bold text-white text-lg">{faq.q}</span>
                  <span className="text-2xl text-cyan-400">{faqOpen === idx ? '−' : '+'}</span>
                </button>
                {faqOpen === idx && (
                  <div className="px-6 py-4 bg-slate-900/50 border-t border-slate-700">
                    <p className="text-slate-300 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <p className="text-slate-400 mb-4">Still have questions?</p>
            <a href="tel:+918810500723" className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 font-semibold text-lg">
              <ArrowRight className="w-5 h-5" />
              Schedule a call
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-slate-950 border-t border-slate-800 py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <img src="/logo-white.svg" alt="JARVIS PRIME" className="h-8 w-auto mb-4" />
              <p className="text-slate-400 text-sm">
                AI-powered outbound automation for B2B companies that scale.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-white mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#pricing" className="hover:text-cyan-400 transition-colors">Pricing</a></li>
                <li><a href="#how" className="hover:text-cyan-400 transition-colors">How It Works</a></li>
                <li><a href="#faq" className="hover:text-cyan-400 transition-colors">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-white mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="mailto:hello@jarvisprime.me" className="hover:text-cyan-400 transition-colors">Contact</a></li>
                <li><a href="tel:+918810500723" className="hover:text-cyan-400 transition-colors">Call Us</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-white mb-4">Connect</h3>
              <div className="flex gap-3">
                <a 
                  href="https://www.linkedin.com/company/jarvis-prime-ai" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-blue-600 flex items-center justify-center transition-all"
                >
                  <svg className="w-5 h-5 text-slate-400 hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
                <a 
                  href="https://x.com/jarvisprime_ai" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-black flex items-center justify-center transition-all"
                >
                  <svg className="w-5 h-5 text-slate-400 hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 text-center text-sm text-slate-500">
            <p>&copy; 2026 JARVIS PRIME. Enterprise AI Outbound System.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
