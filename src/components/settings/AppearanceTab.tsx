"use client";

import { CardSpotlight } from "@/components/premium";
import { useTheme, Theme } from "@/components/theme/ThemeProvider";
import { useMotionPreference } from "@/components/motion/MotionProvider";
import { Sun, Moon, Laptop, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function AppearanceTab() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { reducedMotion, setReducedMotion } = useMotionPreference();

  const options: { id: Theme; title: string; icon: React.ElementType }[] = [
    {
      id: "light",
      title: "Light",
      icon: Sun,
    },
    {
      id: "dark",
      title: "Dark",
      icon: Moon,
    },
    {
      id: "system",
      title: "System",
      icon: Laptop,
    },
  ];

  return (
    <div className="space-y-6">
      <CardSpotlight className="p-5 sm:p-6 border-slate-200/90 dark:border-zinc-800 bg-white/95 dark:bg-[#121215]/95">
        <div className="pb-3 mb-4 border-b border-slate-200/80 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Interface Theme
          </h2>
        </div>
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
                      ? "border-indigo-600 dark:border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/40 dark:bg-indigo-950/30"
                      : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-white dark:bg-[#121215]"
                  )}
                >
                  <div className="flex items-center justify-between w-full mb-3">
                    <div
                      className={cn(
                        "p-2 rounded-lg",
                        isSelected
                          ? "bg-indigo-600 text-white dark:bg-indigo-600 dark:text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    )}
                  </div>

                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {opt.title}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 p-4 rounded-lg bg-slate-50 dark:bg-zinc-900/50 border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
                Active Theme
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Resolved: <strong className="capitalize text-slate-800 dark:text-slate-200">{resolvedTheme}</strong>
              </span>
            </div>
          </div>
      </CardSpotlight>

      <CardSpotlight className="p-5 sm:p-6 border-slate-200/90 dark:border-zinc-800 bg-white/95 dark:bg-[#121215]/95">
        <div className="pb-3 mb-4 border-b border-slate-200/80 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Motion Preferences
          </h2>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/30">
          <div>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 block">
              Reduced Motion
            </span>
          </div>
          <button
            type="button"
            onClick={() => setReducedMotion(!reducedMotion)}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer self-start sm:self-auto border",
              reducedMotion
                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                : "bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700"
            )}
          >
            {reducedMotion ? "Reduced Motion Active" : "Full Motion Active"}
          </button>
        </div>
      </CardSpotlight>
    </div>
  );
}
