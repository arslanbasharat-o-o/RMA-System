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

export default function ReviewQueuePage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);

  // Selection states
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const actionPending = useRef(false);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const [dashRes, catRes, venRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/display-catalog"),
        fetch("/api/vendors"),
      ]);
      if (dashRes.status === 401 || catRes.status === 401 || venRes.status === 401) {
        window.location.assign("/login");
        return;
      }
      const dashJson = await dashRes.json();
      const catJson = await catRes.json();
      const venJson = await venRes.json();

      setQueue(dashJson.reviewItems || []);
      setCatalogs(catJson.catalog || []);
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
          catalogDisplayId: selectedCatalogId || undefined,
          vendorId: selectedVendorId || undefined,
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
      setSelectedCatalogId("");
      setSelectedVendorId("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit review decision");
    } finally {
      actionPending.current = false;
      setActionLoading(false);
    }
  }, [currentItem, queue, currentIndex, selectedCatalogId, selectedVendorId]);

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
                    {currentItem.reviewNotes && (
                      <div className="p-3 rounded-lg border border-amber-300/80 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/30 flex items-start gap-2.5">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="font-semibold block text-[10px] uppercase tracking-wider text-amber-900 dark:text-amber-300">
                            Reason For Review:
                          </span>
                          <span className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
                            {currentItem.reviewNotes}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Matched Codes */}
                    {currentItem.matchedCodesSummary && (
                      <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-zinc-900 border border-neutral-200/60 dark:border-zinc-800 flex items-center justify-between text-xs">
                        <span className="text-neutral-500 font-medium">Matched Codes:</span>
                        <CopyBadge value={currentItem.matchedCodesSummary} />
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
                    <div className="space-y-1.5">
                      <label htmlFor="review-model" className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                        Select Different Model:
                      </label>
                      <Select
                        id="review-model"
                        value={selectedCatalogId}
                        onChange={(e) => setSelectedCatalogId(e.target.value)}
                        className="text-xs h-9"
                      >
                        <option value="">-- Choose from Display Catalog --</option>
                        {catalogs.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.manufacturer} {cat.modelName} ({cat.displayTechnology || "OLED"})
                          </option>
                        ))}
                      </Select>
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
                    disabled={!selectedCatalogId && !selectedVendorId}
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
