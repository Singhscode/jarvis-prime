const steps = [
  {
    step: "01",
    title: "Discovery Call (Free)",
    description:
      "30-min call to understand your ICP, current outbound process, and revenue goals. We audit your existing setup and identify the biggest bottlenecks.",
  },
  {
    step: "02",
    title: "System Blueprint",
    description:
      "We design your custom AI outbound architecture — data sources, enrichment layers, messaging sequence, and CRM integration. You review and approve.",
  },
  {
    step: "03",
    title: "Build & Deploy (7 Days)",
    description:
      "Our team builds the entire system: scraper → enricher → AI copywriter → email/LinkedIn sender → reply handler → calendar booker. Live in a week.",
  },
  {
    step: "04",
    title: "Go Live + Monitor",
    description:
      "System launches. We monitor deliverability, reply rates, and sequence performance daily for the first 2 weeks. Optimize until KPIs are hit.",
  },
  {
    step: "05",
    title: "Scale & Optimize",
    description:
      "Monthly retainer covers A/B testing new angles, expanding to new ICPs, adding new channels, and reporting. You focus on closing — we handle top-of-funnel.",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-brand-400 text-sm font-semibold uppercase tracking-widest">
            Process
          </span>
          <h2 className="text-3xl sm:text-5xl font-black mt-3 mb-4">
            From Zero to <span className="text-gradient">Booked Calls</span> in 7 Days
          </h2>
        </div>

        <div className="relative">
          <div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-brand-500/50 to-transparent hidden md:block" />

          <div className="flex flex-col gap-10">
            {steps.map((s) => (
              <div key={s.step} className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
                  <span className="text-brand-400 font-black text-lg">{s.step}</span>
                </div>
                <div className="pt-1">
                  <h3 className="font-bold text-xl text-white mb-2">{s.title}</h3>
                  <p className="text-white/50 leading-relaxed">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
