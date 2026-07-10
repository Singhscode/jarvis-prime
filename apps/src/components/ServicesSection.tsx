import { Bot, Mail, Search, BarChart2, RefreshCw, Workflow } from "lucide-react";

const services = [
  {
    icon: Search,
    title: "Find Perfect Prospects",
    description:
      "We find 50–150 pre-qualified leads every month from your exact ICP. Researched, verified, decision-maker contact info included.",
    tag: "Sourcing",
  },
  {
    icon: Mail,
    title: "AI Writes Your Emails",
    description:
      "Each prospect gets a unique, personalized first line (not templates). 15–22% reply rate vs 2–5% from generic cold emails.",
    tag: "Personalization",
  },
  {
    icon: RefreshCw,
    title: "Auto Follow-Ups That Convert",
    description:
      "Multi-step sequences run 24/7. AI detects replies and stops wasting time on uninterested leads. Every conversation moves forward.",
    tag: "Automation",
  },
  {
    icon: Bot,
    title: "AI Handles First Conversations",
    description:
      "Your AI rep qualifies leads, answers common questions, and books qualified calls to your calendar — no manual work needed.",
    tag: "Qualification",
  },
  {
    icon: BarChart2,
    title: "See Everything in One Dashboard",
    description:
      "Live metrics: leads found, emails sent, replies, calls booked, revenue pipeline. Know exactly what's working and what's not.",
    tag: "Analytics",
  },
  {
    icon: Workflow,
    title: "Custom Workflows For Your Needs",
    description:
      "Beyond outbound? We build workflows for onboarding, invoicing, CRM updates, Slack alerts, reporting — anything repetitive.",
    tag: "Customization",
  },
];

export default function ServicesSection() {
  return (
    <section id="services" className="py-24 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-brand-400 text-sm font-semibold uppercase tracking-widest">
            How It Works
          </span>
          <h2 className="text-3xl sm:text-5xl font-black mt-3 mb-4">
            One System. <span className="text-gradient">Everything Automated.</span>
          </h2>
          <p className="text-white/50 max-w-xl mx-auto">
            From finding prospects to booking calls — JARVIS handles your entire outbound process. You focus on closing deals.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="glass rounded-2xl p-6 hover:bg-white/10 transition-all hover:-translate-y-1 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-brand-500/20 rounded-xl p-3 group-hover:bg-brand-500/30 transition-colors">
                    <Icon className="w-5 h-5 text-brand-400" />
                  </div>
                  <span className="text-xs text-brand-400 glass px-2 py-1 rounded-full">
                    {s.tag}
                  </span>
                </div>
                <h3 className="font-bold text-lg text-white mb-2">{s.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{s.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
