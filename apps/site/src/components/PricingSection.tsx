import { Check, Zap } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "₹12,000",
    period: "/month",
    setup: "+ ₹5,000 setup",
    description: "Perfect for testing. 50 qualified leads/month.",
    highlight: false,
    features: [
      "50 leads/month (researched + verified)",
      "1 email sequence (5 steps)",
      "AI personalized outreach",
      "Reply detection & tracking",
      "Basic analytics",
      "WhatsApp support",
    ],
  },
  {
    name: "Growth",
    price: "₹29,000",
    period: "/month",
    setup: "+ ₹10,000 setup",
    description: "Most popular. 150 leads/month + AI reply handling.",
    highlight: true,
    features: [
      "150 leads/month (researched + verified)",
      "3 email sequences + LinkedIn DMs",
      "AI replies to initial messages",
      "Calendly auto-booking",
      "CRM integration (Notion/HubSpot)",
      "A/B testing & optimization",
      "Bi-weekly strategy calls",
      "Priority WhatsApp support",
    ],
  },
  {
    name: "Enterprise",
    price: "₹50,000+",
    period: "/month",
    setup: "Custom setup",
    description: "Unlimited leads + dedicated account manager.",
    highlight: false,
    features: [
      "Unlimited leads (500+/month possible)",
      "Multi-channel: Email + LinkedIn + WhatsApp",
      "Custom AI workflows built for you",
      "Dedicated account manager",
      "Full CRM automation",
      "Custom dashboard & reporting",
      "Weekly strategy calls",
      "Response SLA guarantee",
    ],
  },
];

export default function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-brand-400 text-sm font-semibold uppercase tracking-widest">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-5xl font-black mt-3 mb-4">
            Simple Pricing. <span className="text-gradient">Real Results.</span>
          </h2>
          <p className="text-white/50 max-w-xl mx-auto">
            Pay only for leads you actually get. No contracts, no hidden fees. Try free for 7 days.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-2xl p-6 border ${
                p.highlight
                  ? "bg-brand-500/10 border-brand-500/50 glow-green"
                  : "glass border-white/10"
              }`}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Most Popular
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-white">{p.name}</h3>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-black text-gradient">{p.price}</span>
                  <span className="text-white/50 text-sm">{p.period}</span>
                </div>
                <div className="text-xs text-white/40 mt-1">{p.setup}</div>
                <p className="text-white/50 text-sm mt-3">{p.description}</p>
              </div>

              <ul className="space-y-3 mb-8">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
                    <span className="text-white/70">{f}</span>
                  </li>
                ))}
              </ul>

              <a
                href="#contact"
                className={`block text-center font-semibold py-3 rounded-xl transition-all text-sm ${
                  p.highlight
                    ? "bg-brand-500 hover:bg-brand-400 text-white glow-green"
                    : "glass hover:bg-white/10 text-white"
                }`}
              >
                Start Free Pilot
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
