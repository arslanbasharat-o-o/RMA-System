"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
      <Card>
        <CardHeader className="p-5 sm:p-6 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-neutral-500" />
            <span>Operational Timezone</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Timestamps on intake batches, audit trails, and exported CSV manifests adhere to this timezone.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 pt-4">
          <form onSubmit={onSave} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                Business Timezone (IANA Format)
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="e.g. UTC, Europe/London"
                  className="font-mono text-xs max-w-md"
                />
                <Button type="submit" variant="primary" loading={saving} size="sm">
                  Save Timezone
                </Button>
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
                      className={`px-2 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
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
        </CardContent>
      </Card>

      {/* System Runtime Overview */}
      <Card>
        <CardHeader className="p-5 sm:p-6 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-neutral-500" />
            <span>Storage & Runtime Environment</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Active infrastructure drivers and persistent storage parameters.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 pt-4">
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
                <span>PostgreSQL (Drizzle ORM Connection Pool)</span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
              <div className="flex items-center gap-2 mb-1">
                <HardDrive className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  Image Storage Driver
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400 mt-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Local Disk Buffer with SHA-256 Deduplication</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
