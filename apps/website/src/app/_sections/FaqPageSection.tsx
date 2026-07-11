import Reveal from '@/components/Reveal';
import FaqSection from '@/components/FaqSection';

export default function FaqPageSection() {
  return (
    <section id="faq" className="relative z-10 px-4 py-28">
      <div className="mx-auto max-w-4xl">
        <Reveal className="mb-16 text-center" variant="fade">
          <span className="mb-4 inline-block rounded-full border border-violet-500/10 bg-violet-500/5 px-4 py-1.5 text-sm font-medium text-violet-400">
            Support
          </span>
          <h2 className="mb-4 font-display text-4xl font-bold text-white md:text-5xl">Frequently Asked</h2>
          <p className="text-xl text-slate-400">Everything you need to know</p>
        </Reveal>
        <FaqSection />
      </div>
    </section>
  );
}
