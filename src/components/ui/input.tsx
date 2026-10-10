import React from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          ref={ref}
          className={cn(
            "flex h-9 w-full rounded-md border border-neutral-300 dark:border-neutral-700/80 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 dark:focus-visible:ring-neutral-400 focus-visible:border-neutral-900 dark:focus-visible:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
            error && "border-rose-500 dark:border-rose-500 focus-visible:ring-rose-500",
            className
          )}
          {...props}
        />
        {error ? (
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";
