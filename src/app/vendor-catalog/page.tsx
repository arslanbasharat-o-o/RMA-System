"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Plus, Building2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { MotionCardGrid, MotionCardItem } from "@/components/motion/CardMotion";
import { toast } from "sonner";

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

  const activeVendorForVariant = vendors.find((v) => v.id === ruleVendorId);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Vendor Catalog & Recognition Rules
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              Parent vendors, screen variants, and OCR pattern rules.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAddRule(true)}>
              + Add Rule
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddVariant(true)}>
              + Add Variant
            </Button>
            <Button size="sm" variant="primary" onClick={() => setShowAddVendor(true)}>
              + Add Vendor
            </Button>
          </div>
        </div>

        {/* OCR Test Sandbox Card */}
        <Card className="border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Rule Matching Simulator
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="flex gap-2">
              <Input
                placeholder="Enter sample OCR text (e.g. AMI/A, AMI INCELL, JK-TECH)..."
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                className="text-xs h-9 bg-white dark:bg-neutral-900"
              />
              <Button size="sm" variant="primary" onClick={handleTestMatch}>
                <Play className="h-3.5 w-3.5 mr-1" />
                <span>Test Rules</span>
              </Button>
            </div>

            {testResult ? (
              <div className="mt-3 p-3 rounded-lg bg-white dark:bg-[#121215] border border-neutral-200 dark:border-neutral-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                    Vendor Match: {testResult.rule.vendorName}
                  </span>
                  <Badge variant="success">
                    Variant: {testResult.rule.variantName || "Unresolved (Requires Review)"}
                  </Badge>
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                  Matched token: <span className="font-mono font-bold">{testResult.token}</span> via rule pattern{" "}
                  <span className="font-mono font-bold">&quot;{testResult.rule.pattern}&quot;</span> (Priority:{" "}
                  {testResult.rule.priority})
                </p>
              </div>
            ) : testText && testResult === null && (
              <div className="mt-2 text-[11px] text-neutral-400 dark:text-neutral-500">
                Test pattern matching against configured vendor rules.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vendors and Variants Hierarchy */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : (
          <MotionCardGrid className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {vendors.map((vendor) => (
              <MotionCardItem key={vendor.id}>
                <Card className="h-full">
                  <CardHeader className="p-5 pb-3 border-b border-neutral-100 dark:border-neutral-800 flex-row items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                          {vendor.name}
                        </CardTitle>
                        <Badge variant="outline" className="font-mono">
                          Code: {vendor.code}
                        </Badge>
                      </div>
                      {vendor.aliases?.length > 0 && (
                        <CardDescription className="text-xs mt-0.5">
                          Aliases: {vendor.aliases.join(", ")}
                        </CardDescription>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-5 pt-3 space-y-3">
                    <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      Configured Variants ({vendor.variants?.length || 0})
                    </span>

                    <div className="space-y-1.5">
                      {vendor.variants?.map((va: any) => (
                        <div
                          key={va.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200/60 dark:border-neutral-800 text-xs"
                        >
                          <div>
                            <span className="font-semibold text-neutral-900 dark:text-neutral-100">{va.name}</span>
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 ml-2 font-mono">
                              ({va.code})
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">
                            {va.displayTechnology || "Standard"}
                          </Badge>
                        </div>
                      ))}
                      {(!vendor.variants || vendor.variants.length === 0) && (
                        <p className="text-xs text-neutral-400 dark:text-neutral-500 py-2 italic">
                          No variants registered under this vendor.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </MotionCardItem>
            ))}
          </MotionCardGrid>
        )}

        {/* Modal: Add Vendor */}
        <Modal
          isOpen={showAddVendor}
          onClose={() => setShowAddVendor(false)}
          title="Add Parent Vendor"
          description="Register a display manufacturing or supply brand."
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleCreateVendor} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Vendor Name *
              </label>
              <Input
                required
                placeholder="e.g. AMI, JK, GX, ZY"
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Unique Code *
              </label>
              <Input
                required
                placeholder="e.g. AMI"
                value={newVendorCode}
                onChange={(e) => setNewVendorCode(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Aliases (Comma separated)
              </label>
              <Input
                placeholder="AM-I, AMI Group"
                value={newVendorAliases}
                onChange={(e) => setNewVendorAliases(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddVendor(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
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
          description="Register a child variant, factory grade, or display technology subtype."
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleCreateVariant} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Parent Vendor *
              </label>
              <Select
                value={selectedParentVendorId}
                onChange={(e) => setSelectedParentVendorId(e.target.value)}
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Variant Name *
              </label>
              <Input
                required
                placeholder="e.g. AMI In-cell, AMI/A"
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Variant Code *
              </label>
              <Input
                required
                placeholder="e.g. AMI-INCELL, AMI/A"
                value={variantCode}
                onChange={(e) => setVariantCode(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Display Technology
              </label>
              <Input
                placeholder="In-cell, OLED, Aftermarket"
                value={variantTech}
                onChange={(e) => setVariantTech(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddVariant(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
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
          description="Configure OCR pattern matching rules for automated variant attribution."
          maxWidth="max-w-md"
        >
          <form onSubmit={handleCreateRule} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Target Vendor *
              </label>
              <Select
                value={ruleVendorId}
                onChange={(e) => {
                  setRuleVendorId(e.target.value);
                  setRuleVariantId("");
                }}
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Target Variant (Optional)
              </label>
              <Select
                value={ruleVariantId}
                onChange={(e) => setRuleVariantId(e.target.value)}
              >
                <option value="">-- Vendor only (Leaves variant unresolved) --</option>
                {activeVendorForVariant?.variants?.map((va: any) => (
                  <option key={va.id} value={va.id}>
                    {va.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Rule Type
                </label>
                <Select
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value)}
                >
                  <option value="exact_code">Exact Code</option>
                  <option value="normalized_text">Normalized Text</option>
                  <option value="regex">Regex</option>
                  <option value="alias">Alias</option>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Priority (1-250)
                </label>
                <Input
                  type="number"
                  value={rulePriority}
                  onChange={(e) => setRulePriority(parseInt(e.target.value))}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Pattern *
              </label>
              <Input
                required
                placeholder="e.g. AMI/A or ^AMI[\/\-]A$"
                value={rulePattern}
                onChange={(e) => setRulePattern(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddRule(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Save Rule
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
