"use client";

import { useState } from "react";
import { Send, Calendar, Clock, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import type { LeadFormData } from "@/types/lead";

export default function ContactSection() {
  const [form, setForm] = useState<LeadFormData>({
    name: "",
    company: "",
    email: "",
    phone: "",
    revenue: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("https://formspree.io/f/mredevng", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          name: form.name,
          company: form.company,
          email: form.email,
          phone: form.phone,
          revenue: form.revenue,
          message: form.message,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        throw new Error("Failed to submit. Please try again.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="contact" className="py-24 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <span className="text-brand-400 text-sm font-semibold uppercase tracking-widest">
            Get Started
          </span>
          <h2 className="text-3xl sm:text-5xl font-black mt-3 mb-4">
            Start Your <span className="text-gradient">Free 7-Day Pilot</span>
          </h2>
          <p className="text-white/50">
            No credit card needed. We&apos;ll set up your system and show you exactly how many qualified leads we can generate for you.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="glass rounded-2xl p-8">
            {!submitted ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Full Name *</label>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-500 transition-colors"
                    placeholder="Rahul Sharma"
                  />
                </div>
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Company *</label>
                  <input
                    required
                    type="text"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-500 transition-colors"
                    placeholder="Your Agency / SaaS"
                  />
                </div>
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Email *</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-500 transition-colors"
                    placeholder="rahul@company.com"
                  />
                </div>
                <div>
                  <label className="text-sm text-white/60 mb-1 block">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-500 transition-colors"
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Monthly Revenue</label>
                  <select
                    value={form.revenue}
                    onChange={(e) => setForm({ ...form, revenue: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 transition-colors"
                  >
                    <option value="" className="bg-dark">Select range</option>
                    <option value="0-1L" className="bg-dark">₹0 – ₹1 Lakh</option>
                    <option value="1-5L" className="bg-dark">₹1L – ₹5 Lakh</option>
                    <option value="5-20L" className="bg-dark">₹5L – ₹20 Lakh</option>
                    <option value="20L+" className="bg-dark">₹20 Lakh+</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-white/60 mb-1 block">What&apos;s your biggest challenge?</label>
                  <textarea
                    rows={3}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-500 transition-colors resize-none"
                    placeholder="Not enough qualified leads, high SDR cost..."
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all glow-green"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Activate Free Pilot</>
                  )}
                </button>
              </form>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-16 h-16 bg-brand-500/20 rounded-full flex items-center justify-center mb-4">
                  <Send className="w-8 h-8 text-brand-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Perfect! You&apos;re in.</h3>
                <p className="text-white/50 text-sm">
                  Check your email + WhatsApp in the next 2 hours. We&apos;ll have your system ready to go.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="glass rounded-2xl p-6">
              <Calendar className="w-6 h-6 text-brand-400 mb-3" />
              <h3 className="font-bold text-white mb-1">Your Pilot Timeline</h3>
              <ul className="text-sm text-white/50 space-y-2 mt-3">
                <li>📋 Day 1: We submit your application</li>
                <li>✅ Day 2-3: Your system is built & tested</li>
                <li>🚀 Day 4-5: First batch of 20-30 leads generated</li>
                <li>📊 Day 7: Full report + strategy call</li>
                <li>💰 After pilot: Choose a plan or pause anytime</li>
              </ul>
            </div>
            <div className="glass rounded-2xl p-6">
              <ShieldCheck className="w-6 h-6 text-brand-400 mb-3" />
              <h3 className="font-bold text-white mb-1">No Risk. No Credit Card.</h3>
              <ul className="text-sm text-white/50 space-y-2 mt-3">
                <li>✓ 7-day free pilot (full access)</li>
                <li>✓ See actual leads generated for you</li>
                <li>✓ No credit card required to start</li>
                <li>✓ Cancel anytime (no penalties)</li>
                <li>✓ Your data is 100% private</li>
              </ul>
            </div>
            <div className="glass rounded-2xl p-6">
              <Clock className="w-6 h-6 text-brand-400 mb-3" />
              <h3 className="font-bold text-white mb-1">Response Guaranteed</h3>
              <p className="text-sm text-white/50">
                Mon – Fri · 9 AM – 8 PM IST<br />
                We respond to every inquiry within 2 hours. If you don&apos;t hear back, check your spam folder or WhatsApp.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
