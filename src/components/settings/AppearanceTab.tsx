"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
      <Card>
        <CardHeader className="p-5 sm:p-6 pb-2">
          <CardTitle className="text-base font-semibold">
            Theme
          </CardTitle>
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
                </button>
              );
            })}
          </div>

          <div className="mt-6 p-4 rounded-lg bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 block">
                Active Theme
              </span>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Resolved: <strong className="capitalize">{resolvedTheme}</strong>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-5 sm:p-6 pb-2">
          <CardTitle className="text-base font-semibold">
            Motion Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
            <div>
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 block">
                Reduced Motion
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 block">
                Reduces interface movement and transitions.
              </span>
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
