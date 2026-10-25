"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";

import { cn } from "@/lib/utils/cn";

interface BlurInProps {
  word: string;
  className?: string;
  "data-testid"?: string;
  variant?: {
    hidden: { filter: string; opacity: number };
    visible: { filter: string; opacity: number };
  };
  duration?: number;
}

const BlurIn = ({ word, className, "data-testid": testId, variant, duration = 1 }: BlurInProps) => {
  const prefersReducedMotion = useReducedMotion();
  const defaultVariants: Variants = {
    hidden: { filter: "blur(10px)", opacity: 0 },
    visible: { filter: "blur(0px)", opacity: 1 },
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
        "font-display text-center text-4xl font-bold tracking-[-0.02em] drop-shadow-sm md:text-7xl md:leading-[5rem]",
        className,
      )}
    >
      {word}
    </motion.h1>
  );
};

export { BlurIn };
