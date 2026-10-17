"use client";

import React, { useState } from "react";
import { motion, type SVGMotionProps } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { RmaLogo } from "@/components/brand/RmaLogo";
export { RmaLogo } from "@/components/brand/RmaLogo";

interface IconProps extends Omit<SVGMotionProps<SVGSVGElement>, "animate"> {
  size?: number;
  className?: string;
  animateOnHover?: boolean;
}

/**
 * AnimatedShield - Inspired by @animateicons & @motion-primitives.
 * Interactive security shield with stroke trace and central verified badge.
 */
export function AnimatedShield({
  size = 20,
  className,
  animateOnHover = true,
  ...props
}: IconProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      {/* Outer shield path */}
      <motion.path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        initial={{ pathLength: 1 }}
        animate={isHovered ? { pathLength: [0.8, 1], scale: [1, 1.04, 1] } : { pathLength: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
      {/* Center checkmark */}
      <motion.path
        d="M9 12l2 2 4-4"
        initial={{ pathLength: 1 }}
        animate={isHovered ? { pathLength: [0, 1] } : { pathLength: 1 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      />
    </motion.svg>
  );
}

/**
 * AnimatedLock - Interactive padlock with shackle unlock motion.
 */
interface AnimatedLockProps extends IconProps {
  unlocked?: boolean;
}

export function AnimatedLock({
  size = 20,
  className,
  unlocked = false,
  animateOnHover = true,
  ...props
}: AnimatedLockProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isOpen = unlocked || isHovered;

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      {/* Shackle arch */}
      <motion.path
        d="M7 11V7a5 5 0 0 1 10 0v4"
        animate={
          isOpen
            ? { y: -3, rotate: -15, originX: 0.3, originY: 0.8 }
            : { y: 0, rotate: 0 }
        }
        transition={{ type: "spring", stiffness: 450, damping: 25 }}
      />
      {/* Lock Body */}
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      {/* Keyhole dot & slot */}
      <motion.circle
        cx="12"
        cy="16"
        r="1.2"
        fill="currentColor"
        animate={isOpen ? { scale: [1, 1.3, 1] } : {}}
        transition={{ duration: 0.25 }}
      />
      <path d="M12 17.5v1.5" />
    </motion.svg>
  );
}

/**
 * AnimatedMail - Interactive envelope with flap lift and letter slide.
 */
export function AnimatedMail({
  size = 20,
  className,
  animateOnHover = true,
  ...props
}: IconProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      {/* Envelope body */}
      <rect x="2" y="4" width="20" height="16" rx="2" />
      {/* Animated envelope folds */}
      <motion.path
        d="M22 6l-10 7L2 6"
        animate={
          isHovered
            ? { d: "M22 6l-10 4L2 6" }
            : { d: "M22 6l-10 7L2 6" }
        }
        transition={{ duration: 0.25, ease: "easeOut" }}
      />
      {isHovered && (
        <motion.line
          x1="7"
          y1="15"
          x2="13"
          y2="15"
          strokeWidth="1.5"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 0.8, y: 0 }}
          exit={{ opacity: 0 }}
        />
      )}
    </motion.svg>
  );
}

/**
 * AnimatedKey - Security key with rotating shimmer and teeth pulse.
 */
export function AnimatedKey({
  size = 20,
  className,
  animateOnHover = true,
  ...props
}: IconProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      animate={isHovered ? { rotate: [-10, 12, 0] } : { rotate: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M12 12l9-9" />
      <motion.path
        d="M18 6l2 2M15 9l2 2"
        animate={isHovered ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 0.3 }}
      />
    </motion.svg>
  );
}

/**
 * AnimatedEye - Interactive password visibility toggle with eyelid blink animation.
 */
interface AnimatedEyeProps extends IconProps {
  visible?: boolean;
}

export function AnimatedEye({
  size = 18,
  className,
  visible = true,
  animateOnHover = true,
  ...props
}: AnimatedEyeProps) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0 select-none transition-transform duration-150 active:scale-90", className)}
      {...props}
    >
      {visible ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <motion.circle
            cx="12"
            cy="12"
            r="3"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <motion.line
            x1="1"
            y1="1"
            x2="23"
            y2="23"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.2 }}
          />
        </>
      )}
    </motion.svg>
  );
}

/**
 * AnimatedLogout - Smooth exit portal SVG icon with sliding arrow.
 */
