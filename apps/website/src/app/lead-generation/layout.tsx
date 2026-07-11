import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI-Powered Lead Generation Services | JARVIS PRIME',
  description: 'Generate 10-20 qualified sales meetings per month with AI-powered lead generation. We handle prospect research, cold email, LinkedIn outreach, and appointment setting for agencies and B2B companies.',
  keywords: [
    'AI lead generation',
    'B2B lead generation',
    'cold email outreach',
    'LinkedIn automation',
    'appointment setting',
    'sales development',
    'outbound marketing',
    'lead generation agency',
    'AI sales automation',
    'qualified meetings'
  ],
  openGraph: {
    title: 'AI-Powered Lead Generation Services | JARVIS PRIME',
    description: 'Generate 10-20 qualified sales meetings per month with AI-powered outbound systems.',
    url: 'https://www.jarvisprime.me/lead-generation',
    siteName: 'JARVIS PRIME',
    images: [
      {
        url: 'https://www.jarvisprime.me/og-lead-generation.png',
        width: 1200,
        height: 630,
        alt: 'JARVIS PRIME Lead Generation Services',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI-Powered Lead Generation Services | JARVIS PRIME',
    description: 'Generate 10-20 qualified sales meetings per month with AI-powered outbound systems.',
    images: ['https://www.jarvisprime.me/og-lead-generation.png'],
  },
  alternates: {
    canonical: 'https://www.jarvisprime.me/lead-generation',
  },
};

export default function LeadGenerationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
