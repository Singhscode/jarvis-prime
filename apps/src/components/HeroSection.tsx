"use client";

import { ArrowRight, Bot, TrendingUp, Users } from "lucide-react";

const stats = [
  { label: "Qualified Leads/Month", value: "50–150" },
  { label: "Email Reply Rate", value: "15–22%" },
  { label: "Setup Time", value: "7 Days" },
  { label: "Cost vs SDR", value: "80% Less" },
];

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-500/5 blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-sm text-brand-300 mb-8">
          <Bot className="w-4 h-4" />
          <span>✨ Join 50+ Agencies Already Using JARVIS</span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight mb-6 leading-tight">
          Your Personal{" "}
          <span className="text-gradient">AI Sales Team</span>
          <br />
          Works 24/7
        </h1>

        <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
          We handle everything: finding prospects, personalizing outreach, sending emails, tracking replies, and booking calls.
          <strong className="text-white block mt-2">You just focus on closing deals.</strong>
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <a
            href="#contact"
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-bold px-8 py-4 rounded-xl text-lg transition-all glow-green hover:scale-105"
          >
            Start Your Free 7-Day Pilot
            <ArrowRight className="w-5 h-5" />
          </a>
          <a
            href="#how-it-works"
            className="flex items-center gap-2 glass hover:bg-white/10 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all"
          >
            See It In Action
          </a>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="glass rounded-2xl p-4 text-center">
              <div className="text-2xl sm:text-3xl font-black text-gradient mb-1">{s.value}</div>
              <div className="text-xs text-white/50">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
