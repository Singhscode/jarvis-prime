import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import PortalNav from '@/components/PortalNav';
import ChatWidget from '@/components/ChatWidget';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'JARVIS PRIME — AI Appointment Setting for Agencies & B2B Companies',
  description:
    'Book more qualified sales calls without hiring SDRs. AI-powered cold email, LinkedIn outreach, and appointment setting for web dev agencies, marketing agencies, and B2B companies. Based in Gurgaon, Haryana, India.',
  keywords: 'AI appointment setting, cold email automation, LinkedIn outreach, lead generation, B2B sales, SDR automation, sales calls, qualified meetings, Gurgaon, Haryana, India',
  authors: [{ name: 'JARVIS PRIME' }],
  creator: 'JARVIS PRIME',
  publisher: 'JARVIS PRIME',
  icons: {
    icon: [{ url: '/icon.svg?v=2', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon.svg?v=2' }],
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.jarvisprime.me',
    title: 'JARVIS PRIME — AI Appointment Setting for Agencies & B2B Companies',
    description: 'Book more qualified sales calls without hiring SDRs. AI-powered outbound automation for agencies and B2B companies.',
    siteName: 'JARVIS PRIME',
    images: [
      {
        url: 'https://www.jarvisprime.me/og-image.png',
        width: 1200,
        height: 630,
        alt: 'JARVIS PRIME - AI Appointment Setting',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JARVIS PRIME — AI Appointment Setting for Agencies',
    description: 'Book more qualified sales calls without hiring SDRs. AI-powered outbound automation.',
    images: ['https://www.jarvisprime.me/og-image.png'],
    creator: '@jarvisprime_ai',
    site: '@jarvisprime_ai',
  },
  other: {
    'linkedin:company': 'jarvis-prime-ai',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <PortalNav />
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
