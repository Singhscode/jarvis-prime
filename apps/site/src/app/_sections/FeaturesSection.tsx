import Reveal from '@/components/Reveal';
import { Users, Sparkles, LineChart, BarChart3, Shield, Globe } from 'lucide-react';

const FEATURES = [
  {
    icon: Users,
    title: 'Intelligent Prospect Research',
    desc: 'We find your ideal customers based on your ICP, with intent signals — so outreach lands on the right people.',
  },
  {
    icon: Sparkles,
    title: 'Personalized at Scale',
    desc: 'Every email is personalized with AI. No generic blasts — real, relevant messages that earn replies.',
  },
  {
    icon: LineChart,
    title: 'Multi-Channel Campaigns',
    desc: 'Email + LinkedIn + follow-ups, orchestrated together to maximize response rates.',
  },
  {
    icon: BarChart3,
    title: 'Transparent Reporting',
    desc: 'Track opens, replies, and booked meetings. See what is working and what we are optimizing.',
  },
  {
    icon: Shield,
    title: 'Automated Qualification',
    desc: 'Prospects are scored against your ICP before they reach your calendar — fewer junk calls.',
  },
  {
    icon: Globe,
    title: 'Your Brand, Your Domain',
    desc: 'Campaigns go out from your domain and your brand. The relationships are yours to keep.',
  },
];

export default function FeaturesSection() {
  return (
    <section className="relative z-10 px-4 py-28">
      <div className="relative mx-auto max-w-6xl">
        <Reveal className="mb-16 text-center" variant="fade">
          <span className="mb-4 inline-block rounded-full border border-cyan-500/10 bg-cyan-500/5 px-4 py-1.5 text-sm font-medium text-cyan-400">
            Capabilities
          </span>
          <h2 className="mb-4 font-display text-4xl font-bold text-white md:text-5xl">
            Everything Included, Done For You
          </h2>
          <p className="text-xl text-slate-400">No tools to learn. No team to manage. We handle it all.</p>
        </Reveal>

        <div className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <Reveal key={idx} delay={(idx % 2) * 80}>
                <div className="h-full rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 transition-all duration-300 hover:border-cyan-500/15">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/[0.08]">
                    <Icon className="h-6 w-6 text-cyan-400" />
                  </div>
                  <h3 className="mb-3 font-display text-xl font-bold text-white">{feature.title}</h3>
                  <p className="leading-relaxed text-slate-400">{feature.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
