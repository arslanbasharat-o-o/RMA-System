import React from "react";
import { cn } from "@/lib/utils/cn";
import { LoadingIcon } from "@/components/ui/loading-icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center whitespace-nowrap font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer rounded-md text-sm active:scale-[0.985] shrink-0";

    const variants = {
      primary:
        "bg-slate-900 text-white hover:bg-slate-800 shadow-xs active:bg-slate-950 dark:bg-indigo-600 dark:text-white dark:hover:bg-indigo-500 dark:active:bg-indigo-700 dark:border dark:border-indigo-400/30",
      secondary:
        "bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:active:bg-zinc-600 border border-slate-200/80 dark:border-zinc-700/80",
      outline:
        "border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 active:bg-slate-100 dark:active:bg-zinc-600",
      ghost:
        "text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white",
      destructive:
        "bg-rose-600 text-white hover:bg-rose-700 shadow-xs active:bg-rose-800 dark:bg-rose-600 dark:hover:bg-rose-700",
    };

    const sizes = {
      sm: "h-8 px-2.5 text-xs gap-1.5",
      md: "h-9 px-3.5 text-sm gap-2",
      lg: "h-11 px-5 text-base gap-2.5",
      icon: "h-9 w-9 p-0 shrink-0",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {loading ? (
          <LoadingIcon className="mr-1.5 size-3.5 shrink-0" />
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
