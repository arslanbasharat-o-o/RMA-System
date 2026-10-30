"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Play, Sparkles, Trash2 } from "lucide-react";
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

export default function VendorCatalogPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);

  // Forms
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorCode, setNewVendorCode] = useState("");
  const [newVendorAliases, setNewVendorAliases] = useState("");

  const [selectedParentVendorId, setSelectedParentVendorId] = useState("");
  const [variantName, setVariantName] = useState("");
  const [variantCode, setVariantCode] = useState("");
  const [variantTech, setVariantTech] = useState("Aftermarket");

  const [ruleVendorId, setRuleVendorId] = useState("");
  const [ruleVariantId, setRuleVariantId] = useState("");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleType, setRuleType] = useState<any>("exact_code");
  const [rulePriority, setRulePriority] = useState(150);

  // Interactive Test Sandbox
  const [testText, setTestText] = useState("AMI/A INCELL 821-03200-A");
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
        setRuleVendorId(vJson.vendors[0].id);
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

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newVendorName,
          code: newVendorCode,
          aliases: newVendorAliases.split(",").map((a) => a.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Vendor created.");
      setShowAddVendor(false);
      setNewVendorName("");
      setNewVendorCode("");
      setNewVendorAliases("");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create vendor");
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
          name: variantName,
          code: variantCode,
          displayTechnology: variantTech,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Variant created.");
      setShowAddVariant(false);
      setVariantName("");
      setVariantCode("");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create variant");
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/vendor-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: ruleVendorId,
          vendorVariantId: ruleVariantId || null,
          ruleType,
          pattern: rulePattern,
          priority: Number(rulePriority),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Recognition rule added.");
      setShowAddRule(false);
      setRulePattern("");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create rule");
    }
  };

  // Run test match simulation
  const handleTestMatch = () => {
    const tokens = testText.split(/\s+/).map((t) => t.trim().toUpperCase());
    let topMatch: any = null;

    for (const r of rules) {
      const pat = r.pattern.toUpperCase();
      for (const tok of tokens) {
        let match = false;
        if (r.ruleType === "exact_code" && tok === pat) match = true;
        else if (r.ruleType === "regex") {
          try {
            if (new RegExp(r.pattern, "i").test(tok)) match = true;
          } catch {}
        } else if (r.ruleType === "normalized_text" && tok.includes(pat)) match = true;

        if (match) {
          if (!topMatch || r.priority > topMatch.priority) {
            topMatch = { rule: r, token: tok };
          }
        }
      }
    }

    setTestResult(topMatch);
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

  const activeVendorForVariant = vendors.find((v) => v.id === ruleVendorId);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Executive Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
          <div>
            <BlurIn
              word="Vendor Catalog & Rules"
              duration={0.24}
              className="text-left text-xl sm:text-2xl md:text-2xl md:leading-8 font-bold tracking-tight text-neutral-900 dark:text-neutral-50"
            />
          </div>

          <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 w-full sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddRule(true)}
              className="h-8.5 sm:h-9 text-xs justify-center px-2 font-medium"
            >
              <span className="sm:hidden">+ Rule</span>
              <span className="hidden sm:inline">+ Add Rule</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddVariant(true)}
              className="h-8.5 sm:h-9 text-xs justify-center px-2 font-medium"
            >
              <span className="sm:hidden">+ Variant</span>
              <span className="hidden sm:inline">+ Add Variant</span>
            </Button>
            <ShimmerButton
              onClick={() => setShowAddVendor(true)}
              className="h-8.5 sm:h-9 px-3 text-xs font-semibold justify-center"
            >
              <span className="sm:hidden">+ Vendor</span>
              <span className="hidden sm:inline">+ Add Vendor</span>
            </ShimmerButton>
          </div>
        </div>

        {/* OCR Test Sandbox Card with CardSpotlight */}
        <CardSpotlight
          className="p-5 border-neutral-200/90 dark:border-zinc-800 bg-white/95 dark:bg-[#121215]/95 shadow-sm relative"
          spotlightColor="rgba(255, 255, 255, 0.04)"
        >
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Test Stamp & Marking Rules
              </span>
            </div>
            <span className="text-[10px] font-mono text-neutral-400">
              {rules.length} active rules loaded
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Enter stamp or label text (e.g. AMI/A, JK-TECH)..."
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                className="text-xs h-9 bg-neutral-50 dark:bg-neutral-900/60 font-mono flex-1"
              />
              <Button
                size="sm"
                variant="primary"
                onClick={handleTestMatch}
                className="h-9 px-4 text-xs font-semibold shrink-0"
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                <span>Test Rule</span>
              </Button>
            </div>

            {testResult ? (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-bold text-emerald-950 dark:text-emerald-200">
                    Vendor Match: {testResult.rule.vendorName}
                  </span>
                  <StatusText variant="success">
                    Variant: {testResult.rule.variantName || "Unresolved (Manual Review)"}
                  </StatusText>
                </div>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                  Matched token: <span className="font-mono font-bold">{testResult.token}</span> via pattern{" "}
                  <span className="font-mono font-bold">&quot;{testResult.rule.pattern}&quot;</span> (Priority:{" "}
                  {testResult.rule.priority})
                </p>
              </div>
            ) : null}
          </div>
        </CardSpotlight>

        {/* Vendors and Variants Hierarchy */}
        {loading ? (
          <LoadingMessage label="Loading vendors and variants…" className="justify-center py-12" />
        ) : (
          <MotionCardGrid className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {vendors.map((vendor) => (
              <MotionCardItem key={vendor.id}>
                <CardSpotlight className="h-full p-5 flex flex-col justify-between border-neutral-200/90 dark:border-neutral-800 bg-white/95 dark:bg-[#121215]/95 shadow-sm">
                  <div>
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-100 dark:border-zinc-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                            {vendor.name}
                          </h3>
                          <CopyBadge value={vendor.code} label={vendor.code} />
                        </div>
                        {vendor.aliases?.length > 0 && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                            Aliases: {vendor.aliases.join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200/60 dark:border-neutral-700/60 shrink-0 whitespace-nowrap leading-none">
                          {vendor.variants?.length || 0} variants
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteVendor(vendor.id, vendor.name)}
                          className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          title="Remove vendor"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block">
                        Registered Variants:
                      </span>

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
                          <p className="text-xs text-neutral-400 dark:text-neutral-500 py-2 italic">
                            No variants registered under this vendor.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardSpotlight>
              </MotionCardItem>
            ))}
          </MotionCardGrid>
        )}

        {/* Modal: Add Vendor */}
        <Modal
          isOpen={showAddVendor}
          onClose={() => setShowAddVendor(false)}
          title="Add Parent Vendor"
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleCreateVendor} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Vendor Name *
              </label>
              <Input
                required
                placeholder="e.g. AMI, JK, GX, ZY"
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                autoFocus
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Unique Code *
              </label>
              <Input
                required
                placeholder="e.g. AMI"
                value={newVendorCode}
                onChange={(e) => setNewVendorCode(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Aliases (Comma separated)
              </label>
              <Input
                placeholder="AM-I, AMI Group"
                value={newVendorAliases}
                onChange={(e) => setNewVendorAliases(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-zinc-800">
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
                    {v.name}
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
                onChange={(e) => setVariantCode(e.target.value)}
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

        {/* Modal: Add Rule */}
        <Modal
          isOpen={showAddRule}
          onClose={() => setShowAddRule(false)}
          title="Add Recognition Rule"
          maxWidth="max-w-md"
        >
          <form onSubmit={handleCreateRule} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Target Vendor *
              </label>
              <Select
                value={ruleVendorId}
                onChange={(e) => {
                  setRuleVendorId(e.target.value);
                  setRuleVariantId("");
                }}
                className="h-9 text-xs"
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Target Variant (Optional)
              </label>
              <Select
                value={ruleVariantId}
                onChange={(e) => setRuleVariantId(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="">-- Vendor only (Leaves variant unresolved) --</option>
                {activeVendorForVariant?.variants?.map((va: any) => (
                  <option key={va.id} value={va.id}>
                    {va.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Rule Type
                </label>
                <Select
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value)}
                  className="h-9 text-xs"
                >
                  <option value="exact_code">Exact Code</option>
                  <option value="normalized_text">Normalized Text</option>
                  <option value="regex">Regex</option>
                  <option value="alias">Alias</option>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Priority (1-250)
                </label>
                <Input
                  type="number"
                  value={rulePriority}
                  onChange={(e) => setRulePriority(parseInt(e.target.value))}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Pattern *
              </label>
              <Input
                required
                placeholder="e.g. AMI/A or ^AMI[\/\-]A$"
                value={rulePattern}
                onChange={(e) => setRulePattern(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddRule(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" className="text-xs font-semibold">
                Save Rule
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
