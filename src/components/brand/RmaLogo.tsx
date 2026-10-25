"use client";

import { cn } from "@/lib/utils/cn";

export interface RmaLogoProps {
  size?: number;
  variant?: "icon" | "full";
  className?: string;
  showSubtitle?: boolean;
  subtitle?: string;
}

/**
 * RmaLogo: Human-crafted, precision brand identity for RMA Operations.
 * Represents return shipment logistics, intake verification, and reverse supply chain routing.
 * Built with pure geometric vector lines, high contrast, and zero AI gimmicks.
 */
export function RmaLogo({
  size = 32,
  variant = "icon",
  className,
  showSubtitle = false,
  subtitle = "Return Processing",
}: RmaLogoProps) {
  const iconContent = (
    <div
      className="relative shrink-0 flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-2xs"
        aria-hidden="true"
      >
        {/* Precision structural squircle badge */}
        <rect
          width="32"
          height="32"
          rx="7.5"
          className="fill-slate-900 dark:fill-indigo-600 transition-colors"
        />
        <rect
          x="0.5"
          y="0.5"
          width="31"
          height="31"
          rx="7"
          className="stroke-slate-800/80 dark:stroke-indigo-400/30"
          strokeWidth="1"
        />

        {/* Reverse Logistics Return Flow: Top-to-Left Arrow */}
        <path
          d="M23 8H12C9.5 8 8 9.5 8 12V20"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5.5 17.5L8 20.5L10.5 17.5"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Reverse Logistics Return Flow: Bottom-to-Right Arrow */}
        <path
          d="M9 24H20C22.5 24 24 22.5 24 20V12"
          className="stroke-indigo-300 dark:stroke-indigo-200"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M26.5 14.5L24 11.5L21.5 14.5"
          className="stroke-indigo-300 dark:stroke-indigo-200"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Center Package Fold / Carton Seam */}
        <line
          x1="12"
          y1="16"
          x2="20"
          y2="16"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeOpacity="0.9"
        />
      </svg>
    </div>
  );

  if (variant === "icon") {
    return (
      <div className={cn("inline-flex items-center justify-center transition-transform active:scale-95", className)}>
        {iconContent}
      </div>
    );
  }

  // Full variant: Logo Mark + Humanized Wordmark
  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      {iconContent}
      <div className="flex flex-col text-left">
        <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white leading-none">
          RMA Operations
        </span>
        {showSubtitle && (
          <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 leading-tight mt-0.5">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
