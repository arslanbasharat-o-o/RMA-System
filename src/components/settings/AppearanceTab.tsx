"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useTheme, Theme } from "@/components/theme/ThemeProvider";
import { useMotionPreference } from "@/components/motion/MotionProvider";
import { Sun, Moon, Laptop, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function AppearanceTab() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { reducedMotion, setReducedMotion } = useMotionPreference();

  const options: { id: Theme; title: string; desc: string; icon: React.ElementType }[] = [
    {
      id: "light",
      title: "Light Mode",
      desc: "Clean high-contrast theme optimized for bright workspaces and intake desks.",
      icon: Sun,
    },
    {
      id: "dark",
      title: "Dark Mode",
      desc: "Deep slate aesthetic reducing eye strain in testing laboratories and inspection booths.",
      icon: Moon,
    },
    {
      id: "system",
      title: "System Preference",
      desc: "Automatically synchronize with your operating system's appearance schedule.",
      icon: Laptop,
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="p-5 sm:p-6 pb-2">
          <CardTitle className="text-base font-semibold">
            Interface Theme & Appearance
          </CardTitle>
          <CardDescription className="text-xs">
            Personalize the visual appearance of the RMA platform. Preferences are saved automatically to your device.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {options.map((opt) => {
              const Icon = opt.icon;
              const isSelected = theme === opt.id;

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  className={cn(
                    "relative flex flex-col items-start p-4 rounded-xl border text-left transition-all cursor-pointer",
                    isSelected
                      ? "border-neutral-900 dark:border-white ring-2 ring-neutral-900/10 dark:ring-white/20 bg-neutral-50/50 dark:bg-neutral-800/40"
                      : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-[#121215]"
                  )}
                >
                  <div className="flex items-center justify-between w-full mb-3">
                    <div
                      className={cn(
                        "p-2 rounded-lg",
                        isSelected
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </div>

                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {opt.title}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 p-4 rounded-lg bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 block">
                Currently Active Palette
              </span>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Resolved theme: <strong className="capitalize">{resolvedTheme}</strong> mode
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-5 sm:p-6 pb-2">
          <CardTitle className="text-base font-semibold">
            Motion & Accessibility Preferences
          </CardTitle>
          <CardDescription className="text-xs">
            Configure system motion physics and transitions. Supports WCAG prefers-reduced-motion accessibility standards.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
            <div>
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 block">
                Reduced Motion Mode
              </span>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 max-w-lg leading-relaxed">
                Replaces spatial translations, spring zooms, and layout animations with instant opacity fades for operators sensitive to motion.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReducedMotion(!reducedMotion)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer self-start sm:self-auto border",
                reducedMotion
                  ? "bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                  : "bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              )}
            >
              {reducedMotion ? "Reduced Motion Active" : "Full Motion Active"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
