'use client';

import { motion } from 'framer-motion';

const CASE_STUDIES = [
  {
    company: 'Digital Growth Agency',
    industry: 'Marketing Agency',
    challenge: 'Struggling to book qualified meetings with enterprise clients',
    solution: 'Implemented AI-powered LinkedIn + Email outreach targeting CMOs',
    results: ['18 meetings/month', '$450K pipeline', '65% open rate']
  },
  {
    company: 'SaaS Startup',
    industry: 'B2B SaaS',
    challenge: 'Manual outreach taking 20+ hours per week with low response rates',
    solution: 'Automated multi-channel campaigns with AI personalization',
    results: ['12 demos/month', '3x reply rate', '15 hours saved/week']
  },
  {
    company: 'Tech Consulting Firm',
    industry: 'IT Services',
    challenge: 'Cold outreach getting ignored, need for enterprise-grade leads',
    solution: 'Targeted Fortune 500 CTOs with intent-based triggers',
    results: ['22 meetings/month', '$1.2M pipeline', '8% reply rate']
  }
];

export default function CaseStudiesSection() {
  return (
    <section className="py-20 px-4 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Success Stories
          </h2>
          <p className="text-xl text-gray-600">
            See how we helped agencies scale their outbound
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {CASE_STUDIES.map((study, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white rounded-2xl p-8 border border-gray-200 hover:shadow-2xl transition-all"
            >
              <div className="mb-6">
                <div className="text-sm font-semibold text-blue-600 mb-2">{study.industry}</div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">{study.company}</h3>
              </div>

              <div className="space-y-6">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Challenge</div>
                  <p className="text-gray-700">{study.challenge}</p>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Solution</div>
                  <p className="text-gray-700">{study.solution}</p>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Results</div>
                  <div className="flex flex-wrap gap-2">
                    {study.results.map((result, resultIdx) => (
                      <span key={resultIdx} className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-semibold">
                        ✓ {result}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
