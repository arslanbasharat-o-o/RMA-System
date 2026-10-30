/**
 * Global Motion Design Tokens
 * 
 * Standardized timing, easing, and spring physics for the RMA Management System.
 * Tailored for high-frequency industrial enterprise SaaS workflows.
 * Inspired by Linear, Vercel, and Stripe dashboards.
 */

// Timing tokens (in seconds for Motion)
export const duration = {
  instant: 0.12,   // Micro feedback, button clicks, checkbox toggles
  fast: 0.16,      // Tooltips, badges, small state changes
  standard: 0.22,  // Row updates, dropdowns, card entrances
  dialog: 0.26,    // Modal dialogues, slide-over review drawers
  layout: 0.30,    // Major layout switches, sidebar collapse
} as const;

// Cubic bezier easings (Emil Kowalski design engineering curves)
export const easing = {
  // Snappy deceleration - primary curve for UI entering the viewport
  smoothOut: [0.23, 1, 0.32, 1] as [number, number, number, number],
  
  // iOS / Emil Kowalski drawer curve
  drawer: [0.32, 0.72, 0, 1] as [number, number, number, number],
  
  // Fast exit curve - never use slow ease-in for UI
  smoothIn: [0.23, 1, 0.32, 1] as [number, number, number, number],
  
  // Strong ease-in-out for on-screen movement
  smoothInOut: [0.77, 0, 0.175, 1] as [number, number, number, number],
  
  // Subtle anticipation for decisive actions
  subtleBounce: [0.34, 1.4, 0.64, 1] as [number, number, number, number],
} as const;

// Spring physics configs
export const springs = {
  // Snappy, non-overshooting spring for interactive elements (buttons, active pills)
  snappy: {
    type: "spring",
    stiffness: 420,
    damping: 32,
    mass: 0.8,
  },
  
  // Gentle spring for modals, drawers, and larger surfaces
  gentle: {
    type: "spring",
    stiffness: 300,
    damping: 28,
    mass: 1,
  },
  
  // Tightly damped spring for numerical tickers and progress bars
  counter: {
    type: "spring",
    stiffness: 280,
    damping: 26,
    mass: 0.8,
  },
} as const;
