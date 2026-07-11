'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 px-4 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-full mb-6">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
              <span className="text-sm font-semibold text-blue-900">AI-Powered Lead Generation</span>
            </div>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-[1.1]">
              Stop Chasing Leads.<br />
              <span className="text-blue-600">Start Booking Meetings.</span>
            </h1>

            <p className="text-xl md:text-2xl text-gray-600 mb-8 leading-relaxed max-w-xl">
              JARVIS PRIME helps agencies and B2B companies generate qualified sales opportunities through AI-powered outbound systems.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/book-call"
                className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold text-lg shadow-lg hover:shadow-xl inline-flex items-center justify-center gap-2"
              >
                Book Free Strategy Call
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <a
                href="#process"
                className="px-8 py-4 border-2 border-gray-300 text-gray-900 rounded-lg hover:border-blue-600 hover:text-blue-600 transition-all font-semibold text-lg inline-flex items-center justify-center"
              >
                View Process
              </a>
            </div>
          </motion.div>

          {/* Right: Visual Dashboard */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative h-[600px] hidden lg:block"
          >
            {/* Connection Lines */}
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
              <line x1="30%" y1="20%" x2="50%" y2="50%" stroke="#E5E7EB" strokeWidth="2" strokeDasharray="5,5" />
              <line x1="50%" y1="50%" x2="70%" y2="30%" stroke="#E5E7EB" strokeWidth="2" strokeDasharray="5,5" />
              <line x1="50%" y1="50%" x2="60%" y2="75%" stroke="#E5E7EB" strokeWidth="2" strokeDasharray="5,5" />
            </svg>

            {/* Revenue Card */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-[15%] left-[5%] w-48 h-48 bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl shadow-2xl flex flex-col items-center justify-center text-white"
            >
              <div className="text-sm font-medium opacity-80 mb-2">Pipeline Generated</div>
              <div className="relative w-32 h-32">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
                  <circle cx="64" cy="64" r="56" fill="none" stroke="white" strokeWidth="8" strokeDasharray="351.68" strokeDashoffset="87.92" strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold">$2.4M</span>
                </div>
              </div>
            </motion.div>

            {/* Leads Generated Card */}
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="absolute top-[55%] left-[10%] bg-white rounded-2xl shadow-xl p-6 border border-gray-100 w-56"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-medium">Leads generated</div>
                  <div className="text-2xl font-bold text-gray-900">2,847</div>
                </div>
              </div>
              <div className="h-16">
                <svg className="w-full h-full" viewBox="0 0 200 60">
                  <path d="M 0 50 Q 20 45, 40 40 T 80 30 T 120 20 T 160 15 L 200 10" fill="none" stroke="#2563EB" strokeWidth="3" />
                  <path d="M 0 50 Q 20 45, 40 40 T 80 30 T 120 20 T 160 15 L 200 10 L 200 60 L 0 60 Z" fill="url(#gradient)" opacity="0.2" />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#2563EB" />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </motion.div>

            {/* Professional Person Card */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute top-[10%] right-[5%] w-64 h-80 bg-gradient-to-b from-gray-100 to-gray-200 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-full bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center">
                  <svg className="w-32 h-32 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
            </motion.div>

            {/* Email Open Rate Badge */}
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
              className="absolute bottom-[15%] right-[8%] bg-white rounded-2xl shadow-xl p-4 border border-gray-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-medium">Email open rate</div>
                  <div className="text-2xl font-bold text-gray-900">47.3%</div>
                  <div className="text-xs text-green-600 font-semibold">↑ 12% vs industry avg</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
