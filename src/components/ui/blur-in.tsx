"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";

import { cn } from "@/lib/utils/cn";

interface BlurInProps {
  word: string;
  className?: string;
  "data-testid"?: string;
  variant?: {
    hidden: { filter: string; opacity: number; y?: number };
    visible: { filter: string; opacity: number; y?: number };
  };
  duration?: number;
}

const BlurIn = ({ word, className, "data-testid": testId, variant, duration = 0.2 }: BlurInProps) => {
  const prefersReducedMotion = useReducedMotion();
  const defaultVariants: Variants = {
    hidden: { filter: "blur(4px)", opacity: 0, y: 3 },
    visible: { filter: "blur(0px)", opacity: 1, y: 0 },
  };
  const combinedVariants = variant ?? defaultVariants;

  return (
    <motion.h1
      initial={prefersReducedMotion ? false : "hidden"}
      animate="visible"
      transition={{
        duration: prefersReducedMotion ? 0 : duration,
        ease: [0.23, 1, 0.32, 1],
      }}
      variants={combinedVariants}
      data-testid={testId}
      className={cn(
        "font-display text-xl sm:text-2xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 will-change-[transform,opacity,filter]",
        className,
      )}
    >
      {word}
    </motion.h1>
  );
};

export { BlurIn };
