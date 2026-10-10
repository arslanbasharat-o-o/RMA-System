"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  AlertTriangle,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { duration, easing } from "@/lib/motion/tokens";

export type RecognitionStatus =
  | "queued"
  | "pending"
  | "processing"
  | "analyzing"
  | "suggested_match"
  | "candidate_found"
  | "verified"
  | "exact_match"
  | "review_required"
  | "needs_review"
  | "failed"
  | "unknown";

interface StatusTransitionProps {
  status: string;
  className?: string;
  showIcon?: boolean;
}

export function StatusTransition({
  status,
  className = "",
  showIcon = true,
}: StatusTransitionProps) {
  const normalized = (status || "queued").toLowerCase().replace(/ /g, "_");

  const getStatusConfig = () => {
    switch (normalized) {
      case "completed":
        return {
          label: "Completed",
          bg: "bg-emerald-50 dark:bg-emerald-950/40",
          text: "text-emerald-700 dark:text-emerald-300",
          border: "border-emerald-200/80 dark:border-emerald-800/50",
          icon: CheckCircle2,
          pulse: false,
        };
      case "verified":
      case "exact_match":
      case "manually_verified":
        return {
          label: "Verified",
          bg: "bg-emerald-50 dark:bg-emerald-950/40",
          text: "text-emerald-700 dark:text-emerald-300",
          border: "border-emerald-200/80 dark:border-emerald-800/50",
          icon: CheckCircle2,
          pulse: false,
        };
      case "receiving":
        return {
          label: "Receiving",
          bg: "bg-blue-50 dark:bg-blue-950/40",
          text: "text-blue-700 dark:text-blue-300",
          border: "border-blue-200/80 dark:border-blue-800/50",
          icon: Clock,
          pulse: false,
        };
      case "pending_upload":
        return {
          label: "Pending Upload",
          bg: "bg-amber-50 dark:bg-amber-950/40",
          text: "text-amber-700 dark:text-amber-300",
          border: "border-amber-200/80 dark:border-amber-800/50",
          icon: Clock,
          pulse: false,
        };
      case "uploaded":
        return {
          label: "Uploaded",
          bg: "bg-neutral-100 dark:bg-neutral-800",
          text: "text-neutral-700 dark:text-neutral-300",
          border: "border-neutral-200 dark:border-neutral-700",
          icon: CheckCircle2,
          pulse: false,
        };
      case "draft":
        return {
          label: "Draft",
          bg: "bg-neutral-100 dark:bg-neutral-800",
          text: "text-neutral-600 dark:text-neutral-400",
          border: "border-neutral-200 dark:border-neutral-700",
          icon: Clock,
          pulse: false,
        };
      case "archived":
        return {
          label: "Archived",
          bg: "bg-neutral-100 dark:bg-neutral-800",
          text: "text-neutral-500 dark:text-neutral-400",
          border: "border-neutral-200 dark:border-neutral-700",
          icon: Clock,
          pulse: false,
        };
      case "processing":
      case "analyzing":
      case "reading_markings":
        return {
          label: "Processing",
          bg: "bg-blue-50 dark:bg-blue-950/40",
          text: "text-blue-700 dark:text-blue-300",
          border: "border-blue-200/80 dark:border-blue-800/50",
          icon: Loader2,
          pulse: true,
        };
      case "suggested_match":
      case "candidate_found":
        return {
          label: "Candidate Found",
          bg: "bg-indigo-50 dark:bg-indigo-950/40",
          text: "text-indigo-700 dark:text-indigo-300",
          border: "border-indigo-200/80 dark:border-indigo-800/50",
          icon: HelpCircle,
          pulse: false,
        };
      case "review_required":
      case "needs_review":
        return {
          label: "Review Required",
          bg: "bg-amber-50 dark:bg-amber-950/40",
          text: "text-amber-700 dark:text-amber-300",
          border: "border-amber-200/80 dark:border-amber-800/50",
          icon: AlertTriangle,
          pulse: false,
        };
      case "failed":
        return {
          label: "Failed",
          bg: "bg-rose-50 dark:bg-rose-950/40",
          text: "text-rose-700 dark:text-rose-300",
          border: "border-rose-200/80 dark:border-rose-800/50",
          icon: XCircle,
          pulse: false,
        };
      case "unknown":
        return {
          label: "Unknown",
          bg: "bg-neutral-100 dark:bg-neutral-800",
          text: "text-neutral-700 dark:text-neutral-300",
          border: "border-neutral-200 dark:border-neutral-700",
          icon: HelpCircle,
          pulse: false,
        };
      case "queued":
      case "pending":
      default:
        return {
          label: "Queued",
          bg: "bg-neutral-100 dark:bg-neutral-800",
          text: "text-neutral-600 dark:text-neutral-400",
          border: "border-neutral-200 dark:border-neutral-700",
          icon: Clock,
          pulse: false,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={normalized}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: duration.fast, ease: easing.smoothOut }}
        data-status={status}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border} ${className}`}
      >
        {showIcon && (
          <Icon
            className={`h-3.5 w-3.5 ${
              config.pulse ? "animate-spin" : ""
            }`}
          />
        )}
        <span>{config.label}</span>
        <span className="sr-only">{status}</span>
      </motion.span>
    </AnimatePresence>
  );
}
