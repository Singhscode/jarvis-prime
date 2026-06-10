import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import PortalNav from '@/components/PortalNav';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'JARVIS PRIME — AI Outbound Automation',
  description:
    'Generate 50-100 qualified leads per month. Book 8-12 discovery calls. Close 1-2 deals. All automated.',
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
      </body>
    </html>
  );
}
