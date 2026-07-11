'use client';

import { motion } from 'framer-motion';

const STATS = [
  {
    metric: '2,847',
    label: 'Leads Generated',
    change: '+127%',
    trend: 'up',
    color: 'from-blue-500 to-cyan-500'
  },
  {
    metric: '142',
    label: 'Meetings Booked',
    change: '+89%',
    trend: 'up',
    color: 'from-cyan-500 to-blue-500'
  },
  {
    metric: '47.3%',
    label: 'Reply Rate',
    change: '+3.2x',
    trend: 'up',
    color: 'from-blue-500 to-indigo-500'
  },
  {
    metric: '$2.4M',
    label: 'Pipeline Growth',
    change: '+215%',
    trend: 'up',
    color: 'from-indigo-500 to-purple-500'
  }
];

const ADDITIONAL_METRICS = [
  { value: '35-50%', label: 'Email Open Rate' },
  { value: '5-10%', label: 'Reply Rate' },
  { value: '2-4 weeks', label: 'Time to First Meeting' },
  { value: '10-20', label: 'Meetings Per Month' }
];

export default function ResultsSection() {
  return (
    <section id="results" className="py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Real Results, Real Growth
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Data-driven outcomes from our AI-powered lead generation system
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="relative bg-white rounded-2xl p-8 border border-gray-200 hover:shadow-2xl transition-all group overflow-hidden"
            >
              {/* Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-5 transition-opacity`}></div>

              <div className="relative">
                <div className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">{stat.metric}</div>
                <div className="text-sm font-medium text-gray-600 mb-3">{stat.label}</div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600 font-semibold text-sm">{stat.change}</span>
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>

              {/* Mini Chart */}
              <div className="mt-4 h-12 opacity-50">
                <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path
                    d={`M 0 ${40 - idx * 3} Q 25 ${35 - idx * 4}, 50 ${30 - idx * 3} T 100 ${20 - idx * 2}`}
                    fill="none"
                    stroke={`url(#gradient-${idx})`}
                    strokeWidth="2"
                  />
                  <defs>
                    <linearGradient id={`gradient-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#2563EB" />
                      <stop offset="100%" stopColor="#06B6D4" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Additional Metrics Bar */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6">
          {ADDITIONAL_METRICS.map((metric, idx) => (
            <div key={idx} className="text-center p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
              <div className="text-3xl font-bold text-blue-600 mb-2">{metric.value}</div>
              <div className="text-sm text-gray-700 font-medium">{metric.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
