import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Book Your Free Strategy Call — JARVIS PRIME',
  description: 'Schedule a free 30-minute strategy call to discover how JARVIS PRIME can help you generate qualified meetings using AI-powered outbound systems.',
};

export default function BookCallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
