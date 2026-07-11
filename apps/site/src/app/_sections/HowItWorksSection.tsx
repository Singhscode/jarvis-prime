import Reveal from '@/components/Reveal';
import { Target, Sparkles, MessageSquare, CalendarCheck } from 'lucide-react';

const STEPS = [
  {
    title: 'Strategic Research',
    desc: 'We build your ideal customer profile and identify high-intent prospects in your target market.',
    icon: Target,
  },
  {
    title: 'AI-Powered Outreach',
    desc: 'Personalized emails and LinkedIn messages crafted specifically for the decision-makers you want.',
    icon: Sparkles,
  },
  {
    title: 'Intelligent Follow-Up',
    desc: 'Automated sequences that nurture prospects and move them toward a real conversation.',
    icon: MessageSquare,
  },
  {
    title: 'Meeting Booking',
    desc: 'Qualified, time-zone-aligned prospects are booked directly onto your calendar.',
    icon: CalendarCheck,
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how" className="relative z-10 px-4 py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-16 text-center" variant="fade">
          <span className="mb-4 inline-block rounded-full border border-cyan-500/10 bg-cyan-500/5 px-4 py-1.5 text-sm font-medium text-cyan-400">
            The Process
          </span>
          <h2 className="mb-4 font-display text-4xl font-bold text-white md:text-5xl">
            How JARVIS PRIME Works
          </h2>
          <p className="text-xl text-slate-400">Done-for-you outbound, start to booked meeting</p>
        </Reveal>

        {/* Steps */}
        <div className="relative space-y-6">
          {/* Vertical line */}
          <div className="absolute left-8 top-0 hidden h-full w-px bg-white/[0.06] lg:block" />

          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <Reveal key={idx} delay={idx * 100}>
                <div className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-300 hover:border-cyan-500/15 lg:ml-16 lg:p-8">
                  {/* Step number on timeline */}
                  <div className="absolute -left-[3.55rem] top-8 hidden h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] bg-[#0a0f1e] text-sm font-bold text-cyan-400 lg:flex">
                    {idx + 1}
                  </div>
                  <div className="flex items-start gap-5 lg:gap-8">
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-500/[0.08] lg:h-16 lg:w-16">
                      <Icon className="h-7 w-7 text-cyan-400 lg:h-8 lg:w-8" />
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2 lg:hidden">
                        <span className="rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-400">
                          Step {idx + 1}
                        </span>
                      </div>
                      <h3 className="mb-2 font-display text-xl font-bold text-white lg:text-2xl">{step.title}</h3>
                      <p className="text-base text-slate-400 lg:text-lg">{step.desc}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
