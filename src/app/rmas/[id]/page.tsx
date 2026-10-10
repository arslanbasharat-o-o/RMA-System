"use client";

import React, { useEffect, useState, use } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { StatusTransition } from "@/components/motion/StatusTransition";
import { toast } from "sonner";

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

  const fetchRmaData = async () => {
    try {
      const res = await fetch(`/api/rmas/${rmaId}`);
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRmaData();
    // Poll every 4 seconds if items are in processing/queued
    const interval = setInterval(() => {
      fetchRmaData();
    }, 4000);
    return () => clearInterval(interval);
  }, [rmaId]);

  const { rma, items = [], stats = {} } = data || {};

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

  if (loading && !data) {
    return (
      <AppShell>
        <div className="space-y-6 max-w-7xl mx-auto">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center justify-between">
          <Link
            href="/rmas"
            className="inline-flex items-center text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            <span>All RMAs</span>
          </Link>

          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/rmas/${rmaId}/capture`}>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Camera className="h-3.5 w-3.5 shrink-0" />
                <span>Scan More Screens</span>
              </Button>
            </Link>

            <a href={`/api/rmas/${rmaId}/export`}>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span>Export CSV</span>
              </Button>
            </a>

            {rma?.status !== "completed" && (
              <Button
                size="sm"
                variant="primary"
                onClick={handleMarkComplete}
                className="bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-600 dark:text-white"
              >
                Mark Completed
              </Button>
            )}
          </div>
        </div>

        {/* RMA Summary Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl sm:text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
                    {rma?.rmaNumber}
                  </h1>
                  <StatusTransition status={rma?.status} />
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  Customer: <span className="font-semibold text-neutral-900 dark:text-neutral-100">{rma?.customerName}</span> · Reason:{" "}
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">{rma?.returnReasonLabel}</span>
                  {rma?.trackingNumber ? ` · Tracking: ${rma.trackingNumber}` : ""}
                </p>
              </div>

              {/* Real Summary Metrics */}
              <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono flex-wrap">
                <div className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-center">
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase">Total Displays</div>
                  <div className="font-bold text-neutral-900 dark:text-neutral-100 text-sm">
                    <AnimatedNumber value={stats.total || 0} />
                  </div>
                </div>
                <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 rounded-lg text-center border border-emerald-200/50 dark:border-emerald-800/40">
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase">Verified</div>
                  <div className="font-bold text-sm">
                    <AnimatedNumber value={stats.verified || 0} />
                  </div>
                </div>
                <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 rounded-lg text-center border border-amber-200/50 dark:border-amber-800/40">
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 uppercase">Need Review</div>
                  <div className="font-bold text-sm">
                    <AnimatedNumber value={stats.reviewRequired || 0} />
                  </div>
                </div>
                {stats.processing > 0 && (
                  <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 rounded-lg text-center border border-blue-200/50 dark:border-blue-800/40">
                    <div className="text-[10px] text-blue-600 dark:text-blue-400 uppercase">Analyzing</div>
                    <div className="font-bold text-sm">
                      <AnimatedNumber value={stats.processing} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>



        {/* Bulk Actions Bar */}
        <AnimatePresence>
          {selectedItemIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-neutral-900 dark:bg-neutral-800 text-white text-xs shadow-md"
            >
              <span>
                {selectedItemIds.length} display(s) selected
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="primary"
                  size="sm"
                  loading={bulkActionLoading}
                  onClick={handleBulkConfirm}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-600 dark:text-white"
                >
                  <Check className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <span>Bulk Confirm Eligible</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={bulkActionLoading}
                  onClick={handleBulkReprocess}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <span>Reprocess Selected</span>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile View: Display Item Cards */}
        <div className="sm:hidden space-y-3">
          {items.map((item: any) => (
            <div
              key={item.id}
              className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-neutral-200/90 dark:border-neutral-800 shadow-xs space-y-3 cursor-pointer"
              onClick={() => setInspectingItemId(item.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-neutral-700 dark:text-neutral-300">#{item.itemNumber}</span>
                  <StatusTransition status={item.status} />
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {item.matchStatus}
                </Badge>
              </div>

              <div className="flex gap-3">
                {item.images?.[0] ? (
                  <div className="h-14 w-14 rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0">
                    <img
                      src={`/api/images/${item.images[0].id}?size=thumb`}
                      alt="thumb"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-14 w-14 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-400 dark:text-neutral-500 text-[10px] shrink-0">
                    No img
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                    {item.predictedDisplayAssembly ||
                      (item.predictedModel
                        ? `${item.predictedManufacturer ? item.predictedManufacturer + " " : ""}${item.predictedModel}`
                        : "Unidentified Model")}
                  </p>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate mt-0.5">
                    Vendor: {item.identifiedVendorName || "Unidentified"}
                    {item.identifiedVendorVariantName ? ` (${item.identifiedVendorVariantName})` : ""}
                  </p>
                  {item.extractedTextSummary && (
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono truncate mt-0.5">
                      Text: {item.extractedTextSummary}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                {item.status !== "verified" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 h-8 px-2.5 text-xs"
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
                    <Check className="h-3.5 w-3.5 mr-1" />
                    <span>Verify</span>
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setInspectingItemId(item.id);
                  }}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  <span>Inspect</span>
                </Button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="p-8 text-center text-xs text-neutral-400 dark:text-neutral-500 bg-white dark:bg-[#121215] rounded-xl border border-neutral-200 dark:border-neutral-800">
              No display items recorded for this RMA.
            </div>
          )}
        </div>

        {/* Desktop View: Displays Table */}
        <Card className="hidden sm:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                  <tr>
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={
                          items.length > 0 &&
                          selectedItemIds.length === items.length
                        }
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-neutral-300 dark:border-neutral-700"
                      />
                    </th>
                    <th className="px-3 py-3 w-12">#</th>
                    <th className="px-4 py-3 w-16">Image</th>
                    <th className="px-4 py-3">Identified Model</th>
                    <th className="px-4 py-3">Vendor / Variant</th>
                    <th className="px-4 py-3">Match Status</th>
                    <th className="px-4 py-3">Pipeline Status</th>
                    <th className="px-4 py-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800">
                  {items.map((item: any) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-neutral-50/70 dark:hover:bg-neutral-800/30 transition-colors cursor-pointer ${
                        selectedItemIds.includes(item.id) ? "bg-neutral-50 dark:bg-neutral-800/40" : ""
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
                          className="rounded border-neutral-300 dark:border-neutral-700"
                        />
                      </td>
                      <td className="px-3 py-3 font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                        #{item.itemNumber}
                      </td>
                      <td className="px-4 py-2">
                        {item.images?.[0] ? (
                          <div className="h-10 w-10 rounded border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                            <img
                              src={`/api/images/${item.images[0].id}?size=thumb`}
                              alt="thumb"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="h-10 w-10 rounded border border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-400 dark:text-neutral-500 text-[10px]">
                            No img
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                        {item.predictedDisplayAssembly || (item.predictedModel ? (
                          <span>
                            {item.predictedManufacturer ? `${item.predictedManufacturer} ` : ""}{item.predictedModel}
                          </span>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-500 italic">Unidentified Model</span>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-neutral-800 dark:text-neutral-200">
                        {item.identifiedVendorName ? (
                          <span>
                            {item.identifiedVendorName}
                            {item.identifiedVendorVariantName ? (
                              <span className="text-neutral-500 dark:text-neutral-400 font-mono text-[11px] ml-1">
                                ({item.identifiedVendorVariantName})
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-mono text-[10px] ml-1">
                                [Variant Unresolved]
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-500 italic">Unidentified Vendor</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            item.matchStatus === "exact_match" ||
                            item.matchStatus === "manually_verified"
                              ? "success"
                              : item.matchStatus === "ambiguous"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {item.matchStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusTransition status={item.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {item.status !== "verified" && (
                            <Button
                              variant="outline"
                              size="sm"
                              title="Quick Confirm & Verify"
                              className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 h-7 px-2 text-[11px]"
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
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-neutral-400 dark:text-neutral-500">
                        No display items recorded for this RMA.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Side-Drawer Deep Inspection */}
        {inspectingItemId && (
          <ItemReviewDrawer
            itemId={inspectingItemId}
            onClose={() => setInspectingItemId(null)}
            onUpdated={fetchRmaData}
          />
        )}
      </div>
    </AppShell>
  );
}