export function AnimatedLogout({
  size = 18,
  className,
  animateOnHover = true,
  ...props
}: IconProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <motion.polyline
        points="16 17 21 12 16 7"
        animate={isHovered ? { x: [0, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      />
      <motion.line
        x1="21"
        y1="12"
        x2="9"
        y2="12"
        animate={isHovered ? { x2: [9, 12, 9] } : { x2: 9 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      />
    </motion.svg>
  );
}

/**
 * AnimatedPackageCheck - Executive operations intake box icon with tick and lid motion.
 */
export function AnimatedPackageCheck({
  size = 20,
  className,
  animateOnHover = true,
  ...props
}: IconProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <path d="M16.5 9.4 7.55 4.24a1.8 1.8 0 0 0-1.8 0L2.8 5.92A1.8 1.8 0 0 0 2 7.48v9.04a1.8 1.8 0 0 0 .9 1.56l3.95 2.28a1.8 1.8 0 0 0 1.8 0l11.45-6.6a1.8 1.8 0 0 0 .9-1.56V9.4" />
      <motion.path
        d="m3.3 7 8.7 5 8.7-5"
        animate={isHovered ? { y: [-1, 1, 0] } : { y: 0 }}
        transition={{ duration: 0.3 }}
      />
      <motion.path
        d="M12 12v9"
        animate={isHovered ? { opacity: [0.7, 1] } : { opacity: 1 }}
      />
      <motion.path
        d="m16 4 3 3 5-5"
        initial={{ pathLength: 1 }}
        animate={isHovered ? { pathLength: [0.2, 1] } : { pathLength: 1 }}
        transition={{ duration: 0.35 }}
      />
    </motion.svg>
  );
}

/**
 * AnimatedDisplayModule - Display screen SVG with OCR flex cable circuits.
 */
export function AnimatedDisplayModule({
  size = 20,
  className,
  animateOnHover = true,
  ...props
}: IconProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      {/* Screen Frame */}
      <rect x="5" y="2" width="14" height="20" rx="3" />
      {/* Screen Notch */}
      <path d="M10 5h4" strokeWidth="2" strokeLinecap="round" />
      {/* Center Scan Beam */}
      <motion.line
        x1="7"
        y1="12"
        x2="17"
        y2="12"
        strokeWidth="1.5"
        stroke="currentColor"
        opacity={isHovered ? 1 : 0.4}
        animate={isHovered ? { y1: [7, 17, 7], y2: [7, 17, 7] } : { y1: 12, y2: 12 }}
        transition={{ duration: 1.2, repeat: isHovered ? Infinity : 0, ease: "easeInOut" }}
      />
      {/* Home indicator bar */}
      <path d="M10 19h4" strokeWidth="1.5" />
    </motion.svg>
  );
}

/**
 * AnimatedGauge - Verification rate precision gauge icon with rotating needle.
 */
export function AnimatedGauge({
  size = 20,
  className,
  animateOnHover = true,
  ...props
}: IconProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <path d="M12 2v2M4.93 4.93l1.41 1.41M2 12h2M20 12h2M17.66 6.34l1.41-1.41" />
      <path d="M3.5 17.5a10 10 0 1 1 17 0" />
      <motion.line
        x1="12"
        y1="12"
        x2="16"
        y2="8"
        strokeWidth="2.5"
        animate={isHovered ? { rotate: [-20, 25, 0], originX: 0.5, originY: 0.5 } : { rotate: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </motion.svg>
  );
}

/**
 * AnimatedAlertTriage - Warning triage alert icon with pulsing exclamation dot.
 */
export function AnimatedAlertTriage({
  size = 20,
  className,
  animateOnHover = true,
  ...props
}: IconProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <motion.path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        animate={isHovered ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={{ duration: 0.3 }}
      />
      <line x1="12" y1="9" x2="12" y2="13" />
      <motion.circle
        cx="12"
        cy="17"
        r="1"
        fill="currentColor"
        animate={isHovered ? { scale: [1, 1.4, 1] } : { scale: 1 }}
        transition={{ duration: 0.25 }}
      />
    </motion.svg>
  );
}

/**
 * AnimatedBrandEmblem - Clean handcrafted RMA System Brand Emblem.
 */
export function AnimatedBrandEmblem({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return <RmaLogo size={size} className={className} variant="icon" />;
}

/**
 * AnimatedArrowRight - Sleek directional action arrow with sliding motion.
 */
export function AnimatedArrowRight({
  size = 18,
  className,
  animateOnHover = true,
  ...props
}: IconProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <motion.line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
        animate={isHovered ? { x2: [19, 21, 19] } : { x2: 19 }}
        transition={{ duration: 0.3 }}
      />
      <motion.polyline
        points="12 5 19 12 12 19"
        animate={isHovered ? { x: [0, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.3 }}
      />
    </motion.svg>
  );
}

/**
 * AnimatedCheckCircle - Verified state circle with spring checkmark.
 */
export function AnimatedCheckCircle({
  size = 20,
  className,
  animateOnHover = true,
  ...props
}: IconProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <motion.path
        d="m9 12 2 2 4-4"
        initial={{ pathLength: 1 }}
        animate={isHovered ? { pathLength: [0, 1] } : { pathLength: 1 }}
        transition={{ duration: 0.3 }}
      />
    </motion.svg>
  );
}

/**
 * AnimatedRefresh - Rotating sync glyph.
 */
interface AnimatedRefreshProps extends IconProps {
  spinning?: boolean;
}

export function AnimatedRefresh({
  size = 18,
  className,
  spinning = false,
  animateOnHover = true,
  ...props
}: AnimatedRefreshProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      animate={
        spinning
          ? { rotate: 360 }
          : isHovered
          ? { rotate: [0, 180] }
          : { rotate: 0 }
      }
      transition={
        spinning
          ? { repeat: Infinity, duration: 0.8, ease: "linear" }
          : { duration: 0.4, ease: "easeOut" }
      }
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </motion.svg>
  );
}
