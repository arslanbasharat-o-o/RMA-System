"use client";

import React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface DataTableToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  statusOptions: { label: string; value: string; count?: number }[];
  placeholder?: string;
  className?: string;
}

/**
 * DataTableToolbar component inspired by Dice UI (@diceui).
 * Faceted filter bar with search input, active filter chips, and count badges.
 */
export function DataTableToolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  placeholder = "Search RMA number or customer...",
  className,
}: DataTableToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-slate-50/70 dark:bg-zinc-900/50 border-b border-slate-200/80 dark:border-zinc-800",
        className
      )}
    >
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-8 pl-8 pr-7 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 dark:focus:ring-indigo-400/50 transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Status Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
        {statusOptions.map((opt) => {
          const isActive = statusFilter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onStatusFilterChange(opt.value)}
              className={cn(
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium transition-all select-none cursor-pointer shrink-0 border",
                isActive
                  ? "bg-slate-900 text-white border-slate-900 dark:bg-indigo-600 dark:text-white dark:border-indigo-500 shadow-2xs font-semibold"
                  : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700/60"
              )}
            >
              <span>{opt.label}</span>
              {typeof opt.count === "number" && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-mono font-normal shrink-0 whitespace-nowrap leading-none",
                    isActive
                      ? "bg-slate-800 text-slate-200 dark:bg-indigo-700 dark:text-white"
                      : "bg-slate-100 text-slate-500 dark:bg-zinc-700 dark:text-zinc-300"
                  )}
                >
                  {opt.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
