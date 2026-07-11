'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

const FAQS = [
  {
    q: 'How does your AI-powered lead generation work?',
    a: 'We use machine learning algorithms to identify your ideal prospects across 50+ data sources, enrich them with behavioral signals, and craft personalized outreach messages. Our AI analyzes response patterns and continuously optimizes campaigns for maximum reply rates.'
  },
  {
    q: 'What industries do you specialize in?',
    a: 'We work primarily with B2B companies including web development agencies, marketing agencies, SaaS startups, consulting firms, and professional services. Our system is optimized for high-ticket B2B sales cycles.'
  },
  {
    q: 'How many meetings can I expect per month?',
    a: 'Most clients generate 10-20 qualified meetings per month within the first 60 days. Results vary based on your industry, offer clarity, and ideal customer profile. We guarantee at least 8 meetings in your first 60 days or we work for free until we hit that number.'
  },
  {
    q: 'What is your pricing model?',
    a: 'We offer three tiers: Starter at ₹29,000/month (50 leads), Growth at ₹70,000/month + ₹4,000 per meeting (150 leads), and Enterprise custom pricing. We\'re aligned on quality and results, not just volume.'
  },
  {
    q: 'Do you handle both email and LinkedIn outreach?',
    a: 'Yes. We run coordinated multi-channel campaigns across cold email and LinkedIn. Email typically generates higher volume while LinkedIn provides social proof and relationship building. The combination increases overall response rates by 2-3x.'
  },
  {
    q: 'How do you ensure high deliverability and avoid spam?',
    a: 'We use domain rotation, warm-up sequences, SPF/DKIM/DMARC authentication, and AI-powered send timing. Our average deliverability rate is 95%+. We also monitor sender reputation and adjust strategies in real-time.'
  },
  {
    q: 'Can you integrate with our existing CRM?',
    a: 'Yes. We integrate with all major CRMs including HubSpot, Salesforce, Pipedrive, Close, and others. All leads, activities, and meetings automatically sync to your CRM in real-time.'
  },
  {
    q: 'How long does it take to see results?',
    a: 'Most clients book their first meeting within 2-3 weeks. Full campaign optimization takes 30-45 days as we test messaging, refine targeting, and scale what works. We continuously optimize throughout the engagement.'
  },
  {
    q: 'What makes you different from Apollo or Lemlist?',
    a: 'Those are tools - we are a full-service agency. We handle strategy, prospect research, copywriting, campaign management, A/B testing, and optimization. You just show up to the meetings we book. Think of us as your outsourced SDR team powered by AI.'
  },
  {
    q: 'Do you offer a guarantee?',
    a: 'Yes. If we do not book at least 8 qualified meetings in your first 60 days, we will continue working for free until we do. We stand behind our results and are incentivized by the per-meeting success fee.'
  }
];

export default function FaqSection() {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-xl text-gray-600">
            Everything you need to know about our lead generation service
          </p>
        </motion.div>

        <div className="space-y-4">
          {FAQS.map((faq, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.05 }}
              className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-lg transition-all"
            >
              <button
                onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
                className="w-full px-6 py-5 text-left flex justify-between items-center hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-900 pr-8">{faq.q}</span>
                <span className="text-2xl text-gray-400 flex-shrink-0">
                  {faqOpen === idx ? '−' : '+'}
                </span>
              </button>
              {faqOpen === idx && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-6 pb-5 bg-gray-50 border-t border-gray-200"
                >
                  <p className="text-gray-700 leading-relaxed pt-4">{faq.a}</p>
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
