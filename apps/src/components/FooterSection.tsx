import { Zap } from "lucide-react";

export default function FooterSection() {
  return (
    <footer className="border-t border-white/10 py-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2 font-bold text-lg">
          <Zap className="w-5 h-5 text-brand-400" />
          <span className="text-gradient">JARVIS PRIME</span>
        </div>
        <p className="text-white/30 text-sm text-center">
          © 2026 JARVIS PRIME. AI Automation Agency. India.
        </p>
        <div className="flex items-center gap-6 text-sm text-white/40">
          <a href="#services" className="hover:text-brand-300 transition-colors">Services</a>
          <a href="#pricing" className="hover:text-brand-300 transition-colors">Pricing</a>
          <a href="#contact" className="hover:text-brand-300 transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  );
}
