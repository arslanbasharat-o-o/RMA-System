"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Plus, Search, Upload, Smartphone, Layers, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { LoadingMessage } from "@/components/ui/loading-message";
import { toast } from "sonner";
import {
  CardSpotlight,
  CopyBadge,
  ShimmerButton,
} from "@/components/premium";

export default function DisplayCatalogPage() {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<
    Array<{ row: number; column: string; message: string }>
  >([]);
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

  const listRequest = useRef<AbortController | null>(null);

  const fetchCatalog = async (targetPage = page) => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      params.set("page", String(targetPage));
      params.set("limit", "50");

      const res = await fetch(`/api/display-catalog?${params.toString()}`, { signal: controller.signal });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to load catalog");
      const json = await res.json();
      if (listRequest.current === controller) {
        setCatalog(json.catalog || []);
        setTotalPages(json.totalPages || 1);
        setTotalCount(json.total || (json.catalog || []).length);
        setPage(targetPage);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error(err);
      }
    } finally {
      if (listRequest.current === controller) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCatalog(1);
    }, 250);
    return () => { clearTimeout(timer); listRequest.current?.abort(); };
  }, [search]);

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
            normalizedId ||
            `${manufacturer}-${modelName}`.toLowerCase().replace(/[^a-z0-9]/g, "-"),
          aliases: aliases
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
          knownPartNumbers: partNumbers
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
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
      const response = await fetch("/api/display-catalog/import", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) {
        setImportErrors(result.rowErrors || []);
        throw new Error(result.error || "The catalog import failed.");
      }
      toast.success(
        `${result.importedCount} display model${result.importedCount === 1 ? "" : "s"} imported.`
      );
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
        {/* Executive Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              Display Model Catalog
            </h1>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5 w-full sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setImportErrors([]);
                setShowImportModal(true);
              }}
              className="h-8.5 sm:h-9 text-xs justify-center font-medium"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <span className="sm:hidden">Import</span>
              <span className="hidden sm:inline">Import XLSX</span>
            </Button>
            <ShimmerButton
              onClick={() => setShowAddModal(true)}
              className="h-8.5 sm:h-9 px-3.5 text-xs font-semibold gap-1.5 justify-center"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">Add Model</span>
              <span className="hidden sm:inline">Add Display Model</span>
            </ShimmerButton>
          </div>
        </div>

        {/* Search Toolbar */}
        <CardSpotlight className="p-3 bg-neutral-50/70 dark:bg-neutral-900/40">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search model name, manufacturer, part numbers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8.5 pl-8.5 pr-8 rounded-lg bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </CardSpotlight>

          {/* Mobile View: High-Density Touch Cards */}
        <div className="sm:hidden space-y-3">
          {loading ? (
            <LoadingMessage label="Loading display models…" compact className="justify-center py-8" />
          ) : catalog.length > 0 ? (
            catalog.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-neutral-200/90 dark:border-neutral-800 shadow-xs space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {item.manufacturer}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 shrink-0 whitespace-nowrap leading-none">
                    {item.displayTechnology || "Standard"}
                  </span>
                </div>

                <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  {item.modelName}
                </h4>

                {item.knownPartNumbers?.length > 0 && (
                  <div className="pt-2 border-t border-neutral-100 dark:border-zinc-800 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-[10px] text-neutral-400 font-mono">Parts:</span>
                    {item.knownPartNumbers.slice(0, 3).map((p: string, idx: number) => (
                      <CopyBadge key={idx} value={p} />
                    ))}
                    {item.knownPartNumbers.length > 3 && (
                      <span className="text-[10px] text-neutral-400 font-mono">
                        +{item.knownPartNumbers.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-neutral-400 dark:text-neutral-500 bg-white dark:bg-[#121215] rounded-xl border border-neutral-200 dark:border-neutral-800">
              No display catalog items found.
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1 py-2 text-xs">
              <span className="text-neutral-500 font-mono">
                Page {page} of {totalPages} ({totalCount} items)
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchCatalog(page - 1)}
                  disabled={page <= 1 || loading}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchCatalog(page + 1)}
                  disabled={page >= totalPages || loading}
                  className="h-8 px-2"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Desktop View: Polished Catalog Table */}
        <CardSpotlight className="hidden sm:block p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50/80 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                <tr>
                  <th className="px-5 py-3 font-semibold">Manufacturer</th>
                  <th className="px-5 py-3 font-semibold">Model Name</th>
                  <th className="px-5 py-3 font-semibold">Technology</th>
                  <th className="px-5 py-3 font-semibold">Known Part Numbers</th>
                  <th className="px-5 py-3 font-semibold">Model Aliases</th>
                  <th className="px-5 py-3 font-semibold">Internal SKU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800/80">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6">
                      <LoadingMessage label="Loading display models…" compact className="justify-center" />
                    </td>
                  </tr>
                ) : catalog.length > 0 ? (
                  catalog.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-neutral-50/60 dark:hover:bg-zinc-800/40 transition-colors group"
                    >
                      <td className="px-5 py-3 font-semibold text-neutral-900 dark:text-neutral-100">
                        {item.manufacturer}
                      </td>
                      <td className="px-5 py-3 font-bold text-neutral-900 dark:text-neutral-100">
                        {item.modelName}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 shrink-0 whitespace-nowrap leading-none">
                          {item.displayTechnology || "Standard"}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-neutral-600 dark:text-neutral-400">
                        {item.knownPartNumbers?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.knownPartNumbers.map((p: string, idx: number) => (
                              <CopyBadge key={idx} value={p} />
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                        {item.aliases?.join(", ") || "—"}
                      </td>
                      <td className="px-5 py-3 font-mono text-neutral-500 dark:text-neutral-400">
                        {item.internalSku ? (
                          <CopyBadge value={item.internalSku} />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-neutral-400 dark:text-neutral-500"
                    >
                      No display catalog items found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Desktop Pagination Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 text-xs">
            <span className="text-neutral-500 font-medium">
              Showing page <strong className="text-neutral-800 dark:text-neutral-200">{page}</strong> of{" "}
              <strong className="text-neutral-800 dark:text-neutral-200">{totalPages}</strong>{" "}
              <span className="text-neutral-400 font-mono">({totalCount} total models)</span>
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchCatalog(page - 1)}
                disabled={page <= 1 || loading}
                className="h-8 text-xs gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchCatalog(page + 1)}
                disabled={page >= totalPages || loading}
                className="h-8 text-xs gap-1"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardSpotlight>

        {/* Modal: Add Display Model */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Add Display Model to Catalog"
          maxWidth="max-w-md"
        >
          <form onSubmit={handleCreate} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Manufacturer *
                </label>
                <Select
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="h-9 text-xs"
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
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Model Name *
                </label>
                <Input
                  required
                  placeholder="e.g. iPhone 15 Pro"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Display Technology
              </label>
              <Input
                placeholder="e.g. Super Retina XDR OLED"
                value={displayTechnology}
                onChange={(e) => setDisplayTechnology(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Known Part Numbers (Comma separated)
              </label>
              <Input
                placeholder="821-03200-A, GH82-33451A"
                value={partNumbers}
                onChange={(e) => setPartNumbers(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Model Aliases (Comma separated)
              </label>
              <Input
                placeholder="iPhone15Pro, 15 Pro, A3102"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Internal SKU (Optional)
              </label>
              <Input
                placeholder="DISP-IP15P-OLED"
                value={internalSku}
                onChange={(e) => setInternalSku(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddModal(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={saving}
                className="text-xs font-semibold"
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
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleImport} className="space-y-4">
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-3.5 text-xs text-neutral-600 dark:text-neutral-400 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <p>
                  <strong>Required columns:</strong> Manufacturer, Model Name.
                </p>
                <Link
                  prefetch={false}
                  className="shrink-0 font-medium text-blue-600 dark:text-blue-400 underline"
                  href="/api/display-catalog/import"
                >
                  Download template
                </Link>
              </div>
              <p>
                Optional: Normalized Model Identifier, Internal SKU, Aliases, Known Part
                Numbers, Display Technology, Compatible Device Models, Notes, Is Active.
              </p>
              <p className="text-[11px] text-neutral-500">
                Imports are all-or-nothing; duplicate identifiers prevent the entire file from saving.
                Maximum 2,000 rows.
              </p>
            </div>

            <div>
              <label
                htmlFor="catalog-xlsx"
                className="mb-1.5 block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Excel workbook (.xlsx)
              </label>
              <Input
                ref={importInputRef}
                id="catalog-xlsx"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => setImportFile(event.target.files?.[0] || null)}
                disabled={importing}
                className="h-10 text-xs"
              />
              {importFile && (
                <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                  Selected file: <strong>{importFile.name}</strong>
                </p>
              )}
            </div>

            {importErrors.length > 0 && (
              <div
                className="max-h-44 overflow-y-auto rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-300"
                role="alert"
              >
                <p className="mb-2 font-semibold">No rows were imported. Fix these entries:</p>
                <ul className="space-y-1">
                  {importErrors.map((issue, index) => (
                    <li key={`${issue.row}-${issue.column}-${index}`}>
                      Row {issue.row}, {issue.column}: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-neutral-100 dark:border-zinc-800 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowImportModal(false)}
                disabled={importing}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={importing}
                disabled={!importFile}
                className="text-xs font-semibold"
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
