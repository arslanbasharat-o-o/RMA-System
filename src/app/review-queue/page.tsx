"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Check,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { LoadingMessage } from "@/components/ui/loading-message";
import { BlurIn } from "@/components/ui/blur-in";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  CardSpotlight,
  StatusText,
  CopyBadge,
} from "@/components/premium";

function parseReviewNotes(rawNotes?: string | null): string[] {
  if (!rawNotes || !rawNotes.trim()) return [];
  const parts = rawNotes.split(/\s*\|\s*|\n+/).map((p) => p.trim()).filter(Boolean);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    // Filter internal debug logs and developer noise
    if (/Evaluated \d+ tokens against \d+ active rules/i.test(part)) continue;
    if (/Display model could not be verified in internal catalog/i.test(part)) continue;
    if (/No OCR text tokens provided for matching/i.test(part)) continue;
    if (/Top matched rule pointed to missing vendor/i.test(part)) continue;
    let cleaned = part;
    if (/Automated recognition conflicts with the retained operator correction/i.test(part)) {
      cleaned = "Automated recognition conflicts with the retained operator correction.";
    }

    // Operator retention pattern
    const mOp = part.match(/Model retained from operator correction:\s*([^.]+?)(?:\s*\((?:Automated suggestion|automated suggestion):\s*([^)]+)\)|\.\s*Automated suggestion:\s*([^.]+))/i);
    if (mOp) {
      const retainedModel = mOp[1].trim();
      const autoSuggestion = (mOp[2] || mOp[3] || "unresolved").trim();
      cleaned = `Operator confirmed ${retainedModel} (differs from automated detection: ${autoSuggestion})`;
    }

    // Visual decision pattern
    const mVis = part.match(/Visual identification decision:\s*([^(\n]+)(?:\(([^)]+)\))?/i);
    if (mVis) {
      const model = mVis[1].trim();
      let reasoning = (mVis[2] || "").trim();
      reasoning = reasoning
        .replace(/Operator review is required\.?/gi, "")
        .replace(/The photograph did not corroborate the exact model suggested by source evidence\.?/gi, "")
        .trim();
      cleaned = reasoning ? `Detected: ${model} — ${reasoning}` : `Detected: ${model}`;
    }

    // Visual conflict pattern
    if (/Visual matches conflict/i.test(part)) {
      cleaned = "Visual search candidates conflict across multiple models.";
    }

    // Strip repetitive tailing boilerplate
    cleaned = cleaned
      .replace(/Retained for (?:human )?operator review\.?/gi, "")
      .replace(/Operator review is required\.?/gi, "")
      .replace(/Review the new evidence before accepting it\.?/gi, "")
      .trim();

    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
  }

  return result;
}

