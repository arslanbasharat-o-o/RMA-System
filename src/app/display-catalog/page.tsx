"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Plus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function DisplayCatalogPage() {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; column: string; message: string }>>([]);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Form
  const [manufacturer, setManufacturer] = useState("Apple");
  const [modelName, setModelName] = useState("");
  const [normalizedId, setNormalizedId] = useState("");
  const [aliases, setAliases] = useState("");
  const [partNumbers, setPartNumbers] = useState("");
  const [displayTechnology, setDisplayTechnology] = useState("OLED");
  const [internalSku, setInternalSku] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const url = search ? `/api/display-catalog?q=${encodeURIComponent(search)}` : "/api/display-catalog";
      const res = await fetch(url);
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      const json = await res.json();
      setCatalog(json.catalog || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/display-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacturer,
          modelName,
          normalizedModelIdentifier:
            normalizedId || `${manufacturer}-${modelName}`.toLowerCase().replace(/[^a-z0-9]/g, "-"),
          aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
          knownPartNumbers: partNumbers.split(",").map((p) => p.trim()).filter(Boolean),
          displayTechnology,
          internalSku: internalSku || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Display model added to catalog.");
      setShowAddModal(false);
      setModelName("");
      setNormalizedId("");
      setAliases("");
      setPartNumbers("");
      setInternalSku("");
      fetchCatalog();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add model");
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      toast.error("Choose an .xlsx file first.");
      return;
    }
    setImporting(true);
    setImportErrors([]);
    try {
      const form = new FormData();
      form.set("file", importFile);
      const response = await fetch("/api/display-catalog/import", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) {
        setImportErrors(result.rowErrors || []);
        throw new Error(result.error || "The catalog import failed.");
      }
      toast.success(`${result.importedCount} display model${result.importedCount === 1 ? "" : "s"} imported.`);
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = "";
      setShowImportModal(false);
      await fetchCatalog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The catalog import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Display Model Catalog
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              Display assembly specifications, model numbers, and catalog aliases.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setImportErrors([]); setShowImportModal(true); }}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              <span>Import XLSX</span>
            </Button>
            <Button size="sm" variant="primary" onClick={() => setShowAddModal(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              <span>Add Display Model</span>
            </Button>
          </div>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  placeholder="Search model name, manufacturer, part numbers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchCatalog()}
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchCatalog}>
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Catalog Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                  <tr>
                    <th className="px-5 py-3">Manufacturer</th>
                    <th className="px-5 py-3">Model Name</th>
                    <th className="px-5 py-3">Technology</th>
                    <th className="px-5 py-3">Known Part Numbers</th>
                    <th className="px-5 py-3">Model Aliases</th>
                    <th className="px-5 py-3">Internal SKU</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-6">
                        <Skeleton className="h-5 w-full my-1.5" />
                        <Skeleton className="h-5 w-full my-1.5" />
                        <Skeleton className="h-5 w-full my-1.5" />
                      </td>
                    </tr>
                  ) : catalog.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="px-5 py-3 font-semibold text-neutral-900 dark:text-neutral-100">
                        {item.manufacturer}
                      </td>
                      <td className="px-5 py-3 font-medium text-neutral-800 dark:text-neutral-200">
                        {item.modelName}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="outline">{item.displayTechnology || "Standard"}</Badge>
                      </td>
                      <td className="px-5 py-3 font-mono text-neutral-600 dark:text-neutral-400">
                        {item.knownPartNumbers?.length > 0
                          ? item.knownPartNumbers.join(", ")
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                        {item.aliases?.join(", ") || "—"}
                      </td>
                      <td className="px-5 py-3 font-mono text-neutral-500 dark:text-neutral-400">
                        {item.internalSku || "—"}
                      </td>
                    </tr>
                  ))}
                  {!loading && catalog.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-neutral-400 dark:text-neutral-500">
                        No display catalog items found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Modal: Add Display Model */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Add Display Model to Catalog"
          description="Define smartphone display specifications for visual identification and part matching."
          maxWidth="max-w-md"
        >
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Manufacturer *
                </label>
                <Select
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                >
                  <option value="Apple">Apple</option>
                  <option value="Samsung">Samsung</option>
                  <option value="Xiaomi">Xiaomi</option>
                  <option value="Google">Google</option>
                  <option value="OnePlus">OnePlus</option>
                  <option value="Huawei">Huawei</option>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Model Name *
                </label>
                <Input
                  required
                  placeholder="e.g. iPhone 15 Pro"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Display Technology
              </label>
              <Input
                placeholder="e.g. Super Retina XDR OLED"
                value={displayTechnology}
                onChange={(e) => setDisplayTechnology(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Known Part Numbers (Comma separated)
              </label>
              <Input
                placeholder="821-03200-A, GH82-33451A"
                value={partNumbers}
                onChange={(e) => setPartNumbers(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Model Aliases (Comma separated)
              </label>
              <Input
                placeholder="iPhone15Pro, 15 Pro, A3102"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Internal SKU (Optional)
              </label>
              <Input
                placeholder="DISP-IP15P-OLED"
                value={internalSku}
                onChange={(e) => setInternalSku(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={saving}
              >
                Save Model
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal: Import Excel */}
        <Modal
          isOpen={showImportModal}
          onClose={() => !importing && setShowImportModal(false)}
          title="Import Display Catalog"
          description="Add multiple display models from an Excel workbook. Existing products are never overwritten."
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleImport} className="space-y-4">
            <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-3 text-xs text-neutral-600 dark:text-neutral-400">
              <div className="flex items-center justify-between gap-3">
                <p><strong>Required columns:</strong> Manufacturer, Model Name.</p>
                <Link prefetch={false} className="shrink-0 font-medium text-blue-600 dark:text-blue-400 underline" href="/api/display-catalog/import">
                  Download template
                </Link>
              </div>
              <p className="mt-1">Optional: Normalized Model Identifier, Internal SKU, Aliases, Known Part Numbers, Display Technology, Compatible Device Models, Notes, Is Active. Separate list values with commas, semicolons, pipes, or line breaks.</p>
              <p className="mt-1">Imports are all-or-nothing; duplicate identifiers and invalid rows prevent every row from being saved. Maximum 2,000 rows and 5 MB.</p>
            </div>

            <div>
              <label htmlFor="catalog-xlsx" className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Excel workbook (.xlsx)
              </label>
              <Input
                ref={importInputRef}
                id="catalog-xlsx"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => setImportFile(event.target.files?.[0] || null)}
                disabled={importing}
              />
              {importFile && (
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Selected: {importFile.name}
                </p>
              )}
            </div>

            {importErrors.length > 0 && (
              <div
                className="max-h-44 overflow-y-auto rounded-md border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-300"
                role="alert"
              >
                <p className="mb-2 font-semibold">No rows were imported. Fix these workbook entries:</p>
                <ul className="space-y-1">
                  {importErrors.map((issue, index) => (
                    <li key={`${issue.row}-${issue.column}-${index}`}>
                      Row {issue.row}, {issue.column}: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-neutral-100 dark:border-neutral-800 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowImportModal(false)}
                disabled={importing}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={importing}
                disabled={!importFile}
              >
                Import Products
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
