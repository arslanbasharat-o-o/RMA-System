"use client";

import React, { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Play, Sparkles, Trash2, Pencil, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { LoadingMessage } from "@/components/ui/loading-message";
import { BlurIn } from "@/components/ui/blur-in";
import { MotionCardGrid, MotionCardItem } from "@/components/motion/CardMotion";
import { toast } from "sonner";
import {
  CardSpotlight,
  CopyBadge,
  StatusText,
  ShimmerButton,
} from "@/components/premium";
import { VendorRuleMatcher } from "@/lib/recognition/rules/matcher";

export default function VendorCatalogPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingRules, setSyncingRules] = useState(false);

  // Modals
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showEditVendor, setShowEditVendor] = useState(false);
  const [showAddVariant, setShowAddVariant] = useState(false);

  // Add Form
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorCode, setNewVendorCode] = useState("");
  const [newVendorAliases, setNewVendorAliases] = useState("");
  const [newVendorDescription, setNewVendorDescription] = useState("");

  // Edit Form
  const [editingVendorId, setEditingVendorId] = useState("");
  const [editVendorName, setEditVendorName] = useState("");
  const [editVendorCode, setEditVendorCode] = useState("");
  const [editVendorAliases, setEditVendorAliases] = useState("");
  const [editVendorDescription, setEditVendorDescription] = useState("");

  // Variant Form
  const [selectedParentVendorId, setSelectedParentVendorId] = useState("");
  const [variantName, setVariantName] = useState("");
  const [variantCode, setVariantCode] = useState("");
  const [variantTech, setVariantTech] = useState("Aftermarket");

  // Interactive Test Sandbox
  const [testText, setTestText] = useState("TXP09 INCELL 821-03200-A");
  const [testResult, setTestResult] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [vRes, rRes] = await Promise.all([
        fetch("/api/vendors"),
        fetch("/api/vendor-rules"),
      ]);
      if (vRes.status === 401 || rRes.status === 401) {
        window.location.assign("/login");
        return;
      }
      const vJson = await vRes.json();
      const rJson = await rRes.json();
      setVendors(vJson.vendors || []);
      setRules(rJson.rules || []);
      if (vJson.vendors?.length > 0) {
        setSelectedParentVendorId(vJson.vendors[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // In-memory matcher for sandbox testing
  const activeMatcher = useMemo(() => {
    const formattedVendors = vendors.map((v) => ({
      id: v.id,
      name: v.name,
      code: v.code,
      aliases: v.aliases || [],
    }));
    const formattedVariants = vendors.flatMap((v) =>
      (v.variants || []).map((va: any) => ({
        id: va.id,
        vendorId: v.id,
        name: va.name,
        code: va.code,
        displayTechnology: va.displayTechnology,
      }))
    );
    return new VendorRuleMatcher(rules, formattedVendors, formattedVariants);
  }, [vendors, rules]);

  const handleTestMatch = () => {
    const tokens = testText.split(/\s+/).map((t) => t.trim()).filter(Boolean);
    const result = activeMatcher.matchTokens(tokens);
    setTestResult(result);
  };

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedAliases = newVendorAliases
        .split(/[,;\n]+/)
        .map((a) => a.trim().toUpperCase())
        .filter((a) => a.length > 0);

      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newVendorName.trim(),
          code: newVendorCode.trim().toUpperCase(),
          aliases: parsedAliases,
          description: newVendorDescription.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Vendor created. System recognition rules auto-synced.");
      setShowAddVendor(false);
      setNewVendorName("");
      setNewVendorCode("");
      setNewVendorAliases("");
      setNewVendorDescription("");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create vendor");
    }
  };

  const handleOpenEditVendor = (v: any) => {
    setEditingVendorId(v.id);
    setEditVendorName(v.name);
    setEditVendorCode(v.code);
    setEditVendorAliases((v.aliases || []).join(", "));
    setEditVendorDescription(v.description || "");
    setShowEditVendor(true);
  };

  const handleUpdateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedAliases = editVendorAliases
        .split(/[,;\n]+/)
        .map((a) => a.trim().toUpperCase())
        .filter((a) => a.length > 0);

      const res = await fetch(`/api/vendors/${editingVendorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editVendorName.trim(),
          code: editVendorCode.trim().toUpperCase(),
          aliases: parsedAliases,
          description: editVendorDescription.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Vendor updated. Recognition codes auto-synced.");
      setShowEditVendor(false);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update vendor");
    }
  };

  const handleCreateVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/vendor-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: selectedParentVendorId,
          name: variantName.trim(),
          code: variantCode.trim().toUpperCase(),
          displayTechnology: variantTech,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Variant created & rules synced.");
      setShowAddVariant(false);
      setVariantName("");
      setVariantCode("");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create variant");
    }
  };

  const handleDeleteVendor = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove vendor "${name}"?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/vendors/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete vendor");
      toast.success(`Vendor "${name}" removed.`);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete vendor");
    }
  };

  const handleDeleteVariant = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove variant "${name}"?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/vendor-variants/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete variant");
      toast.success(`Variant "${name}" removed.`);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete variant");
    }
  };

  const handleSyncAllRules = async () => {
    setSyncingRules(true);
    try {
      const res = await fetch("/api/vendor-rules/sync", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync rules");
      toast.success(data.message || "Recognition rules synchronized.");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Rule synchronization failed");
    } finally {
      setSyncingRules(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
          <div>
            <BlurIn
              word="Vendor Catalog & Recognition"
              duration={0.24}
              className="text-left text-xl sm:text-2xl md:text-2xl md:leading-8 font-bold tracking-tight text-neutral-900 dark:text-neutral-50"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Vendor stamp codes are automatically recognized by the system.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              loading={syncingRules}
              onClick={handleSyncAllRules}
              className="h-8.5 sm:h-9 text-xs justify-center px-2.5 font-medium"
              title="Ensure all vendor codes and aliases are actively synchronized in the recognition engine"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              <span>Sync Rules</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddVariant(true)}
              className="h-8.5 sm:h-9 text-xs justify-center px-2.5 font-medium"
            >
              <span>+ Add Variant</span>
            </Button>
            <ShimmerButton
              onClick={() => setShowAddVendor(true)}
              className="h-8.5 sm:h-9 px-3 text-xs font-semibold justify-center"
            >
              <span>+ Add Vendor</span>
            </ShimmerButton>
          </div>
        </div>

        {/* OCR Test Sandbox Card */}
        <CardSpotlight
          className="p-5 border-neutral-200/90 dark:border-zinc-800 bg-white/95 dark:bg-[#121215]/95 shadow-sm relative"
          spotlightColor="rgba(255, 255, 255, 0.04)"
        >
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Test Vendor & Stamp Recognition
              </span>
            </div>
            <span className="text-[10px] font-mono text-neutral-400">
              {rules.length} active system rules loaded
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Enter stamp or label text (e.g. TXP09, TXP 08, AMI/A)..."
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleTestMatch();
                  }
                }}
                className="text-xs h-9 bg-neutral-50 dark:bg-neutral-900/60 font-mono flex-1"
              />
              <Button
                size="sm"
                variant="primary"
                onClick={handleTestMatch}
                className="h-9 px-4 text-xs font-semibold shrink-0"
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                <span>Test Stamp</span>
              </Button>
            </div>

            {testResult ? (
              testResult.vendorName ? (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-bold text-emerald-950 dark:text-emerald-200">
                      Vendor Match: {testResult.vendorName}
                    </span>
                    <StatusText variant="success">
                      Variant: {testResult.vendorVariantName || "Base / Standard"}
                    </StatusText>
                  </div>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-mono">
                    Pattern matched: <strong className="font-bold">&quot;{testResult.matchedPattern}&quot;</strong> (Confidence: {Math.round(testResult.confidenceScore * 100)}%)
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
                  <span className="font-semibold text-amber-950 dark:text-amber-200">
                    No vendor matched for &quot;{testText}&quot;
                  </span>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    Add this stamp code to a vendor below to enable automated recognition.
                  </p>
                </div>
              )
            ) : null}
          </div>
        </CardSpotlight>

        {/* Vendors List */}
        {loading ? (
          <LoadingMessage label="Loading vendors and recognized codes…" className="justify-center py-12" />
        ) : (
          <MotionCardGrid className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {vendors.map((vendor) => {
              const allCodes = Array.from(new Set([vendor.code, ...(vendor.aliases || [])]));

              return (
                <MotionCardItem key={vendor.id}>
                  <CardSpotlight className="h-full p-5 flex flex-col justify-between border-neutral-200/90 dark:border-neutral-800 bg-white/95 dark:bg-[#121215]/95 shadow-sm">
                    <div>
                      {/* Vendor Header */}
                      <div className="flex items-start justify-between pb-3 mb-3 border-b border-neutral-100 dark:border-zinc-800 gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                              {vendor.name}
                            </h3>
                            <CopyBadge value={vendor.code} label={vendor.code} />
                          </div>
                          {vendor.description && (
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                              {vendor.description}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditVendor(vendor)}
                            className="h-7 px-2 text-xs text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
                            title="Edit vendor and recognized codes"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            <span>Edit</span>
                          </Button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVendor(vendor.id, vendor.name)}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Remove vendor"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Recognized Codes Section (Multiple stock / stamp codes) */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block">
                            Recognized Stock & Stamp Codes:
                          </span>
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Auto-synced
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {allCodes.map((codeStr, idx) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-xs ${
                                idx === 0
                                  ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 font-bold"
                                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-700 font-medium"
                              }`}
                            >
                              {codeStr}
                              {idx === 0 && (
                                <span className="ml-1 text-[9px] uppercase tracking-wider font-semibold opacity-70">
                                  Primary
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Registered Variants */}
                      <div className="space-y-2 pt-3 border-t border-neutral-100 dark:border-zinc-800">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block">
                            Registered Variants ({vendor.variants?.length || 0}):
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedParentVendorId(vendor.id);
                              setShowAddVariant(true);
                            }}
                            className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            + Add Variant
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          {vendor.variants?.map((va: any) => (
                            <div
                              key={va.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-zinc-900 border border-neutral-200/60 dark:border-zinc-800 text-xs"
                            >
                              <div>
                                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                                  {va.name}
                                </span>
                                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 ml-2 font-mono">
                                  ({va.code})
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                                  {va.displayTechnology || "Standard"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteVariant(va.id, va.name)}
                                  className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                  title="Remove variant"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                          {(!vendor.variants || vendor.variants.length === 0) && (
                            <p className="text-xs text-neutral-400 dark:text-neutral-500 py-1.5 italic">
                              No variants registered under this vendor.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardSpotlight>
                </MotionCardItem>
              );
            })}
          </MotionCardGrid>
        )}

        {/* Modal: Add Vendor */}
        <Modal
          isOpen={showAddVendor}
          onClose={() => setShowAddVendor(false)}
          title="Add Vendor"
          maxWidth="max-w-md"
        >
          <form onSubmit={handleCreateVendor} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Vendor Name *
              </label>
              <Input
                required
                placeholder="e.g. TXParts, AMI, JK"
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                autoFocus
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Primary Stamp Code *
              </label>
              <Input
                required
                placeholder="e.g. TXP09"
                value={newVendorCode}
                onChange={(e) => setNewVendorCode(e.target.value.toUpperCase())}
                className="h-9 text-xs font-mono font-bold"
              />
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Primary code printed or stamped on screens from this supplier.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Additional Recognized Stock & Stamp Codes (Comma separated)
              </label>
              <Input
                placeholder="e.g. TXP08, TXP10, TXP"
                value={newVendorAliases}
                onChange={(e) => setNewVendorAliases(e.target.value)}
                className="h-9 text-xs font-mono"
              />
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Add other codes from new inventory runs so the system automatically recognizes all batches.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Description / Notes (Optional)
              </label>
              <Input
                placeholder="e.g. Main aftermarket display supplier"
                value={newVendorDescription}
                onChange={(e) => setNewVendorDescription(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddVendor(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" className="text-xs font-semibold">
                Save Vendor
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal: Edit Vendor */}
        <Modal
          isOpen={showEditVendor}
          onClose={() => setShowEditVendor(false)}
          title="Edit Vendor & Recognition Codes"
          maxWidth="max-w-md"
        >
          <form onSubmit={handleUpdateVendor} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Vendor Name *
              </label>
              <Input
                required
                placeholder="e.g. TXParts, AMI, JK"
                value={editVendorName}
                onChange={(e) => setEditVendorName(e.target.value)}
                autoFocus
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Primary Stamp Code *
              </label>
              <Input
                required
                placeholder="e.g. TXP09"
                value={editVendorCode}
                onChange={(e) => setEditVendorCode(e.target.value.toUpperCase())}
                className="h-9 text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Recognized Stock & Stamp Codes (Comma separated)
              </label>
              <Input
                placeholder="e.g. TXP08, TXP10, TXP"
                value={editVendorAliases}
                onChange={(e) => setEditVendorAliases(e.target.value)}
                className="h-9 text-xs font-mono"
              />
              <p className="text-[11px] text-neutral-400 mt-0.5">
                When new inventory arrives with alternate stamp codes (e.g. TXP08, TXP10), add them here to recognize them instantly.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Description / Notes (Optional)
              </label>
              <Input
                placeholder="e.g. Main aftermarket supplier"
                value={editVendorDescription}
                onChange={(e) => setEditVendorDescription(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowEditVendor(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" className="text-xs font-semibold">
                Update Vendor
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal: Add Variant */}
        <Modal
          isOpen={showAddVariant}
          onClose={() => setShowAddVariant(false)}
          title="Add Vendor Variant"
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleCreateVariant} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Parent Vendor *
              </label>
              <Select
                value={selectedParentVendorId}
                onChange={(e) => setSelectedParentVendorId(e.target.value)}
                className="h-9 text-xs"
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.code})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Variant Name *
              </label>
              <Input
                required
                placeholder="e.g. AMI In-cell, AMI/A"
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Variant Code *
              </label>
              <Input
                required
                placeholder="e.g. AMI-INCELL, AMI/A"
                value={variantCode}
                onChange={(e) => setVariantCode(e.target.value.toUpperCase())}
                className="h-9 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Display Technology
              </label>
              <Input
                placeholder="In-cell, OLED, Aftermarket"
                value={variantTech}
                onChange={(e) => setVariantTech(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddVariant(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" className="text-xs font-semibold">
                Save Variant
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