export default function ReviewQueuePage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);

  // Selection states
  const [customManufacturer, setCustomManufacturer] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const actionPending = useRef(false);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const [dashRes, venRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/vendors"),
      ]);
      if (dashRes.status === 401 || venRes.status === 401) {
        window.location.assign("/login");
        return;
      }
      const dashJson = await dashRes.json();
      const venJson = await venRes.json();

      setQueue(dashJson.reviewItems || []);
      setVendors(venJson.vendors || []);
      setCurrentIndex(0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const currentItem = queue[currentIndex];

  useEffect(() => {
    if (currentItem) {
      setCustomManufacturer(currentItem.predictedManufacturer || "");
      setCustomModel(currentItem.predictedModel || "");
      setSelectedVendorId(currentItem.identifiedVendorId || "");
    }
  }, [currentItem?.id]);

  const handleAction = useCallback(async (action: string) => {
    if (!currentItem || actionPending.current) return;
    actionPending.current = true;
    setActionLoading(true);

    try {
      const res = await fetch(`/api/rma-items/${currentItem.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          predictedManufacturer: customManufacturer || currentItem.predictedManufacturer || null,
          predictedModel: customModel || currentItem.predictedModel || null,
          vendorId: selectedVendorId || null,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to submit review decision");
      }

      toast.success("Decision recorded.");
      // Remove current from queue and advance
      const nextQueue = queue.filter((_, idx) => idx !== currentIndex);
      setQueue(nextQueue);
      if (currentIndex >= nextQueue.length && nextQueue.length > 0) {
        setCurrentIndex(nextQueue.length - 1);
      }
      setCustomManufacturer("");
      setCustomModel("");
      setSelectedVendorId("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit review decision");
    } finally {
      actionPending.current = false;
      setActionLoading(false);
    }
  }, [currentItem, queue, currentIndex, customManufacturer, customModel, selectedVendorId]);

  // Keyboard shortcut listener (Y to accept, U for unknown, S to skip, arrows to navigate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in a select or input
      const target = e.target as HTMLElement | null;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || actionLoading || target?.closest('input, select, textarea, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="option"]')) {
        return;
      }
      if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        handleAction("accept_suggestion");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (currentIndex < queue.length - 1) setCurrentIndex((i) => i + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (currentIndex > 0) setCurrentIndex((i) => i - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleAction, currentIndex, queue.length, actionLoading]);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-neutral-200/80 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <BlurIn
              word="Review Queue"
              duration={0.24}
              className="text-left text-xl sm:text-2xl md:text-2xl md:leading-8 font-bold tracking-tight text-neutral-900 dark:text-neutral-50"
            />
            <StatusText variant={queue.length > 0 ? "warning" : "success"}>
              {queue.length > 0 ? `${queue.length} pending` : "Queue clear"}
            </StatusText>
          </div>
        </div>

        {loading ? (
          <LoadingMessage label="Loading review items…" className="justify-center py-12" />
        ) : queue.length > 0 && currentItem ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentItem.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="grid grid-cols-1 md:grid-cols-12 gap-6"
            >
              {/* Left Column: Visual Display Evidence (7 cols) */}
              <CardSpotlight
                className="md:col-span-7 p-0 overflow-hidden flex flex-col justify-between relative border-slate-200/90 dark:border-zinc-800 bg-white/95 dark:bg-[#121215]/95 shadow-md"
                spotlightColor="rgba(255, 255, 255, 0.04)"
              >
                <div>
                  {/* Image Preview Container */}
                  <div className="relative aspect-4/3 sm:aspect-16/10 bg-black flex items-center justify-center border-b border-slate-200 dark:border-zinc-800 overflow-hidden group">
                    <img
                      src={`/api/images/${currentItem.primaryImageId || currentItem.id}?size=preview`}
                      alt="Review display flex cable"
                      className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />

                    {/* Overlay Badges */}
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-zinc-950/80 backdrop-blur-md text-white border border-white/10 shadow-sm">
                        Display #{currentItem.itemNumber}
                      </span>
                    </div>

                    <div className="absolute top-3 right-3 flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold bg-indigo-600/90 text-white backdrop-blur-md flex items-center gap-1.5 shadow-xs border border-indigo-400/30">
                        <Sparkles className="h-3 w-3" />
                        Scanned Stamp
                      </span>
                    </div>
                  </div>

                  {/* Recognition Metadata */}
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3 pb-3 border-b border-neutral-100 dark:border-zinc-800">
                      <div>
                        <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider block mb-1">
                          Identified Model:
                        </span>
                        <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate">
                          {currentItem.predictedDisplayAssembly ||
                            (currentItem.predictedModel
                              ? `${currentItem.predictedManufacturer ? currentItem.predictedManufacturer + " " : ""}${currentItem.predictedModel}`
                              : "Unidentified Model")}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider block mb-1">
                          Supplier Attribution:
                        </span>
                        <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate">
                          {currentItem.identifiedVendorName || "Unidentified Vendor"}
                        </p>
                      </div>
                    </div>

                    {/* Review Reason Alert */}
                    {currentItem.reviewNotes && (() => {
                      const notes = parseReviewNotes(currentItem.reviewNotes);
                      if (!notes.length) return null;
                      return (
                        <div className="p-3.5 rounded-xl border border-amber-300/80 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/30 flex items-start gap-3">
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold block text-[10px] uppercase tracking-wider text-amber-900 dark:text-amber-300 mb-1">
                              Reason For Review
                            </span>
                            {notes.length === 1 ? (
                              <p className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed font-medium">
                                {notes[0]}
                              </p>
                            ) : (
                              <ul className="space-y-1.5 text-xs text-amber-950 dark:text-amber-200">
                                {notes.map((note, idx) => (
                                  <li key={idx} className="flex items-start gap-2 leading-relaxed">
                                    <span className="text-amber-500 font-bold leading-none mt-1">•</span>
                                    <span>{note}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Matched Codes */}
                    {currentItem.matchedCodesSummary && (
                      <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-zinc-900 border border-neutral-200/60 dark:border-zinc-800 flex items-center justify-between text-xs">
                        <span className="text-neutral-500 font-medium">Matched Codes:</span>
                        <CopyBadge value={currentItem.matchedCodesSummary} />
                      </div>
                    )}
                    {currentItem.inventoryMatchEvidence && (
                      <div className="p-3 rounded-lg bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-900/70 text-xs text-sky-900 dark:text-sky-200 space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider block">
                          Seeded Reference Comparison
                        </span>
                        {typeof currentItem.inventoryMatchConfidence === "number" && (
                          <p>Confidence: {Math.round(currentItem.inventoryMatchConfidence * 100)}%</p>
                        )}
                        {currentItem.inventoryMatchEvidence.matchingCues?.length > 0 && (
                          <p>Matching cues: {currentItem.inventoryMatchEvidence.matchingCues.join("; ")}</p>
                        )}
                        {currentItem.inventoryMatchEvidence.conflictingCues?.length > 0 && (
                          <p>Conflicting cues: {currentItem.inventoryMatchEvidence.conflictingCues.join("; ")}</p>
                        )}
                        {currentItem.inventoryMatchEvidence.unresolvedAlternatives?.length > 0 && (
                          <p>Unresolved alternatives: {currentItem.inventoryMatchEvidence.unresolvedAlternatives.join("; ")}</p>
                        )}
                      </div>
                    )}

                    {/* Extracted Markings */}
                    <div className="p-3 rounded-lg bg-neutral-50/80 dark:bg-zinc-900/60 border border-neutral-200/60 dark:border-zinc-800 text-xs font-mono text-neutral-600 dark:text-neutral-400 space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block">
                        Extracted Markings:
                      </span>
                      <p className="text-neutral-800 dark:text-neutral-200 font-mono text-xs break-all">
                        {currentItem.extractedTextSummary || "No markings detected"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Carousel Pagination Footer */}
                <div className="p-4 bg-neutral-50/70 dark:bg-zinc-900/50 border-t border-neutral-100 dark:border-zinc-800 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="font-mono">
                    Screen <strong>{currentIndex + 1}</strong> of {queue.length}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentIndex === 0}
                      onClick={() => setCurrentIndex((prev) => prev - 1)}
                      className="h-7 px-2.5 text-xs"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
                      <span>Prev</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentIndex >= queue.length - 1}
                      onClick={() => setCurrentIndex((prev) => prev + 1)}
                      className="h-7 px-2.5 text-xs"
                    >
                      <span>Next</span>
                      <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                    </Button>
                  </div>
                </div>
              </CardSpotlight>

              {/* Right Column: Verification Decision Panel (5 cols) */}
              <CardSpotlight
                className="md:col-span-5 p-5 sm:p-6 flex flex-col justify-between border-slate-200/90 dark:border-zinc-800 bg-white/95 dark:bg-[#121215]/95 shadow-md"
                spotlightColor="rgba(255, 255, 255, 0.04)"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200/80 dark:border-zinc-800">
                    <span className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                      Review & Confirmation
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Shortcuts: [Y] Approve
                    </span>
                  </div>

                  <div className="space-y-4">
                    {/* Primary Accept Action */}
                    <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent space-y-3">
                      <div>
                        <span className="font-bold text-xs text-emerald-950 dark:text-emerald-200 block">
                          Approve Model Match
                        </span>
                      </div>

                      <Button
                        variant="primary"
                        size="md"
                        loading={actionLoading}
                        onClick={() => handleAction("accept_suggestion")}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-600 dark:text-white font-semibold text-xs justify-center shadow-xs cursor-pointer"
                      >
                        <Check className="h-4 w-4 mr-1.5 shrink-0" />
                        <span>Approve Match (Press Y)</span>
                      </Button>
                    </div>

                    {/* Manual Model Override */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                            Manufacturer:
                          </label>
                          <input
                            type="text"
                            value={customManufacturer}
                            onChange={(e) => setCustomManufacturer(e.target.value)}
                            placeholder="e.g. Samsung"
                            className="w-full text-xs h-9 px-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                            Verified Model:
                          </label>
                          <input
                            type="text"
                            value={customModel}
                            onChange={(e) => setCustomModel(e.target.value)}
                            placeholder="e.g. Galaxy Note 20 Ultra"
                            className="w-full text-xs h-9 px-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-semibold"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Manual Vendor Override */}
                    <div className="space-y-1.5">
                      <label htmlFor="review-vendor" className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                        Select Different Supplier:
                      </label>
                      <Select
                        id="review-vendor"
                        value={selectedVendorId}
                        onChange={(e) => setSelectedVendorId(e.target.value)}
                        className="text-xs h-9"
                      >
                        <option value="">-- Choose Supplier --</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Secondary Actions */}
                <div className="pt-5 border-t border-neutral-100 dark:border-zinc-800 space-y-2 mt-4">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={actionLoading}
                    disabled={!customManufacturer && !customModel && !selectedVendorId}
                    onClick={() => handleAction("manual_verify")}
                    className="w-full text-xs font-medium"
                  >
                    Save Changes
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => handleAction("mark_unknown")}
                    >
                      <HelpCircle className="h-3.5 w-3.5 mr-1 text-neutral-400" />
                      <span>Mark Unknown</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setCurrentIndex((prev) => (prev + 1) % queue.length)}
                    >
                      <span>Skip</span>
                    </Button>
                  </div>
                </div>
              </CardSpotlight>
            </motion.div>
          </AnimatePresence>
        ) : (
          <CardSpotlight className="p-12 text-center space-y-4 border-dashed border-2 border-neutral-200 dark:border-zinc-800">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Review Queue Clear
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm mx-auto">
                All captured screens have been identified and confirmed. Return to the dashboard or intake a new RMA.
              </p>
            </div>
            <Link href="/dashboard" className="inline-block">
              <Button size="sm" variant="outline" className="text-xs font-medium">
                Return to Dashboard &rarr;
              </Button>
            </Link>
          </CardSpotlight>
        )}
      </div>
    </AppShell>
  );
}
