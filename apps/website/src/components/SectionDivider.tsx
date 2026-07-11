/**
 * Gradient mesh divider between sections.
 * Renders a subtle gradient bar with noise texture.
 */
export default function SectionDivider({
  className = '',
  flip = false,
}: {
  className?: string;
  flip?: boolean;
}) {
  return (
    <div
      className={`relative h-px w-full overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div
        className={`absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent ${
          flip ? 'rotate-180' : ''
        }`}
      />
      {/* Center glow dot */}
      <div className="absolute left-1/2 top-1/2 h-8 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-xl" />
    </div>
  );
}
