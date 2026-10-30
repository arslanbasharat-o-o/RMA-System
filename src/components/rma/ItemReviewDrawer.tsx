"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Check,
  RotateCcw,
  AlertTriangle,
  ZoomIn,
  Trash2,
  Images,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
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
    setActiveImageId(null);
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
      const isAutomated = /^(?:Visual suggestion|Automated|Display model could not|No OCR|Evaluated \d+)/i.test(itemJson.item.reviewNotes || "");
      setReviewNotes(isAutomated ? "" : (itemJson.item.reviewNotes || ""));
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

  const { item, images, candidates, reviewHistory } = data || {};
  const currentVendor = vendorList.find((v) => v.id === selectedVendorId);
  const currentImage = (images && images.find((i: any) => i.id === activeImageId)) || images?.[0];

  const matchedCandidate = candidates?.find((c: any) =>
    (customModel && c.candidateTitle?.toLowerCase().includes(customModel.toLowerCase().trim())) ||
    (customModel && c.parsedModel?.toLowerCase() === customModel.toLowerCase().trim())
  );

  const activeBarcode = matchedCandidate?.barcodeValue || item?.barcodeValue || item?.seededProduct?.barcodeValue || null;
  const activeSku = matchedCandidate?.supplierSku || item?.supplierSku || item?.seededProduct?.supplierSku || item?.seededProduct?.printedTitle || null;

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
            <div role="status" className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-3 text-xs text-neutral-800 dark:text-neutral-200">
              <p className="font-semibold">
                {item.status === "queued"
                  ? "Queued for optical analysis…"
                  : item.visualStatus === "pending"
                    ? item.vendorOcrStatus === "success"
                      ? "Analyzing display model…"
                      : "Scanning display model and markings…"
                    : item.vendorOcrStatus === "pending"
                      ? "Reading physical markings…"
                      : "Preparing final recognition results…"}
              </p>
            </div>
          )}

          {item?.visualStatus === "failed" && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 space-y-2">
              <p className="font-semibold">Visual identification unavailable</p>
              <p>{/abort|timed out|timeout/i.test(item.visualError || "") ? "The visual search timed out. " : "The visual provider could not identify this image. "}Your photos are saved.{item.vendorOcrStatus === "success" ? " Text recognition completed successfully." : ""} Retry the image later or select a verified model below.</p>
              <Button variant="outline" size="sm" loading={saving} onClick={() => handleRetryRecognition("visual")}>Retry visual identification</Button>
            </div>
          )}
          {item?.vendorOcrStatus === "failed" && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 space-y-2">
              <p className="font-semibold">Markings recognition unavailable</p>
              <p>Your photos are saved. Retry the markings scan later or select the vendor manually.</p>
              <Button variant="outline" size="sm" loading={saving} onClick={() => handleRetryRecognition("vendor_ocr")}>Retry markings recognition</Button>
            </div>
          )}

          {/* Featured Photo Viewer */}
          {currentImage ? (
            <div className="space-y-2">
              <div
                onClick={() => setZoomedImage(`/api/images/${currentImage.id}?size=preview`)}
                className="group relative w-full h-64 sm:h-72 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900/60 overflow-hidden flex items-center justify-center cursor-zoom-in transition-all"
                title="Click to zoom image"
              >
                <img
                  src={`/api/images/${currentImage.id}?size=preview`}
                  alt={currentImage.originalFilename || "Display photograph"}
                  className="max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                />
                <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-neutral-900/75 backdrop-blur-xs text-[10px] font-semibold uppercase tracking-wider text-white">
                  {currentImage.imageType || "Photo"}
                </span>
                <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 px-2 py-1 rounded-md bg-neutral-900/70 backdrop-blur-xs text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn className="h-3.5 w-3.5" />
                  <span>Zoom</span>
                </div>
              </div>

              {/* Thumbnails row if multiple images exist */}
              {images && images.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {images.map((img: any) => {
                    const isSelected = currentImage.id === img.id;
                    return (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => setActiveImageId(img.id)}
                        className={`relative h-14 w-14 shrink-0 rounded-lg border-2 overflow-hidden bg-neutral-100 dark:bg-neutral-900 transition-all cursor-pointer ${
                          isSelected
                            ? "border-neutral-900 dark:border-neutral-100 shadow-xs"
                            : "border-transparent opacity-60 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={`/api/images/${img.id}?size=thumb`}
                          alt={img.originalFilename}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="h-40 w-full rounded-xl border border-dashed border-neutral-300 dark:border-neutral-800 flex flex-col items-center justify-center text-neutral-400 text-xs">
              <Images className="h-6 w-6 mb-1 text-neutral-300 dark:text-neutral-600" />
              <span>No photos captured yet</span>
            </div>
          )}

          {/* Clean Display Details & Specifications */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800/80 bg-neutral-50/70 dark:bg-neutral-900/40 p-4 space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-400 dark:text-neutral-500 tracking-wider block">
                  Identified Model
                </span>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
                  {item?.predictedDisplayAssembly ||
                    (item?.predictedModel
                      ? [item?.predictedManufacturer, item.predictedModel].filter(Boolean).join(" ")
                      : "Unidentified Model")}
                </h3>
              </div>
              {item?.modelSource === "manual" && item?.verifiedAt ? (
                <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  Verified
                </span>
              ) : !hasModelSuggestion(item) ? (
                <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Unidentified
                </span>
              ) : null}
            </div>

            {/* Clean Key-Value Grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/60 text-xs">
              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-400 dark:text-neutral-500 block">
                  Barcode (UPC)
                </span>
                {activeBarcode ? (
                  <span className="font-mono text-xs font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
                    {activeBarcode}
                  </span>
                ) : (
                  <span className="text-neutral-400 font-mono">—</span>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-400 dark:text-neutral-500 block">
                  Product SKU
                </span>
                <span className="font-mono text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  {activeSku || "—"}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-400 dark:text-neutral-500 block">
                  Vendor
                </span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {item?.identifiedVendorName || "Unidentified"}
                  {item?.identifiedVendorVariantName && (
                    <span className="text-neutral-400 ml-1">({item.identifiedVendorVariantName})</span>
                  )}
                </span>
              </div>

              {item?.extractedTextSummary && (
                <div>
                  <span className="text-[10px] uppercase font-semibold text-neutral-400 dark:text-neutral-500 block">
                    Markings
                  </span>
                  <span className="font-mono text-[11px] text-neutral-800 dark:text-neutral-200 truncate block">
                    {item.extractedTextSummary}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Alternative Matches / Search Candidates */}
          {candidates && candidates.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  Search Candidates
                </span>
                <span className="text-[11px] text-neutral-400">Select candidate to apply</span>
              </div>
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800/80 overflow-hidden bg-white dark:bg-neutral-900/30">
                {candidates.slice(0, 5).map((c: any) => {
                  const mfr = c.parsedManufacturer || extractManufacturerAndModel(c.candidateTitle).manufacturer;
                  const mdl = c.parsedModel || extractManufacturerAndModel(c.candidateTitle).model;
                  const isSelected = selectedCandidateId === c.id || (customModel && customModel.toLowerCase() === mdl.toLowerCase());
                  const candBarcode = c.barcodeValue;
                  const candSku = c.supplierSku;

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        editing.current = true;
                        setCustomManufacturer(mfr);
                        setCustomModel(mdl);
                        setSelectedCandidateId(c.id);
                        toast.info(`Selected ${mfr} ${mdl}`);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 text-xs flex items-center justify-between gap-3 transition-colors ${
                        isSelected
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100"
                          : "hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-800 dark:text-neutral-200"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-xs truncate">{mfr} {mdl}</p>
                        {(candBarcode || candSku) && (
                          <p className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                            {candBarcode && <span>UPC: {candBarcode}</span>}
                            {candBarcode && candSku && <span className="mx-1.5">·</span>}
                            {candSku && <span>SKU: {candSku}</span>}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                  placeholder="e.g. Apple"
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
                  placeholder="e.g. iPhone 16 Pro"
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

            {/* Operator Notes: Never pre-populated with AI diagnostic text */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Operator Notes (Optional):
              </label>
              <input
                type="text"
                value={reviewNotes}
                onChange={(e) => { editing.current = true; setReviewNotes(e.target.value); }}
                placeholder="Optional operator notes..."
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
