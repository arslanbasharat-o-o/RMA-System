"use client";

import { CardSpotlight, ShimmerButton } from "@/components/premium";
import { Input } from "@/components/ui/input";
import { Clock, Database, HardDrive, CheckCircle2 } from "lucide-react";

interface GeneralTabProps {
  timezone: string;
  setTimezone: (tz: string) => void;
  onSave: (e: React.FormEvent) => void;
  saving: boolean;
}

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Tokyo",
];

export function GeneralTab({ timezone, setTimezone, onSave, saving }: GeneralTabProps) {
  return (
    <div className="space-y-6">
      <CardSpotlight className="p-5 sm:p-6 border-neutral-200/90 dark:border-neutral-800">
        <div className="flex items-center gap-2.5 pb-3 mb-4 border-b border-neutral-100 dark:border-zinc-800">
          <div className="h-8 w-8 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/50 flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Operational Timezone
            </h2>
          </div>
        </div>

        <form onSubmit={onSave} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              Business Timezone
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. UTC, Europe/London"
                className="font-mono text-xs max-w-md h-9"
              />
              <ShimmerButton type="submit" loading={saving} className="h-9 px-4 text-xs font-semibold shrink-0">
                Save Timezone
              </ShimmerButton>
            </div>

            {/* Quick Presets */}
            <div className="pt-2">
              <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block mb-1.5">
                Common Presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_TIMEZONES.map((tz) => (
                  <button
                    key={tz}
                    type="button"
                    onClick={() => setTimezone(tz)}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                      timezone === tz
                        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold"
                        : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    }`}
                  >
                    {tz}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </form>
      </CardSpotlight>

      {/* System Runtime Overview */}
      <CardSpotlight className="p-5 sm:p-6 border-neutral-200/90 dark:border-neutral-800">
        <div className="flex items-center gap-2.5 pb-3 mb-4 border-b border-neutral-100 dark:border-zinc-800">
          <div className="h-8 w-8 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/50 flex items-center justify-center shrink-0">
            <HardDrive className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Storage & Runtime
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-lg border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
            <div className="flex items-center gap-2 mb-1">
              <Database className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                Primary Database
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400 mt-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>PostgreSQL</span>
            </div>
          </div>

          <div className="p-3.5 rounded-lg border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
            <div className="flex items-center gap-2 mb-1">
              <HardDrive className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                Image Storage
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400 mt-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Local Filesystem</span>
            </div>
          </div>
        </div>
      </CardSpotlight>
    </div>
  );
}
