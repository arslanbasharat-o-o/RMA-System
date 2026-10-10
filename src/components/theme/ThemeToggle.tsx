"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon, Laptop } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils/cn";

export interface ThemeToggleProps {
  className?: string;
  variant?: "icon" | "segmented";
}

export function ThemeToggle({ className, variant = "icon" }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "w-8 h-8 rounded-md bg-neutral-100 dark:bg-neutral-800 animate-pulse",
          className
        )}
      />
    );
  }

  if (variant === "segmented") {
    return (
      <div
        className={cn(
          "inline-flex p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/60",
          className
        )}
        role="group"
        aria-label="Color theme selector"
      >
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer",
            theme === "light"
              ? "bg-white text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white"
              : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          )}
        >
          <Sun className="h-3.5 w-3.5" />
          <span>Light</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer",
            theme === "dark"
              ? "bg-white text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white"
              : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          )}
        >
          <Moon className="h-3.5 w-3.5" />
          <span>Dark</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme("system")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer",
            theme === "system"
              ? "bg-white text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white"
              : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          )}
        >
          <Laptop className="h-3.5 w-3.5" />
          <span>System</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "relative p-2 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-800 transition-colors cursor-pointer",
        className
      )}
      title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
      aria-label={`Toggle theme (currently ${resolvedTheme})`}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4 text-amber-400 transition-transform hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 text-neutral-600 transition-transform hover:-rotate-12" />
      )}
    </button>
  );
}
