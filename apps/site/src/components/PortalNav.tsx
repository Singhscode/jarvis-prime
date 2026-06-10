'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/leads', label: 'Leads', icon: '📥' },
  { href: '/tasks', label: 'Tasks', icon: '✓' },
];

export default function PortalNav() {
  const pathname = usePathname();

  const isPortalPage = pathname.includes('/dashboard') || 
                       pathname.includes('/leads') || 
                       pathname.includes('/tasks');

  if (!isPortalPage && pathname !== '/') {
    return null;
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-slate-900/95 to-slate-900/0 backdrop-blur-lg border-b border-slate-600/30">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-white hover:text-cyan-400 transition">
          <span className="text-2xl">🤖</span>
          <span>JARVIS PRIME</span>
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2 rounded-md font-semibold transition flex items-center gap-2 ${
                pathname === item.href
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span>{item.icon}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <Link
          href="/"
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-semibold hover:shadow-lg hover:shadow-cyan-500/50 transition hidden sm:block"
        >
          ← Back
        </Link>
      </div>
    </nav>
  );
}
