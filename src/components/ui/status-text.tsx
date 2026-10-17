import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  HelpCircle,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { LoadingIcon } from "@/components/ui/loading-icon";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "purple";

export interface StatusTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusTone;
  icon?: LucideIcon;
  loading?: boolean;
  showIcon?: boolean;
}

const tones: Record<StatusTone, { color: string; icon: LucideIcon }> = {
  success: { color: "text-emerald-700 dark:text-emerald-300", icon: CheckCircle2 },
  warning: { color: "text-amber-700 dark:text-amber-300", icon: AlertTriangle },
  danger: { color: "text-rose-700 dark:text-rose-300", icon: XCircle },
  info: { color: "text-blue-700 dark:text-blue-300", icon: Clock3 },
  neutral: { color: "text-neutral-600 dark:text-neutral-300", icon: Circle },
  purple: { color: "text-violet-700 dark:text-violet-300", icon: Sparkles },
};

/** Calm, readable status text shared by queue, record, and report screens. */
export function StatusText({
  variant = "neutral",
  icon,
  loading = false,
  showIcon = true,
  className,
  children,
  ...props
}: StatusTextProps) {
  const tone = tones[variant];
  const Icon = icon ?? tone.icon;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium leading-5", tone.color, className)}
      {...props}
    >
      {showIcon && loading && (
        <LoadingIcon className="size-3.5 shrink-0 text-current" />
      )}
      {showIcon && !loading && (
        <Icon
          aria-hidden="true"
          className="size-3.5 shrink-0"
        />
      )}
      <span>{children}</span>
    </span>
  );
}

export function StatusBadge(props: StatusTextProps) {
  return <StatusText {...props} />;
}
