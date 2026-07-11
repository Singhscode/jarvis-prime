'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

const EXPECTATIONS = [
  '30-minute strategy session',
  'Custom lead generation plan',
  'ROI calculator for your industry',
  'No credit card required'
];

export default function CalendlyCtaSection() {
  return (
    <section className="py-20 px-4 bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-600 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }}></div>
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Book Your Free Strategy Call
          </h2>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            Discover how JARVIS PRIME can generate 10-20 qualified meetings per month for your business
          </p>
        </motion.div>

        {/* Calendly Embed Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="bg-white rounded-3xl shadow-2xl p-4 md:p-8"
        >
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">What to Expect</h3>
              <ul className="space-y-3">
                {EXPECTATIONS.map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3">
                    <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex-1 w-full">
              <Link
                href="/book-call"
                className="block w-full py-6 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-2xl hover:shadow-2xl transition-all font-bold text-xl text-center"
              >
                Schedule Your Free Call →
              </Link>
              <p className="text-center text-sm text-gray-500 mt-4">
                Available slots filling fast · No sales pitch · Just value
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
