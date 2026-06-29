'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

const FAQS = [
  {
    q: 'How quickly can campaigns launch?',
    a: "We can launch your first campaign within 7-10 days of onboarding. You'll see initial outreach results within 2-3 weeks, and first qualified meetings typically appear within 3-4 weeks.",
  },
  {
    q: 'Do you work with agencies?',
    a: 'Yes, agencies are our focus. We work with marketing agencies, development agencies, recruiting firms, and B2B consultancies. Our system is built for service businesses with high-ticket offerings.',
  },
  {
    q: 'Do you provide leads or just the system?',
    a: "We handle everything—research, prospect targeting, personalized outreach, follow-ups, and meeting booking. You get qualified prospects delivered to your calendar. It's done-for-you, not DIY.",
  },
  {
    q: 'Is there a long-term contract?',
    a: "No. All plans are month-to-month. No setup fees, no long-term commitment. If it's not working for you, you can cancel anytime.",
  },
  {
    q: 'How are meetings qualified?',
    a: 'We score prospects against your ICP (Ideal Customer Profile) so each person booked has been pre-qualified for relevance and fit before they reach your calendar.',
  },
  {
    q: 'How is this different from hiring an SDR?',
    a: 'Hiring an SDR costs ₹1.5L-2L/month, takes 2-3 months to ramp, and adds management overhead. JARVIS PRIME is done-for-you at a fraction of the cost, with your first campaign live in days—and you can cancel anytime.',
  },
];

export default function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {FAQS.map((faq, idx) => (
        <div
          key={idx}
          className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50 transition-all hover:bg-slate-800"
        >
          <button
            onClick={() => setOpen(open === idx ? null : idx)}
            className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-slate-700/50"
            aria-expanded={open === idx}
          >
            <span className="text-lg font-bold text-white">{faq.q}</span>
            <span className="text-2xl text-cyan-400">{open === idx ? '−' : '+'}</span>
          </button>
          {open === idx && (
            <div className="border-t border-slate-700 bg-slate-900/50 px-6 py-4">
              <p className="leading-relaxed text-slate-300">{faq.a}</p>
            </div>
          )}
        </div>
      ))}

      <div className="mt-16 text-center">
        <p className="mb-4 text-slate-300">Still have questions?</p>
        <a
          href="/book-call"
          className="inline-flex items-center gap-2 text-lg font-semibold text-cyan-400 hover:text-cyan-300"
        >
          <ArrowRight className="h-5 w-5" />
          Book a free strategy call
        </a>
      </div>
    </div>
  );
}
