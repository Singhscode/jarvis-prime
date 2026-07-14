'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

export default function LeadGenerationPage() {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  return (
    <div className="relative w-full overflow-x-hidden bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center">
              <Image src="/logo.svg" alt="JARVIS PRIME" width={300} height={64} priority className="h-9 w-auto" />
            </Link>
            <nav className="hidden md:flex items-center gap-8">
              <Link href="/#services" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Services</Link>
              <Link href="/#pricing" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Pricing</Link>
              <Link href="/lead-generation" className="text-blue-600 font-semibold">Lead Generation</Link>
            </nav>
            <Link href="/book-call" className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold shadow-md hover:shadow-lg">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
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

      {/* Trust Bar */}
      <section className="py-12 px-4 bg-gray-50 border-y border-gray-200">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-2">AI-Powered</div>
              <div className="text-sm text-gray-600">Intelligent Outreach</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-2">10-20</div>
              <div className="text-sm text-gray-600">Qualified Meetings/Month</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-2">Multi-Channel</div>
              <div className="text-sm text-gray-600">Email + LinkedIn + Voice</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-2">Full Integration</div>
              <div className="text-sm text-gray-600">CRM &amp; Automation</div>
            </div>
          </div>
        </div>
      </section>


      {/* Services Section */}
      <section id="services" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Complete Lead Generation System
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Six core services working together to fill your pipeline with qualified opportunities
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                ),
                title: 'Lead Research',
                description: 'AI-powered prospect identification using 50+ data sources to find your ideal customers.',
                color: 'from-blue-500 to-blue-600'
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                ),
                title: 'Cold Email Outreach',
                description: 'Personalized multi-touch sequences with 35-50% open rates and 5-10% reply rates.',
                color: 'from-cyan-500 to-blue-600'
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                ),
                title: 'LinkedIn Outreach',
                description: 'Automated connection requests, profile visits, and personalized messaging at scale.',
                color: 'from-blue-600 to-indigo-600'
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                ),
                title: 'Appointment Setting',
                description: 'Smart calendar integration with automatic booking, reminders, and no-show prevention.',
                color: 'from-indigo-500 to-purple-600'
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                ),
                title: 'CRM Automation',
                description: 'Seamless integration with HubSpot, Salesforce, and other CRMs for automatic data sync.',
                color: 'from-purple-500 to-pink-600'
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                ),
                title: 'AI Personalization',
                description: 'Machine learning algorithms craft unique messages based on prospect behavior and signals.',
                color: 'from-pink-500 to-red-600'
              }
            ].map((service, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="group relative bg-white rounded-2xl p-8 border border-gray-200 hover:border-blue-300 hover:shadow-2xl transition-all duration-300"
              >
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${service.color} flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform duration-300`}>
                  {service.icon}
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">{service.title}</h3>
                <p className="text-gray-600 leading-relaxed">{service.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section id="process" className="py-20 px-4 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-600">
              From prospect research to booked meetings in 5 simple steps
            </p>
          </motion.div>

          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-600 via-cyan-500 to-blue-600 hidden md:block"></div>

            <div className="space-y-12">
              {[
                {
                  number: '01',
                  title: 'Prospect Research',
                  description: 'We analyze your ICP and build a qualified list of 1,000+ prospects using AI-powered enrichment across multiple data sources.',
                  icon: (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  )
                },
                {
                  number: '02',
                  title: 'AI Enrichment',
                  description: 'Our AI enriches each prospect with behavioral signals, company data, tech stack, hiring trends, and buying intent signals.',
                  icon: (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  )
                },
                {
                  number: '03',
                  title: 'Personalized Outreach',
                  description: 'Launch coordinated campaigns across email and LinkedIn with AI-personalized messaging that speaks to each prospect individually.',
                  icon: (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )
                },
                {
                  number: '04',
                  title: 'Lead Qualification',
                  description: 'AI scores and qualifies responses in real-time, identifying hot leads and routing them directly to your sales team.',
                  icon: (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )
                },
                {
                  number: '05',
                  title: 'Meeting Booking',
                  description: 'Prospects book directly on your calendar. You receive instant Telegram alerts and auto-synced CRM updates for every booked meeting.',
                  icon: (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )
                }
              ].map((step, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="relative flex gap-8 items-start"
                >
                  {/* Step Number Circle */}
                  <div className="hidden md:flex flex-shrink-0 w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 items-center justify-center text-white font-bold text-xl shadow-lg relative z-10">
                    {step.number}
                  </div>

                  {/* Content Card */}
                  <div className="flex-1 bg-white rounded-2xl p-8 border border-gray-200 hover:border-blue-300 hover:shadow-xl transition-all">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                        {step.icon}
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">{step.title}</h3>
                        <p className="text-gray-600 leading-relaxed">{step.description}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* Results Section */}
      <section id="results" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Real Results, Real Growth
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Data-driven outcomes from our AI-powered lead generation system
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                metric: '2,847',
                label: 'Leads Generated',
                change: '+127%',
                trend: 'up',
                color: 'from-blue-500 to-cyan-500'
              },
              {
                metric: '142',
                label: 'Meetings Booked',
                change: '+89%',
                trend: 'up',
                color: 'from-cyan-500 to-blue-500'
              },
              {
                metric: '47.3%',
                label: 'Reply Rate',
                change: '+3.2x',
                trend: 'up',
                color: 'from-blue-500 to-indigo-500'
              },
              {
                metric: '$2.4M',
                label: 'Pipeline Growth',
                change: '+215%',
                trend: 'up',
                color: 'from-indigo-500 to-purple-500'
              }
            ].map((stat, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="relative bg-white rounded-2xl p-8 border border-gray-200 hover:shadow-2xl transition-all group overflow-hidden"
              >
                {/* Gradient Background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-5 transition-opacity`}></div>
                
                <div className="relative">
                  <div className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">{stat.metric}</div>
                  <div className="text-sm font-medium text-gray-600 mb-3">{stat.label}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 font-semibold text-sm">{stat.change}</span>
                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                </div>

                {/* Mini Chart */}
                <div className="mt-4 h-12 opacity-50">
                  <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                    <path
                      d={`M 0 ${40 - idx * 3} Q 25 ${35 - idx * 4}, 50 ${30 - idx * 3} T 100 ${20 - idx * 2}`}
                      fill="none"
                      stroke={`url(#gradient-${idx})`}
                      strokeWidth="2"
                    />
                    <defs>
                      <linearGradient id={`gradient-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#2563EB" />
                        <stop offset="100%" stopColor="#06B6D4" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Additional Metrics Bar */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: '35-50%', label: 'Email Open Rate' },
              { value: '5-10%', label: 'Reply Rate' },
              { value: '2-4 weeks', label: 'Time to First Meeting' },
              { value: '10-20', label: 'Meetings Per Month' }
            ].map((metric, idx) => (
              <div key={idx} className="text-center p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                <div className="text-3xl font-bold text-blue-600 mb-2">{metric.value}</div>
                <div className="text-sm text-gray-700 font-medium">{metric.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case Studies Section */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Success Stories
            </h2>
            <p className="text-xl text-gray-600">
              See how we helped agencies scale their outbound
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                company: 'Digital Growth Agency',
                industry: 'Marketing Agency',
                challenge: 'Struggling to book qualified meetings with enterprise clients',
                solution: 'Implemented AI-powered LinkedIn + Email outreach targeting CMOs',
                results: ['18 meetings/month', '$450K pipeline', '65% open rate']
              },
              {
                company: 'SaaS Startup',
                industry: 'B2B SaaS',
                challenge: 'Manual outreach taking 20+ hours per week with low response rates',
                solution: 'Automated multi-channel campaigns with AI personalization',
                results: ['12 demos/month', '3x reply rate', '15 hours saved/week']
              },
              {
                company: 'Tech Consulting Firm',
                industry: 'IT Services',
                challenge: 'Cold outreach getting ignored, need for enterprise-grade leads',
                solution: 'Targeted Fortune 500 CTOs with intent-based triggers',
                results: ['22 meetings/month', '$1.2M pipeline', '8% reply rate']
              }
            ].map((study, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white rounded-2xl p-8 border border-gray-200 hover:shadow-2xl transition-all"
              >
                <div className="mb-6">
                  <div className="text-sm font-semibold text-blue-600 mb-2">{study.industry}</div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">{study.company}</h3>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Challenge</div>
                    <p className="text-gray-700">{study.challenge}</p>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Solution</div>
                    <p className="text-gray-700">{study.solution}</p>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Results</div>
                    <div className="flex flex-wrap gap-2">
                      {study.results.map((result, resultIdx) => (
                        <span key={resultIdx} className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-semibold">
                          ✓ {result}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Calendly Booking Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-600 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }}></div>
        </div>

        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Book Your Free Strategy Call
            </h2>
            <p className="text-xl text-blue-100 max-w-2xl mx-auto">
              Discover how JARVIS PRIME can generate 10-20 qualified meetings per month for your business
            </p>
          </motion.div>

          {/* Calendly Embed Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="bg-white rounded-3xl shadow-2xl p-4 md:p-8"
          >
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">What to Expect</h3>
                <ul className="space-y-3">
                  {[
                    '30-minute strategy session',
                    'Custom lead generation plan',
                    'ROI calculator for your industry',
                    'No credit card required'
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center gap-3">
                      <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex-1 w-full">
                <Link
                  href="/book-call"
                  className="block w-full py-6 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-2xl hover:shadow-2xl transition-all font-bold text-xl text-center"
                >
                  Schedule Your Free Call →
                </Link>
                <p className="text-center text-sm text-gray-500 mt-4">
                  Available slots filling fast · No sales pitch · Just value
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>


      {/* FAQ Section */}
      <section id="faq" className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-gray-600">
              Everything you need to know about our lead generation service
            </p>
          </motion.div>

          <div className="space-y-4">
            {[
              {
                q: 'How does your AI-powered lead generation work?',
                a: 'We use machine learning algorithms to identify your ideal prospects across 50+ data sources, enrich them with behavioral signals, and craft personalized outreach messages. Our AI analyzes response patterns and continuously optimizes campaigns for maximum reply rates.'
              },
              {
                q: 'What industries do you specialize in?',
                a: 'We work primarily with B2B companies including web development agencies, marketing agencies, SaaS startups, consulting firms, and professional services. Our system is optimized for high-ticket B2B sales cycles.'
              },
              {
                q: 'How many meetings can I expect per month?',
                a: 'Most clients generate 10-20 qualified meetings per month within the first 60 days. Results vary based on your industry, offer clarity, and ideal customer profile. We guarantee at least 8 meetings in your first 60 days or we work for free until we hit that number.'
              },
              {
                q: 'What is your pricing model?',
                a: 'We offer three tiers: Starter at ₹29,000/month (50 leads), Growth at ₹70,000/month + ₹4,000 per meeting (150 leads), and Enterprise custom pricing. We\'re aligned on quality and results, not just volume.'
              },
              {
                q: 'Do you handle both email and LinkedIn outreach?',
                a: 'Yes. We run coordinated multi-channel campaigns across cold email and LinkedIn. Email typically generates higher volume while LinkedIn provides social proof and relationship building. The combination increases overall response rates by 2-3x.'
              },
              {
                q: 'How do you ensure high deliverability and avoid spam?',
                a: 'We use domain rotation, warm-up sequences, SPF/DKIM/DMARC authentication, and AI-powered send timing. Our average deliverability rate is 95%+. We also monitor sender reputation and adjust strategies in real-time.'
              },
              {
                q: 'Can you integrate with our existing CRM?',
                a: 'Yes. We integrate with all major CRMs including HubSpot, Salesforce, Pipedrive, Close, and others. All leads, activities, and meetings automatically sync to your CRM in real-time.'
              },
              {
                q: 'How long does it take to see results?',
                a: 'Most clients book their first meeting within 2-3 weeks. Full campaign optimization takes 30-45 days as we test messaging, refine targeting, and scale what works. We continuously optimize throughout the engagement.'
              },
              {
                q: 'What makes you different from Apollo or Lemlist?',
                a: 'Those are tools - we are a full-service agency. We handle strategy, prospect research, copywriting, campaign management, A/B testing, and optimization. You just show up to the meetings we book. Think of us as your outsourced SDR team powered by AI.'
              },
              {
                q: 'Do you offer a guarantee?',
                a: 'Yes. If we do not book at least 8 qualified meetings in your first 60 days, we will continue working for free until we do. We stand behind our results and are incentivized by the per-meeting success fee.'
              }
            ].map((faq, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.05 }}
                className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-lg transition-all"
              >
                <button
                  onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
                  className="w-full px-6 py-5 text-left flex justify-between items-center hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900 pr-8">{faq.q}</span>
                  <span className="text-2xl text-gray-400 flex-shrink-0">
                    {faqOpen === idx ? '−' : '+'}
                  </span>
                </button>
                {faqOpen === idx && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-6 pb-5 bg-gray-50 border-t border-gray-200"
                  >
                    <p className="text-gray-700 leading-relaxed pt-4">{faq.a}</p>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 left-10 w-72 h-72 bg-blue-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-cyan-500 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-5xl mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Ready to Fill Your Calendar<br />
              With Qualified Meetings?
            </h2>
            <p className="text-xl md:text-2xl text-blue-100 mb-10 max-w-3xl mx-auto">
              Join 100+ agencies and B2B companies using AI-powered outbound to scale their sales pipeline
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Link
                href="/book-call"
                className="px-10 py-5 bg-white text-blue-600 rounded-xl hover:bg-blue-50 transition-all font-bold text-xl shadow-2xl hover:shadow-3xl inline-flex items-center gap-3"
              >
                Book Free Strategy Call
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link
                href="/#pricing"
                className="px-10 py-5 border-2 border-white text-white rounded-xl hover:bg-white hover:text-blue-600 transition-all font-bold text-xl"
              >
                View Pricing
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-8 text-blue-100">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>8 meeting guarantee</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Setup in 2-4 weeks</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-gray-900 text-gray-300 py-12 px-4 border-t border-gray-800">
        <div className="max-w-6xl mx-auto text-center">
          <Image src="/logo-white.svg" alt="JARVIS PRIME" width={300} height={64} className="h-10 w-auto mx-auto mb-6" />
          <p className="text-gray-400 mb-6">
            AI-powered outbound and appointment-setting for agencies and B2B companies
          </p>
          <div className="space-y-2 mb-6">
            <p>
              <a href="mailto:hello@jarvisprime.me" className="hover:text-white transition-colors">
                hello@jarvisprime.me
              </a>
            </p>
            <p>
              <a href="tel:+918810500723" className="hover:text-white transition-colors">
                +91 88105 00723
              </a>
            </p>
            <p className="text-gray-400">
              Gurgaon, Haryana, India
            </p>
          </div>

          {/* Social Links */}
          <div className="flex justify-center gap-4 mb-8">
            <a 
              href="https://www.linkedin.com/company/jarvis-prime-ai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-gray-800 hover:bg-blue-600 flex items-center justify-center transition-all"
              aria-label="Follow us on LinkedIn"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
            <a 
              href="https://x.com/jarvisprime_ai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-gray-800 hover:bg-black flex items-center justify-center transition-all"
              aria-label="Follow us on X (Twitter)"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
          </div>

          <div className="border-t border-gray-800 pt-8 text-sm text-gray-500">
            <p>&copy; 2026 JARVIS PRIME. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
