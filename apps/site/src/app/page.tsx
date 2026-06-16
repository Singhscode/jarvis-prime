'use client';

import { useState } from 'react';
import Header from '@/components/Header';

export default function HomePage() {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  return (
    <div className="relative w-full overflow-x-hidden bg-white">
      <Header />
      
      {/* Hero Section */}
      <section className="relative z-10 pt-32 pb-20 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-full mb-6">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-sm font-semibold text-green-900">For Marketing Agencies Only</span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
            8-15 Qualified Meetings <span className="text-blue-600">in 60 Days</span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-4xl mx-auto leading-relaxed">
            We find your clients and book your meetings. If you don't get 8+ qualified meetings in your first 60 days, <span className="font-semibold text-gray-900">your first month is free.</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <a href="/book-call" className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold text-lg shadow-lg hover:shadow-xl">
              Schedule Demo Call →
            </a>
            <a href="#guarantee" className="px-8 py-4 border-2 border-gray-300 text-gray-900 rounded-lg hover:border-blue-600 hover:text-blue-600 transition-all font-semibold text-lg">
              See How It Works
            </a>
          </div>

          <div className="flex flex-wrap justify-center gap-8 items-center text-sm mt-12">
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-bold text-lg">✓</span>
              <span className="text-gray-600">Done-for-you outbound</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-bold text-lg">✓</span>
              <span className="text-gray-600">Money-back guarantee</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-bold text-lg">✓</span>
              <span className="text-gray-600">No setup fees</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="guarantee" className="relative z-10 py-20 px-4 bg-gray-50 border-y border-gray-200">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              How We Get You Meetings
            </h2>
            <p className="text-xl text-gray-600">
              Simple process. Guaranteed results.
            </p>
          </div>

          <div className="space-y-8">
            <div className="flex gap-6 items-start p-6 bg-white rounded-xl border-2 border-gray-200 hover:border-blue-400 transition-all">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white font-bold text-xl">
                  01
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-gray-900">We Find Your Clients</h3>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                    Week 1
                  </span>
                </div>
                <p className="text-gray-600">We research and identify marketing agencies that match your ideal customer profile. No guessing.</p>
              </div>
            </div>

            <div className="flex gap-6 items-start p-6 bg-white rounded-xl border-2 border-gray-200 hover:border-blue-400 transition-all">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white font-bold text-xl">
                  02
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-gray-900">We Send Personalized Emails</h3>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                    Week 2-3
                  </span>
                </div>
                <p className="text-gray-600">We send compelling cold emails directly from you. Personal. Authentic. No bots.</p>
              </div>
            </div>

            <div className="flex gap-6 items-start p-6 bg-white rounded-xl border-2 border-gray-200 hover:border-blue-400 transition-all">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white font-bold text-xl">
                  03
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-gray-900">We Book the Meetings</h3>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                    Week 4+
                  </span>
                </div>
                <p className="text-gray-600">When they respond, we qualify them and book them directly on your calendar. You just show up.</p>
              </div>
            </div>

            <div className="flex gap-6 items-start p-6 bg-white rounded-xl border-2 border-gray-200 hover:border-blue-400 transition-all">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center text-white font-bold text-xl">
                  ✓
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-gray-900">Money-Back Guarantee</h3>
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                    Our Promise
                  </span>
                </div>
                <p className="text-gray-600"><span className="font-semibold">8+ qualified meetings in 60 days</span> or we work for free until you do. No risk.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section id="results" className="relative z-10 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              What Agencies Get
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Real results from real outbound
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
              <div className="text-4xl md:text-5xl font-bold text-blue-600 mb-2">8-15</div>
              <div className="text-sm font-semibold text-gray-900 mb-3">Qualified Meetings/Month</div>
              <p className="text-sm text-gray-600">Decision-makers who actually want to talk to you.</p>
            </div>

            <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
              <div className="text-4xl md:text-5xl font-bold text-blue-600 mb-2">30-40%</div>
              <div className="text-sm font-semibold text-gray-900 mb-3">Email Open Rate</div>
              <p className="text-sm text-gray-600">Personal emails get opened. Generic templates don't.</p>
            </div>

            <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
              <div className="text-4xl md:text-5xl font-bold text-blue-600 mb-2">3-6%</div>
              <div className="text-sm font-semibold text-gray-900 mb-3">Reply Rate</div>
              <p className="text-sm text-gray-600">Actual responses from decision-makers. Not vanity metrics.</p>
            </div>

            <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
              <div className="text-4xl md:text-5xl font-bold text-blue-600 mb-2">14-30</div>
              <div className="text-sm font-semibold text-gray-900 mb-3">Days to First Meeting</div>
              <p className="text-sm text-gray-600">Results you can see and measure in real time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="relative z-10 py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Simple Pricing
            </h2>
            <p className="text-xl text-gray-600">
              One price. No surprises. No negotiation.
            </p>
          </div>

          <div className="p-8 rounded-xl border-2 border-blue-600 bg-gradient-to-br from-white to-blue-50 shadow-2xl">
            <div className="text-center">
              <h3 className="font-bold text-2xl text-gray-900 mb-2">Meetings Package</h3>
              <p className="text-lg text-gray-600 mb-8">For marketing agencies 10-50 people</p>
              
              <div className="mb-8">
                <div className="text-6xl font-bold text-blue-600 mb-2">₹79,999</div>
                <div className="text-xl text-gray-600">/month</div>
                <div className="text-sm text-gray-500 mt-2">Less than ₹1L/year • 50% cheaper than local SDR</div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
                <p className="text-green-900 font-semibold">
                  ✓ 8+ qualified meetings in 60 days or your first month is free
                </p>
              </div>

              <ul className="text-left space-y-3 mb-8 max-w-md mx-auto">
                <li className="text-sm flex items-start gap-2 text-gray-700">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Prospect research and list building</span>
                </li>
                <li className="text-sm flex items-start gap-2 text-gray-700">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Personalized cold email outreach</span>
                </li>
                <li className="text-sm flex items-start gap-2 text-gray-700">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Follow-up sequences and qualification</span>
                </li>
                <li className="text-sm flex items-start gap-2 text-gray-700">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Meeting booking and calendar management</span>
                </li>
                <li className="text-sm flex items-start gap-2 text-gray-700">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Weekly performance reports</span>
                </li>
                <li className="text-sm flex items-start gap-2 text-gray-700">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Month-to-month (cancel anytime)</span>
                </li>
              </ul>

              <a href="/book-call" className="w-full py-4 px-8 rounded-lg font-semibold transition-all text-lg bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl">
                Schedule Your Demo Call
              </a>
            </div>
          </div>

          <div className="text-center mt-12">
            <p className="text-gray-600">
              Have questions? <a href="mailto:hello@jarvisprime.me" className="text-blue-600 hover:text-blue-700 font-semibold">Email us</a> or <a href="tel:+918810500723" className="text-blue-600 hover:text-blue-700 font-semibold">call +91 88105 00723</a>
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="relative z-10 py-20 px-4 bg-gray-50 border-y border-gray-200">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Questions?
            </h2>
            <p className="text-xl text-gray-600">
              Here's what we hear most
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                q: 'What if we don\'t get 8 meetings in 60 days?',
                a: 'We work for free until you do. That\'s the guarantee. If we don\'t deliver, you don\'t pay. We only win when you win.'
              },
              {
                q: 'How much do you actually need from us?',
                a: 'You give us 30 minutes for an onboarding call to understand your business, ideal clients, and what success looks like. Then we handle everything else.'
              },
              {
                q: 'What types of agencies do you work with?',
                a: 'Marketing agencies with 10-50 people are the sweet spot. Web dev agencies, AI agencies, and consulting firms also work well. We specialize in businesses that sell services, not products.'
              },
              {
                q: 'How is this different from hiring an SDR?',
                a: 'Hiring an SDR costs ₹1,50,000-2,00,000/month, takes 2-3 months to ramp, and you handle all management. With us, just ₹79,999/month gets you a proven process and guaranteed results. You\'re paying 50% less with better outcomes and zero hiring headaches.'
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Yes. Month-to-month only. If we\'re not delivering meetings, cancel. But we\'re confident you\'ll stay.'
              },
              {
                q: 'How soon can we start?',
                a: 'Schedule a demo call and we can kickoff within a week. First meetings typically show up within 2-3 weeks.'
              }
            ].map((faq, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <button
                  onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
                  className="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900">{faq.q}</span>
                  <span className="text-2xl text-gray-400">{faqOpen === idx ? '−' : '+'}</span>
                </button>
                {faqOpen === idx && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                    <p className="text-gray-700 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-gray-900 text-gray-300 py-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <img src="/logo-white.svg" alt="JARVIS PRIME" className="h-10 w-auto mx-auto mb-6" />
          <p className="text-gray-400 mb-6">
            AI-powered outbound and appointment-setting for agencies and B2B companies
          </p>
          <div className="space-y-2 mb-6">
            <p>
              <a href="mailto:hello@jarvisprime.me" className="hover:text-white transition-colors">
                hello@jarvisprime.me
              </a>
            </p>
            <p>
              <a href="tel:+918810500723" className="hover:text-white transition-colors">
                +91 88105 00723
              </a>
            </p>
            <p className="text-gray-400">
              Gurgaon, Haryana, India
            </p>
          </div>
          
          {/* Social Links */}
          <div className="flex justify-center gap-4 mb-8">
            <a 
              href="https://www.linkedin.com/company/jarvis-prime-ai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-gray-800 hover:bg-blue-600 flex items-center justify-center transition-all"
              aria-label="Follow us on LinkedIn"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
            <a 
              href="https://x.com/jarvisprime_ai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-gray-800 hover:bg-black flex items-center justify-center transition-all"
              aria-label="Follow us on X (Twitter)"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
          </div>

          <div className="border-t border-gray-800 pt-8 text-sm text-gray-500">
            <p>&copy; 2026 JARVIS PRIME. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
