"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Check,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

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

  const handleAction = async (action: string) => {
    if (!currentItem) return;
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
      setActionLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Sequential Review Queue
            </h1>
          </div>

          <Badge variant="outline" className="font-mono">
            <AnimatedNumber value={queue.length} /> displays pending review
          </Badge>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        ) : queue.length > 0 && currentItem ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentItem.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
            {/* Visual Display Left Card */}
            <Card className="overflow-hidden flex flex-col">
              <div className="relative aspect-4/3 bg-neutral-900 flex items-center justify-center border-b border-neutral-200 dark:border-neutral-800">
                <img
                  src={`/api/images/${currentItem.primaryImageId || currentItem.id}?size=preview`}
                  alt="Review display"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <Badge variant="default" className="bg-black/70 backdrop-blur-md text-white border-0">
                    Display #{currentItem.itemNumber}
                  </Badge>
                </div>
              </div>

              <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div>
                      <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
                        Suggested Model:
                      </span>
                      <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                        {currentItem.predictedDisplayAssembly ||
                          (currentItem.predictedModel
                            ? `${currentItem.predictedManufacturer ? currentItem.predictedManufacturer + " " : ""}${currentItem.predictedModel}`
                            : "Unidentified Model")}
                      </p>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
                        Suggested Vendor:
                      </span>
                      <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                        {currentItem.identifiedVendorName || "Unidentified Vendor"}
                      </p>
                    </div>
                  </div>

                  {currentItem.reviewNotes && (
                    <div className="mt-2 text-xs text-amber-900 dark:text-amber-200 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-2.5 rounded-md flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block text-[11px] uppercase tracking-wider text-amber-950 dark:text-amber-300">
                          Reason for Review:
                        </span>
                        <span className="text-xs leading-relaxed">{currentItem.reviewNotes}</span>
                      </div>
                    </div>
                  )}

                  {currentItem.matchedCodesSummary && (
                    <div className="mt-2 text-xs font-mono text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 p-2 rounded">
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">Matched Codes: </span>
                      {currentItem.matchedCodesSummary}
                    </div>
                  )}

                  <div className="mt-2.5 p-2.5 rounded bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-xs font-mono text-neutral-600 dark:text-neutral-400">
                    <span className="font-semibold block text-neutral-800 dark:text-neutral-200 mb-0.5">
                      Extracted Text / Markings:
                    </span>
                    {currentItem.extractedTextSummary || "No markings detected"}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                  <span>Item {currentIndex + 1} of {queue.length}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={currentIndex === 0}
                      onClick={() => setCurrentIndex((prev) => prev - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={currentIndex >= queue.length - 1}
                      onClick={() => setCurrentIndex((prev) => prev + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Action Decision Right Card */}
            <Card className="flex flex-col justify-between">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Verification Decision
                </CardTitle>
              </CardHeader>

              <CardContent className="p-5 pt-0 space-y-4 flex-1">
                {/* 1. Quick Accept */}
                <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-xs text-emerald-950 dark:text-emerald-200 block">
                      Accept Suggested Match
                    </span>
                    <span className="text-[11px] text-emerald-800 dark:text-emerald-300">
                      Confirm {currentItem.predictedModel || "current record"} as verified.
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={actionLoading}
                    onClick={() => handleAction("accept_suggestion")}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-600 dark:text-white shrink-0"
                  >
                    <Check className="h-4 w-4 mr-1 shrink-0" />
                    <span>Accept (Y)</span>
                  </Button>
                </div>

                {/* 2. Manual Model Override */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Or Select Correct Display Model:
                  </label>
                  <Select
                    value={selectedCatalogId}
                    onChange={(e) => setSelectedCatalogId(e.target.value)}
                  >
                    <option value="">-- Choose from Catalog --</option>
                    {catalogs.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.manufacturer} {cat.modelName}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* 3. Manual Vendor Override */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Or Select Correct Vendor:
                  </label>
                  <Select
                    value={selectedVendorId}
                    onChange={(e) => setSelectedVendorId(e.target.value)}
                  >
                    <option value="">-- Choose Vendor --</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* Action buttons */}
                <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex flex-col gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={actionLoading}
                    disabled={!selectedCatalogId && !selectedVendorId}
                    onClick={() => handleAction("manual_verify")}
                  >
                    Save Selected Override
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleAction("mark_unknown")}
                    >
                      <HelpCircle className="h-3.5 w-3.5 mr-1" />
                      <span>Mark Unknown</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentIndex((prev) => (prev + 1) % queue.length)}
                    >
                      <span>Skip For Now</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
        ) : (
          <Card>
            <CardContent className="p-12 text-center space-y-3">
              <Check className="h-10 w-10 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Review Queue Empty
              </h3>
              <Link href="/dashboard">
                <Button size="sm" variant="outline" className="mt-2">
                  Return to Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
