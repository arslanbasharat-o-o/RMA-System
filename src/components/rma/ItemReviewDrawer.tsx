"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Check,
  RotateCcw,
  AlertTriangle,
  ZoomIn,
  Trash2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingMessage } from "@/components/ui/loading-message";
import { useScrollLock } from "@/lib/utils/scroll-lock";
import { toast } from "sonner";
import { cleanRawCandidateTitle } from "@/lib/recognition/lens/cleaner-utils";

function extractManufacturerAndModel(title: string): { manufacturer: string; model: string } {
  const clean = cleanRawCandidateTitle(title);
  if (/iphone|apple|ipad/i.test(clean)) {
    const model = clean.replace(/^(?:apple\s+)?(iphone\s+[a-z0-9\s+]+)/i, "$1").trim();
    return { manufacturer: "Apple", model: model || clean };
  }
  if (/galaxy|samsung/i.test(clean)) {
    const model = clean.replace(/^(?:samsung\s+)?(galaxy\s+[a-z0-9\s+]+)/i, "$1").trim();
    return { manufacturer: "Samsung", model: model || clean };
  }
  if (/pixel|google/i.test(clean)) {
    const model = clean.replace(/^(?:google\s+)?(pixel\s+[a-z0-9\s+]+)/i, "$1").trim();
    return { manufacturer: "Google", model: model || clean };
  }
  if (/oneplus/i.test(clean)) {
    const model = clean.replace(/^(?:oneplus\s+)?([a-z0-9\s+]+)/i, "$1").trim();
    return { manufacturer: "OnePlus", model: model || clean };
  }
  return { manufacturer: "Other", model: clean };
}
import { motion } from "motion/react";
import { modalOverlayVariants, drawerSlideVariants } from "@/lib/motion/variants";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
import { StatusTransition } from "@/components/motion/StatusTransition";
import { hasModelSuggestion } from "@/lib/model-result";

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
  const [vendorList, setVendorList] = useState<any[]>([]);

  // Correction form state
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [customManufacturer, setCustomManufacturer] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const editing = useRef(false);
  const optionsLoaded = useRef(false);

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
    editing.current = false;
    optionsLoaded.current = false;
    setLoading(true);
    setData(null);
  }, [itemId]);

  const { refreshError } = useLiveRefresh(itemId, async (signal) => {
    const response = await fetch(`/api/rma-items/${itemId}`, { signal, cache: "no-store" });
    if (response.status === 401) { window.location.assign("/login"); return false; }
    if (!response.ok) throw new Error("Could not load the display item.");
    const itemJson = await response.json();
    if (!itemJson.item) throw new Error("Display item is unavailable.");
    if (signal.aborted) return;
    setData(itemJson);
    setLoading(false);
    // Live recognition updates must never erase a correction being typed.
    if (!editing.current) {
      setSelectedCatalogId(itemJson.item.catalogDisplayId || "");
      setCustomManufacturer(itemJson.item.predictedManufacturer || "");
      setCustomModel(itemJson.item.predictedModel || "");
      setSelectedVendorId(itemJson.item.identifiedVendorId || "");
      setSelectedVariantId(itemJson.item.identifiedVendorVariantId || "");
      setReviewNotes(itemJson.item.reviewNotes || "");
    }
    if (!optionsLoaded.current) {
      const venRes = await fetch("/api/vendors", { signal, cache: "no-store" });
      if (!venRes.ok) throw new Error("Could not load review options.");
      const venJson = await venRes.json();
      if (signal.aborted) return;
      setVendorList(venJson.vendors || []);
      optionsLoaded.current = true;
    }
    return ["queued", "processing", "uploaded"].includes(itemJson.item.status);
  });

  const handleApplyCorrection = async (action: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/rma-items/${itemId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          catalogDisplayId: selectedCatalogId || null,
          predictedManufacturer: customManufacturer || data?.item?.predictedManufacturer || null,
          predictedModel: customModel || data?.item?.predictedModel || null,
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
      const res = await fetch(`/api/rma-items/${itemId}/recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline }),
      });
      if (!res.ok) throw new Error("Could not queue recognition. Please try again.");
      onUpdated();
      onClose();
    } catch {
      toast.error("Could not queue recognition. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !refreshError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-end">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Loading display details"
          className="relative flex h-full w-full flex-col items-center justify-center gap-3 bg-white p-6 text-center shadow-2xl dark:bg-[#121215] sm:w-[480px] sm:border-l sm:border-neutral-200 lg:w-[560px] dark:sm:border-neutral-800"
        >
          <LoadingMessage label="Loading display details…" detail="This usually takes a moment." />
        </div>
      </div>
    );
  }

  if (!data && refreshError) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4">
    <div role="alert" className="rounded-xl bg-white p-5 text-neutral-900 dark:bg-neutral-900 dark:text-white">
      <p>Connection interrupted. Reconnecting to this display automatically…</p>
      <div className="mt-4"><Button variant="outline" onClick={onClose}>Close</Button></div>
    </div>
  </div>;

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
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
              Display Item #{item?.itemNumber}
            </span>
            <StatusTransition status={item?.status || "review_required"} />
          </div>
          <button
            onClick={onClose}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4 shrink-0" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 sm:p-6 sm:pb-28 space-y-4 sm:space-y-6">
          {refreshError && (
            <div role="alert" className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 p-2.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Connection interrupted. Reconnecting automatically…</span>
            </div>
          )}

          {["uploaded", "queued", "processing"].includes(item?.status) && (
            <div role="status" className="rounded-lg border border-blue-200/80 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/20 p-3 text-xs text-blue-900 dark:text-blue-300 space-y-0.5">
              <p className="font-semibold">
                {item.status === "queued"
                  ? "Queued for automated optical analysis…"
                  : item.visualStatus === "pending"
                    ? item.vendorOcrStatus === "success"
                      ? "Text recognition finished. Analyzing display model…"
                      : "Scanning display model and reading markings…"
                    : item.vendorOcrStatus === "pending"
                      ? "Reading physical display markings…"
                      : "Preparing final recognition results…"}
              </p>
              <p className="text-[11px] text-blue-700/80 dark:text-blue-400/80">
                Live updates will refresh here automatically.
              </p>
            </div>
          )}

          {item?.visualStatus === "failed" && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 space-y-2">
              <p className="font-semibold">Visual identification unavailable</p>
              <p>{/abort|timed out|timeout/i.test(item.visualError || "") ? "The visual search timed out. " : "The visual provider could not identify this image. "}Your photos are saved.{item.vendorOcrStatus === "success" ? " Text recognition completed successfully." : ""} Retry the image later or select a verified model below.</p>
              <Button variant="outline" size="sm" loading={saving} onClick={() => handleRetryRecognition("visual")}>Retry visual identification</Button>
            </div>
          )}
          {item?.vendorOcrStatus === "failed" && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 space-y-2">
              <p className="font-semibold">Markings recognition unavailable</p>
              <p>Your photos are saved. Retry the markings scan later or select the vendor manually.</p>
              <Button variant="outline" size="sm" loading={saving} onClick={() => handleRetryRecognition("vendor_ocr")}>Retry markings recognition</Button>
            </div>
          )}

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

          {/* Unified Display & Attribution Details */}
          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Model result
              </span>
              <div className="flex items-center gap-2">
                {item?.modelSource === "manual" && item?.verifiedAt ? (
                  <Badge variant="outline">Verified</Badge>
                ) : item && hasModelSuggestion(item) ? (
                  <Badge variant="outline">Suggestion</Badge>
                ) : (
                  <Badge variant="outline">Unidentified</Badge>
                )}
              </div>
            </div>

            <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              {item?.predictedDisplayAssembly ||
                (item?.predictedModel
                  ? [item?.predictedManufacturer, item.predictedModel].filter(Boolean).join(" ")
                  : "Unidentified Model")}
            </div>

            {item?.status === "review_required" && !item?.predictedModel && (
              <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                Search evidence did not identify one model. Compare the candidates and choose the exact catalog model before confirming.
              </p>
            )}

            <div className="pt-2.5 border-t border-neutral-200/60 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
              <span>Vendor: <strong className="text-neutral-900 dark:text-neutral-100 font-medium">{item?.identifiedVendorName || "Unidentified"}</strong></span>
              <span>Variant: <strong className="text-neutral-900 dark:text-neutral-100 font-medium">{item?.identifiedVendorVariantName || "None"}</strong></span>
            </div>

            {/* Extracted Markings */}
            {ocrExtractions && ocrExtractions.length > 0 && item?.extractedTextSummary && (
              <div className="pt-2 border-t border-neutral-200/60 dark:border-neutral-800 text-xs space-y-1">
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">Extracted Markings:</span>
                <p className="p-2 rounded bg-white dark:bg-[#121215] border border-neutral-200 dark:border-neutral-800 font-mono text-[11px] text-neutral-800 dark:text-neutral-200 break-words">
                  {item.extractedTextSummary}
                </p>
              </div>
            )}

            {/* Visual Search Candidates from Google Lens */}
            {candidates && candidates.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-indigo-500" />
                    Google Search Matches ({candidates.length})
                  </span>
                  <span className="text-[10px] text-neutral-400">Click to select as correct model</span>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {candidates.slice(0, 8).map((c: any) => {
                    const parsed = extractManufacturerAndModel(c.candidateTitle);
                    const isSelected = selectedCandidateId === c.id || (customModel && customModel.toLowerCase() === parsed.model.toLowerCase());
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          editing.current = true;
                          setCustomManufacturer(parsed.manufacturer);
                          setCustomModel(parsed.model);
                          setSelectedCandidateId(c.id);
                          toast.info(`Selected ${parsed.manufacturer} ${parsed.model}`);
                        }}
                        className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-start justify-between gap-2 ${
                          isSelected
                            ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-500 ring-1 ring-emerald-500 shadow-xs"
                            : "bg-white dark:bg-[#18181c] border-neutral-200/80 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-700"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                              #{c.rank}
                            </span>
                            <span className="font-bold text-neutral-900 dark:text-neutral-100 truncate">
                              {parsed.manufacturer} {parsed.model}
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 line-clamp-1 break-words">
                            {c.candidateTitle}
                          </p>
                        </div>
                        {isSelected ? (
                          <span className="shrink-0 text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[11px] font-semibold">
                            <Check className="h-3.5 w-3.5" />
                            Selected
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
                            Select
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Verification & Manual Overrides */}
          <div className="space-y-3.5 pt-1">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Verify or Correct Model
            </h4>

            {/* Model Inputs */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Manufacturer:
                </label>
                <input
                  type="text"
                  value={customManufacturer}
                  onChange={(e) => { editing.current = true; setCustomManufacturer(e.target.value); }}
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
                  onChange={(e) => { editing.current = true; setCustomModel(e.target.value); }}
                  placeholder="e.g. Galaxy Note 20 Ultra"
                  className="w-full text-xs h-9 px-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-semibold"
                />
              </div>
            </div>

            {/* Vendor Selector */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Vendor:
              </label>
              <Select
                value={selectedVendorId}
                onChange={(e) => {
                  editing.current = true;
                  setSelectedVendorId(e.target.value);
                  setSelectedVariantId("");
                }}
              >
                <option value="">-- Unidentified Vendor --</option>
                {vendorList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Variant Selector (shown when vendor selected) */}
            {selectedVendorId && currentVendor?.variants && currentVendor.variants.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Variant:
                </label>
                <Select
                  value={selectedVariantId}
                  onChange={(e) => { editing.current = true; setSelectedVariantId(e.target.value); }}
                >
                  <option value="">-- None / Standard --</option>
                  {currentVendor.variants.map((va: any) => (
                    <option key={va.id} value={va.id}>
                      {va.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Review Notes */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Correction Notes:
              </label>
              <input
                type="text"
                value={reviewNotes}
                onChange={(e) => { editing.current = true; setReviewNotes(e.target.value); }}
                placeholder="e.g. Verified genuine AMI aftermarket ink stamp"
                className="w-full text-base sm:text-xs min-h-11 sm:min-h-0 h-9 px-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
            </div>

            {/* Single Primary Action Button */}
            <div className="pt-2">
              <Button
                variant="primary"
                size="md"
                loading={saving}
                onClick={() => handleApplyCorrection("manual_verify")}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-600 dark:text-white font-semibold h-10 justify-center shadow-xs cursor-pointer"
              >
                <Check className="h-4 w-4 mr-1.5 shrink-0" />
                <span>Confirm & Verify</span>
              </Button>
            </div>

              {/* Secondary Scan & Item Management Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={saving}
                    onClick={() => handleRetryRecognition("all")}
                    title="Rescan display and markings"
                    className="text-xs h-8"
                  >
                    <RotateCcw className="h-3 w-3 mr-1 shrink-0" />
                    <span>Rescan All</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    loading={saving}
                    onClick={() => handleRetryRecognition("vendor_ocr")}
                    title="Rescan markings"
                    className="text-xs h-8 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>Rescan Markings</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    loading={saving}
                    onClick={() => handleRetryRecognition("visual")}
                    title="Rescan display image"
                    className="text-xs h-8 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>Rescan Image</span>
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  loading={saving}
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Remove this display item from RMA"
                  className="text-xs h-8 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="h-3 w-3 mr-1 shrink-0" />
                  <span>Delete</span>
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
              className="absolute top-4 right-4 p-2 rounded-lg bg-neutral-800/80 text-white hover:bg-neutral-700 transition-colors z-70 cursor-pointer"
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
