"use client";

import React, { useState, use, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { AppShell } from "@/components/layout/AppShell";
import { ItemReviewDrawer } from "@/components/rma/ItemReviewDrawer";
import {
  Camera,
  Download,
  RotateCcw,
  Eye,
  Check,
  ArrowLeft,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/loading-message";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { toast } from "sonner";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
import { hasModelSuggestion } from "@/lib/model-result";
import {
  CardSpotlight,
  CopyBadge,
  StatusText,
  ShimmerButton,
} from "@/components/premium";

function formatItemStatus(status: string) {
  switch (status) {
    case "verified":
      return "Verified";
    case "review_required":
      return "Needs Review";
    case "processing":
      return "Processing";
    case "queued":
      return "Queued";
    case "completed":
      return "Completed";
    default:
      return status ? status.replace(/_/g, " ") : "Unknown";
  }
}

function modelResultText(item: any) {
  return item.predictedDisplayAssembly ||
    (item.predictedModel
      ? `${item.predictedManufacturer ? `${item.predictedManufacturer} ` : ""}${item.predictedModel}`
      : "Unidentified Model");
}

function modelResultLabel(item: any) {
  if (item.status === "verified" && item.verifiedAt) return "Verified";
  return hasModelSuggestion(item) ? "Suggestion" : "Unidentified";
}

export default function RmaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rmaId } = use(params);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [inspectingItemId, setInspectingItemId] = useState<string | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  useEffect(() => {
    setData(null);
    setLoading(true);
    setSelectedItemIds([]);
    setInspectingItemId(null);
  }, [rmaId]);

  const { refreshNow: fetchRmaData, refreshError } = useLiveRefresh(rmaId, async (signal) => {
    const res = await fetch(`/api/rmas/${rmaId}`, { cache: "no-store", signal });
    if (res.status === 401) {
      window.location.assign("/login");
      return false;
    }
    if (!res.ok) throw new Error("Could not refresh this RMA.");
    const json = await res.json();
    if (signal.aborted) return;
    setData(json);
    setLoading(false);
    return json.stats?.processing > 0;
  });

  const { rma, items = [], stats = {} } = data || {};

  useEffect(() => {
    if (rma?.rmaNumber) {
      document.title = `${rma.rmaNumber} | RMA Operations`;
    }
  }, [rma?.rmaNumber]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItemIds(items.map((i: any) => i.id));
    } else {
      setSelectedItemIds([]);
    }
  };

  const handleToggleSelect = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleBulkConfirm = async () => {
    if (selectedItemIds.length === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch(`/api/rmas/${rmaId}/bulk-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_confirm",
          itemIds: selectedItemIds,
        }),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error);

      toast.success(resJson.message);
      setSelectedItemIds([]);
      fetchRmaData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Bulk confirm failed");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkReprocess = async () => {
    if (selectedItemIds.length === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch(`/api/rmas/${rmaId}/bulk-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_reprocess",
          itemIds: selectedItemIds,
        }),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error);

      toast.success(resJson.message);
      setSelectedItemIds([]);
      fetchRmaData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Bulk reprocess failed");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleMarkComplete = async () => {
    try {
      const res = await fetch(`/api/rmas/${rmaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error);

      toast.success("RMA marked as completed!");
      fetchRmaData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Cannot complete RMA");
    }
  };

  if (!data && refreshError) {
    return (
      <AppShell>
        <div role="alert" className="space-y-3 p-4">
          <p>Could not load this RMA. Check your connection and try again.</p>
          <Button onClick={fetchRmaData}>Try again</Button>
        </div>
      </AppShell>
    );
  }

  if (loading && !data) {
    return <PageLoading label="Loading RMA details…" />;
  }

  const rmaShipmentStatus =
    rma?.status === "completed"
      ? "completed"
      : rma?.status === "archived"
      ? "archived"
      : rma?.status === "draft"
      ? "draft"
      : "receiving";

  return (
    <AppShell>
      <div className="space-y-6">
        {refreshError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Connection interrupted. Retrying live updates automatically…</span>
          </div>
        )}

        {/* Breadcrumb & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Link
            href="/rmas"
            className="inline-flex items-center text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors self-start py-0.5"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            <span>All RMAs</span>
          </Link>

          <div className="flex items-center gap-2 flex-wrap sm:justify-end">
            <Link href={`/rmas/${rmaId}/capture`} className="flex-1 sm:flex-none">
              <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs h-8.5 font-medium">
                <Camera className="h-3.5 w-3.5 shrink-0" />
                <span>Scan Screens</span>
              </Button>
            </Link>

            <a href={`/api/rmas/${rmaId}/export`} className="flex-1 sm:flex-none">
              <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs h-8.5 font-medium">
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span>Export CSV</span>
              </Button>
            </a>

            {rma?.status !== "completed" && (
              <ShimmerButton
                onClick={handleMarkComplete}
                className="w-full sm:w-auto h-8.5 px-3.5 text-xs font-semibold gap-1.5"
              >
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>Mark Completed</span>
              </ShimmerButton>
            )}
          </div>
        </div>

        {/* RMA Summary Card with CardSpotlight */}
        <CardSpotlight className="p-5 sm:p-6 relative border-slate-200/90 dark:border-zinc-800 bg-white/95 dark:bg-[#121215]/95 shadow-md">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1><CopyBadge value={rma?.rmaNumber || ""} className="text-base sm:text-lg font-bold py-1 px-3" /></h1>
                <StatusText
                  variant={
                    rmaShipmentStatus === "completed"
                      ? "success"
                      : rmaShipmentStatus === "draft"
                      ? "neutral"
                      : "info"
                  }
                  showIcon={false}
                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 font-semibold"
                >
                  Shipment: {rmaShipmentStatus.charAt(0).toUpperCase() + rmaShipmentStatus.slice(1)}
                </StatusText>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                Customer:{" "}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {rma?.customerName}
                </span>{" "}
                · Reason:{" "}
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {rma?.returnReasonLabel || "Standard Return"}
                </span>
                {rma?.trackingNumber ? (
                  <>
                    {" "}
                    · Tracking: <span className="font-mono">{rma.trackingNumber}</span>
                  </>
                ) : (
                  ""
                )}
              </p>
            </div>

            {/* Metric Summary Bar (Enterprise Shadcn / Linear style) */}
            <div className="flex items-center gap-2 sm:gap-4 p-2 sm:px-3 sm:py-2 rounded-lg border border-slate-200/90 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/40 text-xs">
              <div className="flex-1 sm:flex-none text-center sm:text-left px-1.5">
                <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-zinc-400 tracking-wider block">
                  Total Displays
                </span>
                <span className="font-bold font-mono text-slate-900 dark:text-slate-100 text-sm">
                  <AnimatedNumber value={stats.total || 0} />
                </span>
              </div>
              <div className="h-6 w-px bg-slate-200 dark:bg-zinc-800" />
              <div className="flex-1 sm:flex-none text-center sm:text-left px-1.5">
                <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-zinc-400 tracking-wider block">
                  Verified
                </span>
                <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                  <AnimatedNumber value={stats.verified || 0} />
                </span>
              </div>
              <div className="h-6 w-px bg-slate-200 dark:bg-zinc-800" />
              <div className="flex-1 sm:flex-none text-center sm:text-left px-1.5">
                <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-zinc-400 tracking-wider block">
                  Review
                </span>
                <span className={`font-bold font-mono text-sm ${(stats.reviewRequired || 0) > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-zinc-400"}`}>
                  <AnimatedNumber value={stats.reviewRequired || 0} />
                </span>
              </div>
            </div>
          </div>
        </CardSpotlight>

        {/* Floating Bulk Actions Bar (Glasscn style) */}
        <AnimatePresence>
          {selectedItemIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
              className="sticky bottom-4 z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-zinc-900/95 dark:bg-zinc-900/95 backdrop-blur-xl text-white text-xs shadow-2xl border border-zinc-700/60"
            >
              <span className="font-semibold flex items-center gap-2">
                <span className="h-2 w-2 rounded-xs bg-indigo-400" />
                {selectedItemIds.length} display(s) selected
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="primary"
                  size="sm"
                  loading={bulkActionLoading}
                  onClick={handleBulkConfirm}
                  className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-600 dark:text-white font-semibold text-xs"
                >
                  <Check className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <span>Bulk Confirm Eligible</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={bulkActionLoading}
                  onClick={handleBulkReprocess}
                  className="flex-1 sm:flex-none text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <span>Rescan Markings</span>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Header Bar with Select All */}
        {items.length > 0 && (
          <div className="flex items-center justify-between sm:hidden px-1 text-xs">
            <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={items.length > 0 && selectedItemIds.length === items.length}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="rounded border-slate-300 dark:border-zinc-700 h-4 w-4 accent-indigo-600 cursor-pointer"
              />
              <span>Select All ({items.length})</span>
            </label>
          </div>
        )}

        {/* Mobile View: High-Density Display Item Cards */}
        <div className="sm:hidden space-y-3">
          {items.map((item: any) => {
            const isVerified = item.status === "verified";
            return (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-slate-200/90 dark:border-zinc-800 shadow-xs space-y-3 cursor-pointer transition-all hover:border-slate-300 dark:hover:border-zinc-700"
                onClick={() => setInspectingItemId(item.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedItemIds.includes(item.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => handleToggleSelect(item.id)}
                      className="rounded border-slate-300 dark:border-zinc-700 h-4 w-4 accent-indigo-600 cursor-pointer"
                      aria-label={`Select display #${item.itemNumber}`}
                    />
                    <span className="font-mono font-bold text-xs text-slate-800 dark:text-zinc-200">
                      #{item.itemNumber}
                    </span>
                    <StatusText
                      variant={
                        isVerified
                          ? "success"
                          : item.status === "review_required"
                          ? "warning"
                          : "neutral"
                      }
                    >
                      {formatItemStatus(item.status)}
                    </StatusText>
                  </div>
                  {item.images?.length > 1 && (
                    <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                      {item.images.length} photos
                    </span>
                  )}
                </div>

                <div className="flex gap-3 items-start">
                  {item.images?.[0] ? (
                    <div className="relative h-16 w-14 rounded-lg border border-slate-200 dark:border-zinc-800 overflow-hidden bg-slate-100 dark:bg-zinc-800 shrink-0">
                      <img
                        src={`/api/images/${item.images[0].id}?size=thumb`}
                        alt={`Display #${item.itemNumber}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-16 w-14 rounded-lg border border-dashed border-slate-300 dark:border-zinc-700 flex items-center justify-center text-slate-400 dark:text-zinc-500 text-[10px] shrink-0">
                      No img
                    </div>
                  )}

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <p className="min-w-0 text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug">
                        {modelResultText(item)}
                      </p>
                      <span className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-zinc-700 dark:text-zinc-300">
                        {modelResultLabel(item)}
                      </span>
                    </div>
                    {item.internalSku && (
                      <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-zinc-400">
                        <span>SKU:</span>
                        <CopyBadge value={item.internalSku} />
                      </div>
                    )}
                    {item.status === "review_required" && !item.predictedModel && (
                      <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-300">
                        Search evidence did not identify one model. Review the candidates before confirming.
                      </p>
                    )}
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                      Vendor:{" "}
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.identifiedVendorName || "Unidentified"}
                      </span>
                      {item.identifiedVendorVariantName
                        ? ` (${item.identifiedVendorVariantName})`
                        : ""}
                    </p>
                    {item.extractedTextSummary && (
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono truncate bg-slate-50 dark:bg-zinc-900/50 px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-zinc-800 inline-block max-w-full">
                        Text: {item.extractedTextSummary}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2.5 border-t border-slate-100 dark:border-zinc-800">
                  {!isVerified ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 h-9 text-xs font-medium"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const res = await fetch(`/api/rma-items/${item.id}/review`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "manual_verify" }),
                            });
                            if (res.ok) {
                              toast.success(`Display #${item.itemNumber} verified.`);
                              fetchRmaData();
                            } else {
                              const errJson = await res.json().catch(() => ({}));
                              toast.error(errJson.error || "Failed to verify display");
                            }
                          } catch {
                            toast.error("Network error");
                          }
                        }}
                      >
                        <Check className="h-3.5 w-3.5 mr-1 shrink-0" />
                        <span>Verify</span>
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 h-9 text-xs font-medium"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectingItemId(item.id);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1 shrink-0" />
                        <span>Inspect</span>
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full h-9 text-xs font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectingItemId(item.id);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1 shrink-0" />
                      <span>Inspect Details</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-400 dark:text-zinc-500 bg-white dark:bg-[#121215] rounded-xl border border-slate-200 dark:border-zinc-800">
              No display items recorded for this RMA.
            </div>
          )}
        </div>

        {/* Desktop View: Displays Table */}
        <CardSpotlight className="hidden sm:block p-0 overflow-hidden border-slate-200/90 dark:border-zinc-800">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/80 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 font-semibold">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={
                        items.length > 0 && selectedItemIds.length === items.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 dark:border-zinc-700 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-3 w-12 font-semibold">#</th>
                  <th className="px-4 py-3 w-16 font-semibold">Photo</th>
                  <th className="px-4 py-3 font-semibold">Model Result</th>
                  <th className="px-4 py-3 font-semibold">Vendor / Variant</th>
                  <th className="px-4 py-3 font-semibold">Inspection Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-zinc-800/80">
                {items.map((item: any) => {
                  const isVerified = item.status === "verified";
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer ${
                        selectedItemIds.includes(item.id)
                          ? "bg-indigo-50/40 dark:bg-zinc-800/40"
                          : ""
                      }`}
                      onClick={() => setInspectingItemId(item.id)}
                    >
                      <td
                        className="px-4 py-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelect(item.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedItemIds.includes(item.id)}
                          onChange={() => {}}
                          className="rounded border-slate-300 dark:border-zinc-700 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3 font-mono font-semibold text-slate-700 dark:text-zinc-300">
                        #{item.itemNumber}
                      </td>
                      <td className="px-4 py-2">
                        {item.images?.[0] ? (
                          <div className="h-10 w-10 rounded-lg border border-slate-200 dark:border-zinc-800 overflow-hidden bg-slate-100 dark:bg-zinc-800">
                            <img
                              src={`/api/images/${item.images[0].id}?size=thumb`}
                              alt="thumb"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="h-10 w-10 rounded-lg border border-dashed border-slate-300 dark:border-zinc-700 flex items-center justify-center text-slate-400 dark:text-zinc-500 text-[10px]">
                            No img
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {modelResultText(item)}
                          </span>
                          <span className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-zinc-700 dark:text-zinc-300">
                            {modelResultLabel(item)}
                          </span>
                        </div>
                        {item.internalSku && (
                          <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-zinc-400">
                            <span>SKU:</span>
                            <CopyBadge value={item.internalSku} />
                          </div>
                        )}
                        {item.status === "review_required" && !item.predictedModel && (
                          <p className="mt-1 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
                            Search evidence did not identify one model. Review the candidates before confirming.
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-200">
                        {item.identifiedVendorName ? (
                          <span>
                            {item.identifiedVendorName}
                            {item.identifiedVendorVariantName ? (
                              <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] ml-1">
                                ({item.identifiedVendorVariantName})
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-mono text-[10px] ml-1">
                                [Variant Unresolved]
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 italic">
                            Unidentified Vendor
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusText
                          variant={
                            isVerified
                              ? "success"
                              : item.status === "review_required"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {formatItemStatus(item.status)}
                        </StatusText>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isVerified && (
                            <Button
                              variant="outline"
                              size="sm"
                              title="Quick Confirm & Verify"
                              className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 h-7 px-2 text-[11px]"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const res = await fetch(
                                    `/api/rma-items/${item.id}/review`,
                                    {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ action: "manual_verify" }),
                                    }
                                  );
                                  if (res.ok) {
                                    toast.success(
                                      `Display #${item.itemNumber} verified.`
                                    );
                                    fetchRmaData();
                                  } else {
                                    const errJson = await res.json().catch(() => ({}));
                                    toast.error(
                                      errJson.error || "Failed to verify display"
                                    );
                                  }
                                } catch {
                                  toast.error("Network error");
                                }
                              }}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              <span>Verify</span>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Inspect Item Details"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectingItemId(item.id);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-slate-400 dark:text-slate-500"
                    >
                      No display items recorded for this RMA.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardSpotlight>

        {/* Side-Drawer Deep Inspection */}
        <AnimatePresence>
          {inspectingItemId && (
            <ItemReviewDrawer
              itemId={inspectingItemId}
              onClose={() => setInspectingItemId(null)}
              onUpdated={fetchRmaData}
            />
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
