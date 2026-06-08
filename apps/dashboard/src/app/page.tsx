"use client";

import { useState } from "react";
import {
  TrendingUp, Users, Mail, Phone, IndianRupee,
  CheckCircle2, Clock, XCircle, Zap, BarChart2,
  AlertCircle, ArrowUpRight, ChevronRight
} from "lucide-react";

const kpis = [
  { label: "MRR", value: "₹0", target: "₹50,000", icon: IndianRupee, color: "text-brand-400", bg: "bg-brand-500/10" },
  { label: "Leads Sourced", value: "0", target: "2,000/mo", icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "Emails Sent", value: "0", target: "500/wk", icon: Mail, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "Calls Booked", value: "0", target: "10/mo", icon: Phone, color: "text-yellow-400", bg: "bg-yellow-500/10" },
];

const pipeline = [
  { name: "Rahul Sharma", company: "PixelForge Agency", stage: "Discovery Call", value: "₹35,000/mo", status: "hot" },
  { name: "Priya Mehta", company: "GrowthOS SaaS", stage: "Proposal Sent", value: "₹15,000/mo", status: "warm" },
  { name: "Vikram Singh", company: "LeadStream Agency", stage: "Outreach", value: "₹35,000/mo", status: "cold" },
  { name: "Anjali Nair", company: "CloudStack India", stage: "Follow-up", value: "₹15,000/mo", status: "warm" },
];

const agentLogs = [
  { agent: "Sales Agent", action: "Scraped 47 new leads from Apollo", time: "2 min ago", status: "success" },
  { agent: "Automation Agent", action: "Sent 32 personalized emails via Resend", time: "15 min ago", status: "success" },
  { agent: "Research Agent", action: "Identified 3 high-signal accounts (funding + hiring)", time: "1 hr ago", status: "success" },
  { agent: "Marketing Agent", action: "LinkedIn post draft ready for review", time: "2 hrs ago", status: "pending" },
  { agent: "Sales Agent", action: "2 positive replies detected — action required", time: "3 hrs ago", status: "alert" },
  { agent: "Finance Agent", action: "Monthly expense report: ₹0 (all free tools)", time: "6 hrs ago", status: "success" },
];

const tasks = [
  { text: "Deploy brand site to Vercel", done: false, priority: "high" },
  { text: "Set up Cal.com booking page", done: false, priority: "high" },
  { text: "Build 200-lead seed list (Apollo)", done: false, priority: "high" },
  { text: "Set up Resend + warm domain", done: false, priority: "high" },
  { text: "Install n8n locally via Docker", done: false, priority: "medium" },
  { text: "Optimize LinkedIn profile (Founder @ JARVIS PRIME)", done: false, priority: "medium" },
  { text: "Create LinkedIn company page", done: false, priority: "medium" },
  { text: "Write first LinkedIn post (case study format)", done: false, priority: "low" },
];

const stageColors: Record<string, string> = {
  hot: "bg-red-500/20 text-red-300",
  warm: "bg-yellow-500/20 text-yellow-300",
  cold: "bg-blue-500/20 text-blue-300",
};

const logIcons: Record<string, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-brand-400" />,
  pending: <Clock className="w-4 h-4 text-yellow-400" />,
  alert: <AlertCircle className="w-4 h-4 text-red-400" />,
};

export default function Dashboard() {
  const [tasks2, setTasks2] = useState(tasks);

  const toggleTask = (i: number) => {
    setTasks2((prev) => prev.map((t, idx) => idx === i ? { ...t, done: !t.done } : t));
  };

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-white font-[Inter,system-ui,sans-serif]">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#48be84]" />
          <span className="font-black text-lg bg-gradient-to-r from-[#48be84] to-[#a7f3d0] bg-clip-text text-transparent">
            JARVIS PRIME
          </span>
          <span className="text-white/30 text-sm ml-2">— Operating Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#25a266] animate-pulse" />
          <span className="text-xs text-white/50">All systems operational</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${k.color}`} />
                </div>
                <div className="text-3xl font-black text-white">{k.value}</div>
                <div className="text-xs text-white/40 mt-1">{k.label}</div>
                <div className="text-xs text-white/30 mt-1">Target: {k.target}</div>
              </div>
            );
          })}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Pipeline */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg">Sales Pipeline</h2>
              <span className="text-xs text-white/40">4 active leads</span>
            </div>
            <div className="space-y-3">
              {pipeline.map((p) => (
                <div key={p.name} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                  <div>
                    <div className="font-semibold text-sm text-white">{p.name}</div>
                    <div className="text-xs text-white/40">{p.company} · {p.stage}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${stageColors[p.status]}`}>
                      {p.status}
                    </span>
                    <span className="text-sm font-bold text-[#48be84]">{p.value}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex justify-between text-sm">
              <span className="text-white/40">Pipeline value</span>
              <span className="font-bold text-[#48be84]">₹1,00,000/mo</span>
            </div>
          </div>

          {/* Agent Logs */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg">Agent Activity Feed</h2>
              <span className="text-xs bg-[#25a266]/20 text-[#48be84] px-2 py-1 rounded-full">Live</span>
            </div>
            <div className="space-y-3">
              {agentLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                  <div className="mt-0.5">{logIcons[log.status]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#48be84]">{log.agent}</div>
                    <div className="text-xs text-white/60 leading-relaxed">{log.action}</div>
                  </div>
                  <div className="text-xs text-white/30 whitespace-nowrap">{log.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Daily Task Board */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-lg">Day-0 Task Board</h2>
            <span className="text-xs text-white/40">
              {tasks2.filter(t => t.done).length}/{tasks2.length} done
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {tasks2.map((t, i) => (
              <button
                key={i}
                onClick={() => toggleTask(i)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  t.done
                    ? "border-[#25a266]/30 bg-[#25a266]/5 opacity-60"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  t.done ? "border-[#48be84] bg-[#25a266]" : "border-white/30"
                }`}>
                  {t.done && <CheckCircle2 className="w-3 h-3 text-white" />}
                </div>
                <span className={`text-sm ${t.done ? "line-through text-white/40" : "text-white/80"}`}>
                  {t.text}
                </span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                  t.priority === "high" ? "bg-red-500/20 text-red-300" :
                  t.priority === "medium" ? "bg-yellow-500/20 text-yellow-300" :
                  "bg-white/10 text-white/40"
                }`}>
                  {t.priority}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "ICP Document", href: "/business/icp-document.md" },
            { label: "Outreach Templates", href: "/business/outreach-templates.md" },
            { label: "90-Day Plan", href: "/business/90-day-execution-plan.md" },
            { label: "n8n Blueprint", href: "/business/n8n-automation-blueprint.md" },
          ].map((l) => (
            <div key={l.label} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/10 cursor-pointer transition-all">
              <span className="text-sm text-white/70">{l.label}</span>
              <ArrowUpRight className="w-4 h-4 text-[#48be84]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
