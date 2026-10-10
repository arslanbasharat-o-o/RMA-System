import React from "react";
import { cn } from "@/lib/utils/cn";
import { ChevronDown } from "lucide-react";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  helperText?: string;
  wrapperClassName?: string;
  selectSize?: "sm" | "md" | "lg";
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      wrapperClassName,
      children,
      error,
      helperText,
      disabled,
      selectSize = "md",
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: "h-8 text-xs pl-2.5 pr-8 py-1",
      md: "h-9 text-xs pl-3 pr-9 py-1.5",
      lg: "h-10 text-sm pl-3.5 pr-10 py-2",
    }[selectSize];

    return (
      <div className={cn("relative w-full group", wrapperClassName)}>
        <div className="relative">
          <select
            ref={ref}
            disabled={disabled}
            className={cn(
              "w-full appearance-none rounded-lg cursor-pointer transition-all duration-150 font-medium",
              "border border-neutral-200/90 dark:border-neutral-800",
              "bg-white dark:bg-[#121215]",
              "text-neutral-900 dark:text-neutral-100",
              "hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30",
              "focus:outline-none focus:ring-2 focus:ring-neutral-900/10 dark:focus:ring-neutral-100/15 focus:border-neutral-900 dark:focus:border-neutral-100",
              "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-neutral-100 dark:disabled:bg-neutral-800/50",
              "shadow-xs",
              sizeClasses,
              error &&
                "border-rose-500 dark:border-rose-500 focus:ring-rose-500/20 focus:border-rose-500",
              className
            )}
            {...props}
          >
            {children}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center text-neutral-400 group-hover:text-neutral-600 dark:text-neutral-500 dark:group-hover:text-neutral-300 transition-colors">
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-150" />
          </div>
        </div>
        {error ? (
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = "Select";
