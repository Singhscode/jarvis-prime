'use client';

import { useEffect, useRef } from 'react';

/**
 * Animated dot-grid background. Renders a subtle grid of dots that
 * gently shift opacity, giving a "breathing" tech-grid feel.
 * Uses canvas for performance. Respects prefers-reduced-motion.
 */
export default function ParticleGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const DOT_SPACING = 40;
    const DOT_RADIUS = 1;
    const dots: { x: number; y: number; phase: number }[] = [];

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = canvas!.offsetWidth * dpr;
      canvas!.height = canvas!.offsetHeight * dpr;
      ctx!.scale(dpr, dpr);
      buildDots();
    }

    function buildDots() {
      dots.length = 0;
      const cols = Math.ceil(canvas!.offsetWidth / DOT_SPACING) + 1;
      const rows = Math.ceil(canvas!.offsetHeight / DOT_SPACING) + 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          dots.push({
            x: c * DOT_SPACING,
            y: r * DOT_SPACING,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
    }

    function draw(time: number) {
      ctx!.clearRect(0, 0, canvas!.offsetWidth, canvas!.offsetHeight);

      for (const dot of dots) {
        const opacity = reducedMotion
          ? 0.15
          : 0.08 + 0.12 * Math.sin(time * 0.001 + dot.phase);
        ctx!.beginPath();
        ctx!.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(148, 163, 184, ${opacity})`;
        ctx!.fill();
      }

      if (!reducedMotion) {
        animationId = requestAnimationFrame(draw);
      }
    }

    resize();

    if (reducedMotion) {
      draw(0);
    } else {
      animationId = requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
      style={{ opacity: 0.6 }}
    />
  );
}
