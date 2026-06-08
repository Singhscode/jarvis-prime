import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JARVIS PRIME — Generate 50+ Qualified Leads/Month Without Cold Calling",
  description:
    "Replace your entire SDR team with AI. Fully-automated lead generation, qualification & booking. ₹1/5th the cost of hiring. Start free pilot in 7 days.",
  keywords: ["lead generation", "AI SDR", "outbound automation", "sales automation", "B2B lead gen", "India"],
  openGraph: {
    title: "JARVIS PRIME — Your AI Sales Assistant",
    description: "Generate 50+ qualified leads/month while you sleep. Join 50+ agencies & SaaS companies scaling with JARVIS.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-dark text-white antialiased">{children}</body>
    </html>
  );
}
