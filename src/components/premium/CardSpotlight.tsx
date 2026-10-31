"use client";

import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { useMotionPreference } from "@/components/motion/MotionProvider";

interface CardSpotlightProps extends React.HTMLAttributes<HTMLDivElement> {
  spotlightColor?: string;
  spotlightSize?: number;
}

/**
 * CardSpotlight component inspired by Aceternity UI (@aceternity) & Eldora UI (@eldoraui).
 * Adds a cursor-following radial glow across the surface cleanly without edge clipping artifacts.
 */
export function CardSpotlight({
  children,
  className,
  spotlightColor = "rgba(255, 255, 255, 0.04)",
  spotlightSize = 350,
  ...props
}: CardSpotlightProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [opacity, setOpacity] = useState(0);
  const { reducedMotion } = useMotionPreference();

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reducedMotion || !overlayRef.current || !divRef.current) return;
      const rect = divRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      overlayRef.current.style.background = `radial-gradient(${spotlightSize}px circle at ${x}px ${y}px, ${spotlightColor}, transparent 70%)`;
    },
    [reducedMotion, spotlightSize, spotlightColor]
  );

  const handleMouseEnter = useCallback(() => {
    if (!reducedMotion) setOpacity(1);
  }, [reducedMotion]);

  const handleMouseLeave = useCallback(() => {
    setOpacity(0);
  }, []);

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white/95 dark:bg-[#121215]/95 text-slate-900 dark:text-zinc-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden transition-all duration-200",
        className
      )}
      {...props}
    >
      {/* High-performance radial cursor spotlight without React re-renders */}
      <div
        ref={overlayRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300 z-0 overflow-hidden"
        style={{
          opacity,
          background: `radial-gradient(${spotlightSize}px circle at 0px 0px, ${spotlightColor}, transparent 70%)`,
        }}
      />

      {children}
    </div>
  );
}
