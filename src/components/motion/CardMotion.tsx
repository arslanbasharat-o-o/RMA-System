"use client";

import { motion, HTMLMotionProps } from "motion/react";
import { cardEntranceVariants, staggerContainerVariants } from "@/lib/motion/variants";

export function MotionCardGrid({
  children,
  className = "",
  ...props
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionCardItem({
  children,
  className = "",
  ...props
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={cardEntranceVariants}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
