"use client";

import React from "react";
import { motion } from "motion/react";
import { pageEntranceVariants } from "@/lib/motion/variants";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Standard page content entrance wrapper.
 * Provides a lightweight, accessible fade + 6px settle animation on page mount.
 * Zero layout shifts, no disruptive exit lockups, fully compatible with Next.js App Router streaming.
 */
export function PageTransition({ children, className = "" }: PageTransitionProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageEntranceVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}
