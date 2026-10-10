import { Variants } from "motion/react";
import { duration, easing, springs } from "./tokens";

/**
 * Standard page content entrance
 * Subtle 6px translation with quick opacity fade
 */
export const pageEntranceVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 6,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.standard,
      ease: easing.smoothOut,
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: {
      duration: duration.fast,
      ease: easing.smoothIn,
    },
  },
};

/**
 * Stagger container for grids and card collections
 */
export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

/**
 * Individual card entrance inside stagger container
 */
export const cardEntranceVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 8,
    scale: 0.99,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: duration.standard,
      ease: easing.smoothOut,
    },
  },
};

/**
 * Modal dialog popover animation
 * Clean zoom and fade from center
 */
export const modalOverlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: duration.fast, ease: easing.smoothOut },
  },
  exit: {
    opacity: 0,
    transition: { duration: duration.fast, ease: easing.smoothIn },
  },
};

export const modalContentVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.96,
    y: 8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: duration.dialog,
      ease: easing.smoothOut,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 4,
    transition: {
      duration: duration.fast,
      ease: easing.smoothIn,
    },
  },
};

/**
 * Drawer slide-over animation (e.g. ItemReviewDrawer)
 */
export const drawerSlideVariants: Variants = {
  hidden: {
    x: "100%",
    boxShadow: "0 0 0 rgba(0,0,0,0)",
  },
  visible: {
    x: 0,
    boxShadow: "-10px 0 30px rgba(0, 0, 0, 0.15)",
    transition: springs.gentle,
  },
  exit: {
    x: "100%",
    transition: {
      duration: duration.fast,
      ease: easing.smoothIn,
    },
  },
};

/**
 * Table row entrance / update animation
 */
export const tableRowVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 4,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.fast,
      ease: easing.smoothOut,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: {
      duration: duration.instant,
    },
  },
};

/**
 * Accordion / Expandable content height animation
 */
export const accordionVariants: Variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    overflow: "hidden",
    transition: {
      height: { duration: duration.fast, ease: easing.smoothIn },
      opacity: { duration: duration.instant },
    },
  },
  expanded: {
    height: "auto",
    opacity: 1,
    overflow: "visible",
    transition: {
      height: { duration: duration.standard, ease: easing.smoothOut },
      opacity: { duration: duration.fast, delay: 0.05 },
    },
  },
};

/**
 * Inline validation error reveal
 */
export const errorAlertVariants: Variants = {
  hidden: {
    opacity: 0,
    height: 0,
    y: -4,
    overflow: "hidden",
  },
  visible: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: {
      duration: duration.fast,
      ease: easing.smoothOut,
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -2,
    transition: {
      duration: duration.instant,
    },
  },
};

/**
 * Shutter camera flash / capture feedback
 */
export const shutterFlashVariants: Variants = {
  idle: { opacity: 0 },
  flash: {
    opacity: [0, 0.45, 0],
    transition: {
      duration: 0.18,
      times: [0, 0.2, 1],
    },
  },
};

/**
 * Reduced motion variants - replaces translations and scales with pure fast opacity
 */
export const reducedMotionVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: duration.instant },
  },
  exit: {
    opacity: 0,
    transition: { duration: duration.instant },
  },
};
