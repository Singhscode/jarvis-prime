import Header from '@/components/Header';
import HeroSection from './_sections/HeroSection';
import HowItWorksSection from './_sections/HowItWorksSection';
import ResultsSection from './_sections/ResultsSection';
import PricingSection from './_sections/PricingSection';
import FaqPageSection from './_sections/FaqPageSection';
import FounderSection from './_sections/FounderSection';
import FeaturesSection from './_sections/FeaturesSection';
import CtaFooterSection from './_sections/CtaFooterSection';

export default function HomePage() {
  return (
    <div className="relative w-full overflow-x-hidden bg-[#030712]">
      <Header />

      <HeroSection />

      {/* Divider */}
      <div className="mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      <HowItWorksSection />

      {/* Divider */}
      <div className="mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      <ResultsSection />

      <PricingSection />

      {/* Divider */}
      <div className="mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      <FaqPageSection />

      {/* Divider */}
      <div className="mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      <FounderSection />

      {/* Divider */}
      <div className="mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      <FeaturesSection />

      {/* Divider */}
      <div className="mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      <CtaFooterSection />
    </div>
  );
}
