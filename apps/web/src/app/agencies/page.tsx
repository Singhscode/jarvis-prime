import Navbar from "@/components/Navbar";
import { ArrowRight, CheckCircle2, TrendingUp, Users, Zap, BarChart3, Target, Clock } from "lucide-react";

export default function AgenciesPage() {
  return (
    <main>
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-500/5 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-sm text-brand-300 mb-8">
            <Users className="w-4 h-4" />
            <span>Built for Agencies Like Yours</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight mb-6 leading-tight">
            Triple Your{" "}
            <span className="text-gradient">Lead Pipeline</span>
            <br />
            Without Hiring
          </h1>

          <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Stop leaving money on the table. Let JARVIS find, qualify, and nurture high-intent leads while you focus on closing deals.
            <strong className="text-white block mt-2">Most agencies see 3x more pipeline in 30 days.</strong>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a
              href="#contact-agency"
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-bold px-8 py-4 rounded-xl text-lg transition-all glow-green hover:scale-105"
            >
              Get Free Pipeline Audit
              <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="#how-it-works"
              className="flex items-center gap-2 glass hover:bg-white/10 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all"
            >
              See Results
            </a>
          </div>

          {/* Agency Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass rounded-2xl p-4 text-center">
              <div className="text-2xl sm:text-3xl font-black text-gradient mb-1">3x</div>
              <div className="text-xs text-white/50">More Leads/Month</div>
            </div>
            <div className="glass rounded-2xl p-4 text-center">
              <div className="text-2xl sm:text-3xl font-black text-gradient mb-1">₹0</div>
              <div className="text-xs text-white/50">Setup Cost (Free Trial)</div>
            </div>
            <div className="glass rounded-2xl p-4 text-center">
              <div className="text-2xl sm:text-3xl font-black text-gradient mb-1">7 Days</div>
              <div className="text-xs text-white/50">Live System Ready</div>
            </div>
            <div className="glass rounded-2xl p-4 text-center">
              <div className="text-2xl sm:text-3xl font-black text-gradient mb-1">50+</div>
              <div className="text-xs text-white/50">Agencies Using</div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-24 px-4 sm:px-6 bg-white/2">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-5xl font-black mb-4">
              The Agency Problem (You Probably Face)
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="glass rounded-2xl p-8">
              <div className="text-3xl mb-4">❌</div>
              <h3 className="font-bold text-white text-lg mb-3">Without JARVIS</h3>
              <ul className="space-y-3 text-white/60 text-sm">
                <li>✗ Manually finding leads (hours/week)</li>
                <li>✗ Low-quality prospects wasting your time</li>
                <li>✗ Same generic cold emails everyone uses</li>
                <li>✗ Inconsistent follow-ups (leads get lost)</li>
                <li>✗ No visibility into what's working</li>
                <li>✗ Hiring expensive SDRs or agencies</li>
                <li>✗ Pipeline dries up if outreach stops</li>
              </ul>
            </div>

            <div className="glass rounded-2xl p-8 border border-brand-500/50 bg-brand-500/10">
              <div className="text-3xl mb-4">✅</div>
              <h3 className="font-bold text-white text-lg mb-3">With JARVIS</h3>
              <ul className="space-y-3 text-white/60 text-sm">
                <li>✓ 100+ pre-qualified leads/month (automated)</li>
                <li>✓ AI filters for EXACT ICP fit</li>
                <li>✓ Unique, personalized emails (22% reply rate)</li>
                <li>✓ Multi-step sequences run 24/7</li>
                <li>✓ Live dashboard: see every lead & metric</li>
                <li>✓ 1/5th the cost of hiring SDRs</li>
                <li>✓ Consistent pipeline month after month</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works for Agencies */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-5xl font-black mb-4">
              Your Outbound System in 7 Days
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto">
              Step by step, JARVIS builds your complete lead generation engine
            </p>
          </div>

          <div className="space-y-6">
            {[
              {
                step: "1",
                title: "Day 1-2: Strategy & Setup",
                description:
                  "We audit your current process, define your perfect ICP, and configure JARVIS for your market.",
                icon: Target,
              },
              {
                step: "2",
                title: "Day 3-4: First Leads Generated",
                description:
                  "JARVIS finds 50-100 pre-qualified prospects matching your exact ICP. You review & approve.",
                icon: Users,
              },
              {
                step: "3",
                title: "Day 5-6: Outreach Campaigns Live",
                description:
                  "AI writes personalized emails. Multi-step sequences start. Replies get tracked in real-time.",
                icon: Zap,
              },
              {
                step: "4",
                title: "Day 7: Full Dashboard & Reporting",
                description:
                  "You get live metrics: leads sourced, emails sent, reply rate, calls booked, revenue pipeline.",
                icon: BarChart3,
              },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="flex gap-6">
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-xl bg-brand-500/20 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-brand-400" />
                    </div>
                    {idx < 3 && (
                      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-0.5 h-8 bg-brand-500/30" />
                    )}
                  </div>
                  <div className="glass rounded-2xl p-6 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-bold bg-brand-500/20 text-brand-400 px-3 py-1 rounded-full">
                        {item.step}
                      </span>
                      <h3 className="font-bold text-lg text-white">{item.title}</h3>
                    </div>
                    <p className="text-white/50">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section className="py-24 px-4 sm:px-6 bg-white/2">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-5xl font-black mb-4">
              What Agencies Are Seeing
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                company: "SaaS Growth Agency",
                size: "₹20L+ ARR",
                result: "3x More Pipeline",
                details:
                  "From 10 leads/month to 50+ qualified leads. Now closing 3x more deals.",
              },
              {
                company: "B2B Marketing Agency",
                size: "₹50L+ ARR",
                result: "Time Saved",
                details:
                  "Each team member saves 20 hours/week on lead research. Now used for client work.",
              },
              {
                company: "Outbound Sales Agency",
                size: "₹15L ARR",
                result: "₹2L+ MRR Added",
                details:
                  "JARVIS adds ₹2L MRR to their bottom line. Zero new hires needed.",
              },
            ].map((item, idx) => (
              <div key={idx} className="glass rounded-2xl p-6 border border-brand-500/30">
                <div className="mb-4">
                  <h3 className="font-bold text-white mb-1">{item.company}</h3>
                  <p className="text-xs text-white/50">{item.size}</p>
                </div>
                <div className="mb-4 p-4 bg-brand-500/10 rounded-xl">
                  <div className="text-2xl font-black text-gradient">{item.result}</div>
                </div>
                <p className="text-white/60 text-sm">{item.details}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing for Agencies */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-5xl font-black mb-4">
              Pricing That Scales With You
            </h2>
            <p className="text-white/50">
              Only pay when you get results. Cancel anytime.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Starter",
                price: "₹12,000",
                leads: "50 leads/month",
                best: false,
              },
              {
                name: "Agency Growth",
                price: "₹29,000",
                leads: "150 leads/month",
                best: true,
              },
              {
                name: "Enterprise",
                price: "Custom",
                leads: "500+ leads/month",
                best: false,
              },
            ].map((plan, idx) => (
              <div
                key={idx}
                className={`rounded-2xl p-6 border ${
                  plan.best
                    ? "bg-brand-500/10 border-brand-500/50 glow-green"
                    : "glass border-white/10"
                }`}
              >
                {plan.best && (
                  <div className="mb-4 inline-block bg-brand-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="font-bold text-white text-lg mb-2">{plan.name}</h3>
                <div className="text-3xl font-black text-gradient mb-1">
                  {plan.price}
                </div>
                <p className="text-sm text-white/50 mb-4">{plan.leads}</p>
                <a
                  href="#contact-agency"
                  className={`block text-center font-semibold py-3 rounded-xl transition-all text-sm ${
                    plan.best
                      ? "bg-brand-500 hover:bg-brand-400 text-white"
                      : "glass hover:bg-white/10 text-white"
                  }`}
                >
                  Start Free Trial
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ for Agencies */}
      <section className="py-24 px-4 sm:px-6 bg-white/2">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-5xl font-black mb-4">
              Common Questions
            </h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "How many leads will we get?",
                a:
                  "Depends on your market & ICP. Most agencies see 50-150 qualified leads/month. We do a free audit to give you exact numbers.",
              },
              {
                q: "Can we add JARVIS to our client offerings?",
                a:
                  "Absolutely. Many agencies white-label JARVIS and charge clients 2-3x markup. Talk to us about this model.",
              },
              {
                q: "What's the setup time?",
                a:
                  "7 days. Day 1-2 strategy, Day 3-5 system setup & testing, Day 6-7 first leads live.",
              },
              {
                q: "Can we pause or cancel anytime?",
                a:
                  "Yes. No long-term contracts. Cancel monthly with 30-day notice.",
              },
              {
                q: "Do you integrate with our CRM?",
                a:
                  "We integrate with HubSpot, Pipedrive, Notion, Sheets. Custom integrations available.",
              },
              {
                q: "What support do we get?",
                a:
                  "Dedicated Slack channel, weekly strategy calls, and WhatsApp support. We're here to make sure you win.",
              },
            ].map((item, idx) => (
              <div key={idx} className="glass rounded-2xl p-6 group hover:bg-white/10 transition-all">
                <h3 className="font-bold text-white mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-brand-400" />
                  {item.q}
                </h3>
                <p className="text-white/60 ml-7">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="contact-agency" className="py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="glass rounded-2xl p-12 text-center border border-brand-500/50 glow-green">
            <div className="mb-6 flex justify-center">
              <Clock className="w-12 h-12 text-brand-400" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">
              Ready to 3x Your Pipeline?
            </h2>
            <p className="text-white/60 mb-8 max-w-2xl mx-auto">
              Get a free pipeline audit. See exactly how many qualified leads JARVIS can generate for your specific market.
            </p>
            <a
              href="/#contact"
              className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-bold px-8 py-4 rounded-xl transition-all glow-green hover:scale-105"
            >
              Schedule Free Audit
              <ArrowRight className="w-5 h-5" />
            </a>
            <p className="text-white/40 text-sm mt-6">
              Takes 5 minutes. No credit card. Free ₹4,15,000 pipeline report included.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 border-t border-white/10">
        <div className="max-w-6xl mx-auto text-center text-white/50 text-sm">
          <p>© 2026 JARVIS PRIME. Built for agencies that want to scale.</p>
        </div>
      </footer>
    </main>
  );
}
