'use client';

import { InlineWidget } from 'react-calendly';
import { useState, useEffect } from 'react';

interface CalendlyBookingProps {
  calendlyUrl?: string;
}

export default function CalendlyBooking({ 
  calendlyUrl = 'https://calendly.com/as4619666/free-ai-growth-strategy-call' 
}: CalendlyBookingProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Simulate loading state for smooth animation
    const timer = setTimeout(() => setIsLoaded(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section 
      id="calendar" 
      className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50 overflow-hidden"
    >
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="max-w-6xl mx-auto relative">
        {/* Section Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 border border-blue-200 rounded-full mb-6">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-sm font-semibold text-blue-900">Available Time Slots</span>
          </div>

          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Book Your Free Strategy Call
          </h2>
          
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Discover how JARVIS PRIME can help you generate qualified meetings using AI-powered outbound systems.
          </p>

          {/* Trust indicators */}
          <div className="flex flex-wrap justify-center gap-6 mt-8 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">30-Minute Call</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">No Credit Card Required</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Instant Confirmation</span>
            </div>
          </div>
        </div>

        {/* Calendly Widget Container */}
        <div 
          className={`
            bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden
            transition-all duration-700 ease-out
            ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
          `}
        >
          {/* Loading skeleton */}
          {!isLoaded && (
            <div className="animate-pulse p-8">
              <div className="h-12 bg-gray-200 rounded mb-4"></div>
              <div className="h-8 bg-gray-200 rounded mb-4 w-3/4"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          )}

          {/* Calendly Embed */}
          <div className={`${isLoaded ? 'block' : 'hidden'}`}>
            <InlineWidget
              url={calendlyUrl}
              styles={{
                height: '700px',
                minWidth: '100%',
              }}
              pageSettings={{
                backgroundColor: 'ffffff',
                hideEventTypeDetails: false,
                hideLandingPageDetails: false,
                primaryColor: '2563eb',
                textColor: '1f2937',
              }}
            />
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">
            Have questions before booking? <a href="mailto:hello@jarvisprime.me" className="text-blue-600 hover:text-blue-700 font-semibold underline">Email us</a> or call <a href="tel:+918810500723" className="text-blue-600 hover:text-blue-700 font-semibold">+91 88105 00723</a>
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-500">
            <span>🔒 Your information is secure</span>
            <span>•</span>
            <span>📅 Choose your preferred time</span>
            <span>•</span>
            <span>✓ Confirmed within seconds</span>
          </div>
        </div>
      </div>

      {/* Add blob animation keyframes */}
      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </section>
  );
}
