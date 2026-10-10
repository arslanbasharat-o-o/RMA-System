"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Check,
  RotateCcw,
  AlertTriangle,
  ZoomIn,
  Smartphone,
  Building2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useScrollLock } from "@/lib/utils/scroll-lock";
import { toast } from "sonner";
import { cleanRawCandidateTitle } from "@/lib/recognition/lens/cleaner-utils";
import { motion } from "motion/react";
import { modalOverlayVariants, drawerSlideVariants } from "@/lib/motion/variants";
import { StatusTransition } from "@/components/motion/StatusTransition";

export function ItemReviewDrawer({
  itemId,
  onClose,
  onUpdated,
}: {
  itemId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [catalogList, setCatalogList] = useState<any[]>([]);
  const [vendorList, setVendorList] = useState<any[]>([]);

  // Correction form state
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Prevent background scroll-locking bugs
  useScrollLock(true);

  // Keyboard navigation & Escape key handling (tiered: zoomedImage first, then drawer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomedImage) {
          setZoomedImage(null);
        } else if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [zoomedImage, showDeleteConfirm, onClose]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [itemRes, catRes, venRes] = await Promise.all([
          fetch(`/api/rma-items/${itemId}`),
          fetch(`/api/display-catalog`),
          fetch(`/api/vendors`),
        ]);

        const itemJson = await itemRes.json();
        const catJson = await catRes.json();
        const venJson = await venRes.json();

        setData(itemJson);
        setCatalogList(catJson.catalog || []);
        setVendorList(venJson.vendors || []);

        setSelectedCatalogId(itemJson.item.catalogDisplayId || "");
        setSelectedVendorId(itemJson.item.identifiedVendorId || "");
        setSelectedVariantId(itemJson.item.identifiedVendorVariantId || "");
        setReviewNotes(itemJson.item.reviewNotes || "");
      } catch (err) {
        console.error("Failed to load item review data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [itemId]);

  const handleApplyCorrection = async (action: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/rma-items/${itemId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          catalogDisplayId: selectedCatalogId || null,
          vendorId: selectedVendorId || null,
          vendorVariantId: selectedVariantId || null,
          notes: reviewNotes,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        toast.error(`Failed to save correction: ${errJson.error || res.statusText}`);
        return;
      }
      toast.success("Verification and correction saved.");
      onUpdated();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Network error saving correction.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/rma-items/${itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        toast.error(`Failed to delete item: ${errJson.error || res.statusText}`);
        return;
      }
      toast.success("Display item deleted.");
      setShowDeleteConfirm(false);
      onUpdated();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Network error while deleting item.");
    } finally {
      setSaving(false);
    }
  };

  const handleRetryRecognition = async (pipeline: string) => {
    setSaving(true);
    try {
      await fetch(`/api/rma-items/${itemId}/recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline }),
      });
      onUpdated();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-end">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          onClick={onClose}
          aria-hidden="true"
        />
        <div className="relative w-full sm:w-[480px] lg:w-[560px] h-full bg-white dark:bg-[#121215] border-l border-neutral-200 dark:border-neutral-800 shadow-2xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const { item, images, candidates, ocrExtractions, reviewHistory } = data || {};
  const currentVendor = vendorList.find((v) => v.id === selectedVendorId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop: Clicking closes drawer */}
      <motion.div
        variants={modalOverlayVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <motion.div
        variants={drawerSlideVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="relative w-full sm:w-[480px] lg:w-[560px] max-w-full h-full bg-white dark:bg-[#121215] text-neutral-900 dark:text-neutral-100 border-l border-neutral-200/90 dark:border-neutral-800 shadow-2xl z-10 flex flex-col font-sans"
        role="dialog"
        aria-modal="true"
        aria-label={`Inspection for Display Item #${item?.itemNumber}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
              Display Item #{item?.itemNumber}
            </span>
            <StatusTransition status={item?.status || "review_required"} />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4 shrink-0" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Images Gallery */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">
              Captured Photos ({images?.length || 0})
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {images?.map((img: any) => (
                <div
                  key={img.id}
                  onClick={() => setZoomedImage(`/api/images/${img.id}?size=preview`)}
                  className="group relative aspect-square rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-100 dark:bg-neutral-800 cursor-zoom-in"
                  title="Click to zoom image"
                >
                  <img
                    src={`/api/images/${img.id}?size=thumb`}
                    alt={img.originalFilename}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-black/60 text-[9px] text-white uppercase font-mono">
                    {img.imageType}
                  </span>
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ZoomIn className="h-4 w-4 text-white drop-shadow" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual Model Identification */}
          <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  Visual Identification
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline">
                  {item?.modelConfidenceScore
                    ? `${Math.round(item.modelConfidenceScore * 100)}% Match`
                    : "Unresolved"}
                </Badge>
              </div>
            </div>

            <div className="p-2.5 rounded-md bg-white dark:bg-[#121215] border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium uppercase tracking-wider">
                  Definitive Display Name
                </span>
                {(() => {
                  const matched = catalogList.find(
                    (c) => c.id === (selectedCatalogId || item?.catalogDisplayId)
                  );
                  return matched?.internalSku ? (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      SKU: {matched.internalSku}
                    </Badge>
                  ) : null;
                })()}
              </div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mt-1">
                {item?.predictedDisplayAssembly ||
                  (item?.predictedManufacturer
                    ? `${item?.predictedManufacturer} ${item?.predictedModel}`
                    : "Unidentified Model")}
              </div>
            </div>

            {/* Cleaned Visual Candidates */}
            {candidates && candidates.length > 0 && (
              <details className="mt-2 group text-xs text-neutral-600 dark:text-neutral-400">
                <summary className="cursor-pointer text-[11px] text-neutral-500 dark:text-neutral-400 font-medium hover:text-neutral-800 dark:hover:text-neutral-200 select-none flex items-center justify-between">
                  <span>Visual Search Candidates ({candidates.length})</span>
                  <span className="text-[10px] text-neutral-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <ul className="mt-1.5 space-y-1 divide-y divide-neutral-200/60 dark:divide-neutral-800">
                  {candidates.slice(0, 4).map((c: any) => {
                    const cleanTitle = cleanRawCandidateTitle(c.candidateTitle);
                    return (
                      <li key={c.id} className="pt-1 flex items-center justify-between">
                        <span className="truncate pr-2 font-medium text-neutral-800 dark:text-neutral-200">
                          {cleanTitle || c.candidateTitle}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-mono">#{c.rank}</span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </div>

          {/* Vendor & Variant Attribution */}
          <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  Vendor & Variant Attribution
                </span>
              </div>
              <Badge variant="outline">
                {item?.matchStatus || "unknown"}
              </Badge>
            </div>

            <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Vendor: {item?.identifiedVendorName || "Unidentified"} | Variant:{" "}
              {item?.identifiedVendorVariantName || "Unresolved"}
            </div>

            {/* OCR Extracted Text */}
            {ocrExtractions && ocrExtractions.length > 0 && (
              <div className="space-y-1 text-xs">
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">Extracted Text & Stamps:</span>
                <div className="p-2 rounded bg-white dark:bg-[#121215] border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 font-mono text-[11px] break-words">
                  {item?.extractedTextSummary || "No markings detected"}
                </div>
              </div>
            )}

            {item?.reviewNotes && (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 italic">
                Evidence: {item.reviewNotes}
              </p>
            )}
          </div>

          {/* Manual Correction Controls */}
          <div className="space-y-4 pt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Manual Verification & Override
            </h4>

            {/* Model Selector */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Select Verified Display Model:
              </label>
              <Select
                value={selectedCatalogId}
                onChange={(e) => setSelectedCatalogId(e.target.value)}
              >
                <option value="">-- Leave as current --</option>
                {catalogList.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.manufacturer} {cat.modelName} ({cat.displayTechnology})
                  </option>
                ))}
              </Select>
            </div>

            {/* Vendor Selector */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Vendor:
                </label>
                <Select
                  value={selectedVendorId}
                  onChange={(e) => {
                    setSelectedVendorId(e.target.value);
                    setSelectedVariantId("");
                  }}
                >
                  <option value="">-- Unidentified --</option>
                  {vendorList.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Variant:
                </label>
                <Select
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  disabled={!selectedVendorId}
                >
                  <option value="">-- None / Unresolved --</option>
                  {currentVendor?.variants?.map((va: any) => (
                    <option key={va.id} value={va.id}>
                      {va.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Review Notes */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Correction Notes:
              </label>
              <input
                type="text"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="e.g. Verified genuine AMI aftermarket ink stamp"
                className="w-full text-xs h-8 px-2.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                variant="primary"
                size="sm"
                loading={saving}
                onClick={() => handleApplyCorrection("manual_verify")}
                className="bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-600 dark:text-white shrink-0"
              >
                <Check className="h-3.5 w-3.5 mr-1 shrink-0" />
                <span>Confirm & Verify</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                loading={saving}
                onClick={() => handleApplyCorrection("manual_verify")}
                className="shrink-0"
              >
                Save Overrides
              </Button>

              <Button
                variant="outline"
                size="sm"
                loading={saving}
                onClick={() => handleRetryRecognition("visual")}
                title="Re-run visual search"
                className="shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1 shrink-0" />
                <span>Retry Visual</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                loading={saving}
                onClick={() => handleRetryRecognition("vendor_ocr")}
                title="Re-run OCR markings analysis"
                className="shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1 shrink-0" />
                <span>Retry OCR</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                loading={saving}
                onClick={() => handleRetryRecognition("all")}
                className="shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1 shrink-0" />
                <span>Retry All</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                loading={saving}
                onClick={() => setShowDeleteConfirm(true)}
                title="Remove this display item from RMA"
                className="text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 border-red-200 dark:border-red-900 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1 shrink-0" />
                <span>Delete Item</span>
              </Button>
            </div>
          </div>

          {/* Audit Review History */}
          {reviewHistory && reviewHistory.length > 0 && (
            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <h4 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2">Audit History</h4>
              <div className="space-y-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
                {reviewHistory.map((h: any) => (
                  <div key={h.id} className="p-2 rounded bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200/60 dark:border-neutral-800">
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">{h.actionType}</span> — {h.notes || "No notes"}
                    <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                      {new Date(h.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* High-res Image Zoom Modal */}
        {zoomedImage && (
          <div
            className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-150"
            onClick={() => setZoomedImage(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Image Zoom Inspection"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setZoomedImage(null);
              }}
              className="absolute top-4 right-4 p-2 rounded-full bg-neutral-800/80 text-white hover:bg-neutral-700 transition-colors z-70 cursor-pointer"
              aria-label="Close image zoom"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={zoomedImage}
              alt="Inspection zoom"
              className="max-h-[90vh] max-w-[90vw] object-contain rounded shadow-2xl cursor-default"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Delete Confirmation In-App Modal */}
        <Modal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          title="Delete Display Item"
          description="Are you sure you want to remove this display item from the RMA shipment?"
          maxWidth="max-w-sm"
        >
          <div className="space-y-4">
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              This will permanently delete this display record and all associated captured photos.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={saving}
                onClick={handleDeleteItem}
                className="bg-red-600 hover:bg-red-700 text-white dark:bg-red-600 dark:text-white"
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </Modal>
      </motion.div>
    </div>
  );
}
