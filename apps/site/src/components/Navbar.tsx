"use client";

import { useState } from "react";
import { Menu, X, Zap } from "lucide-react";

const links = [
  { label: "Services", href: "#services" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Results", href: "#results" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2 font-bold text-lg text-white">
          <Zap className="w-5 h-5 text-brand-400" />
          <span className="text-gradient">JARVIS PRIME</span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm text-white/70 hover:text-brand-300 transition-colors"
            >
              {l.label}
            </a>
          ))}
          <a
            href="#contact"
            className="bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors glow-green"
          >
            Book Free Call
          </a>
        </div>

        <button
          className="md:hidden text-white/70 hover:text-white"
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden glass border-t border-white/10 px-4 py-4 flex flex-col gap-4">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm text-white/70 hover:text-brand-300"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <a
            href="#contact"
            className="bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-lg text-center"
            onClick={() => setOpen(false)}
          >
            Book Free Call
          </a>
        </div>
      )}
    </nav>
  );
}
