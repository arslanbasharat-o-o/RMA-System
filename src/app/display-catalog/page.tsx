"use client";

import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Smartphone,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { LoadingMessage } from "@/components/ui/loading-message";
import { BlurIn } from "@/components/ui/blur-in";
import { toast } from "sonner";
import {
  CardSpotlight,
  CopyBadge,
  ShimmerButton,
} from "@/components/premium";

interface SeededReference {
  id: string;
  sourceDisplayId: string;
  sourceImageId: string;
  storagePath: string;
  isMatchable: boolean;
  cropMetadata: any;
  readableMarkings: any[];
  createdAt: string;
}

interface SeededProduct {
  id: string;
  sourceKey: string;
  manufacturer: string;
  modelName: string;
  variantName: string;
  printedTitle: string;
  barcodeValue: string | null;
  barcodeFormat: string | null;
  barcodeSymbology: string | null;
  supplierSku: string | null;
  otherCodes: any[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  references: SeededReference[];
}

interface CatalogStats {
  totalProducts: number;
  activeProducts: number;
  totalReferences: number;
  matchableReferences: number;
  excludedReferences: number;
  seedPackageAvailable: boolean;
  manifestVersion: number;
  environment: string;
}

export default function DisplayCatalogPage() {
  const [products, setProducts] = useState<SeededProduct[]>([]);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Reference detail modal
  const [selectedProduct, setSelectedProduct] = useState<SeededProduct | null>(null);
  const [selectedRef, setSelectedRef] = useState<SeededReference | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Sync modal
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncPreview, setSyncPreview] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [previewingSync, setPreviewingSync] = useState(false);

  // Test cleanup modal
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupCandidates, setCleanupCandidates] = useState<any[]>([]);
  const [loadingCleanup, setLoadingCleanup] = useState(false);
  const [cleaningId, setCleaningId] = useState<string | null>(null);

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/display-inventory");
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setProducts(json.products || []);
        setStats(json.stats || null);
      } else {
        toast.error("Failed to load display catalog data.");
      }
    } catch (err) {
      console.error("Failed to load catalog:", err);
      toast.error("Network error loading display catalog.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        p.modelName?.toLowerCase().includes(query) ||
        p.printedTitle?.toLowerCase().includes(query) ||
        p.manufacturer?.toLowerCase().includes(query) ||
        p.barcodeValue?.toLowerCase().includes(query) ||
        p.supplierSku?.toLowerCase().includes(query) ||
        p.references?.some((r) => r.sourceDisplayId.toLowerCase().includes(query));

      const matchesManufacturer =
        manufacturerFilter === "all" ||
        p.manufacturer?.toLowerCase() === manufacturerFilter.toLowerCase();

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && p.isActive) ||
        (statusFilter === "inactive" && !p.isActive);

      return matchesSearch && matchesManufacturer && matchesStatus;
    });
  }, [products, searchQuery, manufacturerFilter, statusFilter]);

  // Unique manufacturers for dropdown
  const manufacturers = useMemo(() => {
    const set = new Set(products.map((p) => p.manufacturer).filter(Boolean));
    return Array.from(set).sort();
  }, [products]);

  // Toggle active status
  const handleToggleProduct = async (product: SeededProduct) => {
    const newValue = !product.isActive;
    try {
      const res = await fetch("/api/display-inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "product", id: product.id, value: newValue }),
      });
      if (!res.ok) throw new Error("Failed to update status");

      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, isActive: newValue } : p))
      );
      toast.success(`${product.modelName} ${newValue ? "activated" : "deactivated"}`);
    } catch {
      toast.error("Failed to update product status.");
    }
  };

  // Toggle reference matchability
  const handleToggleReference = async (ref: SeededReference) => {
    const newValue = !ref.isMatchable;
    try {
      const res = await fetch("/api/display-inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "reference", id: ref.id, value: newValue }),
      });
      if (!res.ok) throw new Error("Failed to update reference status");

      setProducts((prev) =>
        prev.map((p) => ({
          ...p,
          references: p.references.map((r) =>
            r.id === ref.id ? { ...r, isMatchable: newValue } : r
          ),
        }))
      );
      if (selectedRef?.id === ref.id) {
        setSelectedRef({ ...selectedRef, isMatchable: newValue });
      }
      toast.success(`Reference ${ref.sourceDisplayId} ${newValue ? "matchable" : "unmatchable"}`);
    } catch {
      toast.error("Failed to update reference matchability.");
    }
  };

  // Open sync modal and trigger dry run preview
  const handleOpenSync = async () => {
    setSyncPreview(null);
    setShowSyncModal(true);
    setPreviewingSync(true);
    try {
      const res = await fetch("/api/display-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview_sync" }),
      });
      const data = await res.json();
      if (res.ok) setSyncPreview(data);
      else toast.error(data.error || "Failed to preview seed sync.");
    } catch {
      toast.error("Error previewing sync.");
    } finally {
      setPreviewingSync(false);
    }
  };

  // Execute seed sync
  const handleApplySync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/display-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_sync" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Seeded catalog synchronized.");
        setShowSyncModal(false);
        fetchCatalog();
      } else {
        toast.error(data.error || "Synchronization failed.");
      }
    } catch {
      toast.error("Error executing sync.");
    } finally {
      setSyncing(false);
    }
  };

  // Open test cleanup modal
  const handleOpenCleanup = async () => {
    setShowCleanupModal(true);
    setLoadingCleanup(true);
    try {
      const res = await fetch("/api/display-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview_test_cleanup" }),
      });
      const data = await res.json();
      if (res.ok) setCleanupCandidates(data.candidates || []);
      else toast.error(data.error || "Failed to load test records.");
    } catch {
      toast.error("Error checking test records.");
    } finally {
      setLoadingCleanup(false);
    }
  };

  // Execute test record deletion with safety confirmation
  const handleDeleteTestRma = async (rmaId: string, rmaNumber: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete test RMA record ${rmaNumber}? This action cannot be undone.`);
    if (!confirmed) return;

    setCleaningId(rmaId);
    try {
      const res = await fetch("/api/display-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "execute_test_cleanup", targetRmaId: rmaId, confirm: true }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Test record deleted.");
        setCleanupCandidates((prev) => prev.filter((c) => c.id !== rmaId));
      } else {
        toast.error(data.error || "Failed to delete test record.");
      }
    } catch {
      toast.error("Error executing deletion.");
    } finally {
      setCleaningId(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header with Title and Operational Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
          <div>
            <BlurIn
              word="Display Inventory Catalog"
              data-testid="display-catalog-title"
              duration={0.24}
              className="text-left text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenCleanup}
              className="text-xs gap-1.5 h-8.5"
            >
              <Trash2 className="h-3.5 w-3.5 text-neutral-500" />
              <span>Test Data</span>
            </Button>

            <ShimmerButton
              onClick={handleOpenSync}
              className="h-8.5 px-3.5 text-xs font-semibold gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5 shrink-0" />
              <span>Sync Seed Package</span>
            </ShimmerButton>
          </div>
        </div>

        {/* 4 Summary Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4">
          <CardSpotlight className="p-4 border-neutral-200/80 dark:border-neutral-800 bg-white/95 dark:bg-[#121215]/95">
            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Total Products
            </span>
            <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {stats?.totalProducts ?? 0}
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              {stats?.activeProducts ?? 0} active
            </span>
          </CardSpotlight>

          <CardSpotlight className="p-4 border-neutral-200/80 dark:border-neutral-800 bg-white/95 dark:bg-[#121215]/95">
            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Reference Samples
            </span>
            <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {stats?.totalReferences ?? 0}
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              {stats?.matchableReferences ?? 0} matchable
            </span>
          </CardSpotlight>

          <CardSpotlight className="p-4 border-neutral-200/80 dark:border-neutral-800 bg-white/95 dark:bg-[#121215]/95">
            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Excluded Samples
            </span>
            <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {stats?.excludedReferences ?? 0}
            </div>
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
              Non-display packaging
            </span>
          </CardSpotlight>

          <CardSpotlight className="p-4 border-neutral-200/80 dark:border-neutral-800 bg-white/95 dark:bg-[#121215]/95">
            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Recognition Mode
            </span>
            <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-2 truncate">
              Catalog-First Visual
            </div>
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
              Google Lens bypass on match
            </span>
          </CardSpotlight>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-lg border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121215]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              type="text"
              placeholder="Search model, SKU, UPC barcode, or sample ID (DSP-003)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={manufacturerFilter}
              onChange={(e) => setManufacturerFilter(e.target.value)}
              className="h-9 text-xs w-36"
            >
              <option value="all">All Brands</option>
              {manufacturers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>

            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 text-xs w-32"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </Select>
          </div>
        </div>

        {/* Products Table */}
        {loading ? (
          <LoadingMessage label="Loading display catalog inventory…" className="py-16 justify-center" />
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg">
            <Smartphone className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              No display variants match the criteria.
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Try adjusting your search query or filters.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121215] shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/75 dark:bg-neutral-900/50 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                  <tr>
                    <th className="py-3 px-4">Display Model & Variant</th>
                    <th className="py-3 px-4">Product SKU</th>
                    <th className="py-3 px-4">Box Barcode (UPC/EAN)</th>
                    <th className="py-3 px-4">References</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                  {filteredProducts.map((product) => {
                    const primaryRef = product.references[0];
                    return (
                      <tr
                        key={product.id}
                        className="hover:bg-neutral-50/60 dark:hover:bg-neutral-900/30 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            {primaryRef ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setSelectedRef(primaryRef);
                                  setShowDetailModal(true);
                                }}
                                className="h-10 w-8 rounded overflow-hidden border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 shrink-0 hover:ring-2 hover:ring-indigo-500/50 transition-all cursor-pointer"
                              >
                                <img
                                  src={`/api/images/${primaryRef.id}`}
                                  alt={primaryRef.sourceDisplayId}
                                  className="h-full w-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              </button>
                            ) : (
                              <div className="h-10 w-8 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 text-neutral-400">
                                <Smartphone className="h-4 w-4" />
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                                {product.manufacturer} {product.modelName}
                              </div>
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200/60 dark:border-neutral-700/60 mt-0.5">
                                {product.variantName}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-mono font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                            {product.printedTitle}
                          </div>
                          {product.supplierSku && product.supplierSku !== product.printedTitle && (
                            <div className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 mt-0.5">
                              Alt: {product.supplierSku}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {product.barcodeValue ? (
                            <CopyBadge
                              value={product.barcodeValue}
                              label={product.barcodeValue}
                            />
                          ) : (
                            <span className="text-neutral-400 italic">None</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {product.references.map((ref) => (
                              <button
                                key={ref.id}
                                type="button"
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setSelectedRef(ref);
                                  setShowDetailModal(true);
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                  ref.isMatchable
                                    ? "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-100"
                                    : "bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-400 line-through"
                                }`}
                              >
                                {ref.sourceDisplayId}
                              </button>
                            ))}
                            {product.references.length === 0 && (
                              <span className="text-neutral-400 italic">0 references</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleProduct(product)}
                            className="inline-flex items-center gap-1 cursor-pointer"
                          >
                            {product.isActive ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 className="h-3 w-3" /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700">
                                <XCircle className="h-3 w-3" /> Disabled
                              </span>
                            )}
                          </button>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedProduct(product);
                              setSelectedRef(product.references[0] || null);
                              setShowDetailModal(true);
                            }}
                            className="h-7 text-xs gap-1 text-indigo-600 dark:text-indigo-400"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Inspect</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Reference Detail & Inspection Modal */}
        <Modal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title={
            selectedProduct
              ? `${selectedProduct.manufacturer} ${selectedProduct.modelName} — ${selectedProduct.variantName}`
              : "Reference Details"
          }
        >
          {selectedProduct && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 space-y-1.5">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-neutral-400 block">Product SKU</span>
                    <span className="text-xs font-mono font-bold text-neutral-900 dark:text-neutral-100">
                      {selectedProduct.printedTitle}
                    </span>
                  </div>
                  <CopyBadge
                    value={selectedProduct.barcodeValue || ""}
                    label={selectedProduct.barcodeValue ? `UPC: ${selectedProduct.barcodeValue}` : "No Barcode"}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-500 pt-1.5 border-t border-neutral-200/60 dark:border-neutral-800">
                  <div>Catalog Model: <strong className="text-neutral-800 dark:text-neutral-200">{selectedProduct.manufacturer} {selectedProduct.modelName} ({selectedProduct.variantName})</strong></div>
                  <div>Source Key: <strong className="font-mono text-neutral-800 dark:text-neutral-200">{selectedProduct.sourceKey.slice(0, 16)}…</strong></div>
                </div>
              </div>

              {/* Reference Selector Tabs if multiple */}
              {selectedProduct.references.length > 1 && (
                <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
                  {selectedProduct.references.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRef(r)}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                        selectedRef?.id === r.id
                          ? "bg-indigo-600 text-white"
                          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                      }`}
                    >
                      {r.sourceDisplayId}
                    </button>
                  ))}
                </div>
              )}

              {/* Reference Viewer */}
              {selectedRef && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-900 flex items-center justify-center min-h-[220px]">
                    <img
                      src={`/api/images/${selectedRef.id}`}
                      alt={selectedRef.sourceDisplayId}
                      className="max-h-[300px] w-auto object-contain"
                    />
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase font-semibold">
                        Sample Identifier
                      </span>
                      <div className="font-mono font-bold text-neutral-900 dark:text-neutral-100 text-sm">
                        {selectedRef.sourceDisplayId} ({selectedRef.sourceImageId})
                      </div>
                    </div>

                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase font-semibold">
                        Match Engine Status
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                            selectedRef.isMatchable
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                              : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                          }`}
                        >
                          {selectedRef.isMatchable ? "Matchable in Engine" : "Excluded from Matching"}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleReference(selectedRef)}
                          className="h-6 text-[10px] px-2"
                        >
                          {selectedRef.isMatchable ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>

                    {selectedRef.cropMetadata && (
                      <div>
                        <span className="text-neutral-400 block text-[10px] uppercase font-semibold">
                          Crop Bounds
                        </span>
                        <pre className="text-[10px] bg-neutral-100 dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-800 font-mono text-neutral-700 dark:text-neutral-300 mt-1">
                          {JSON.stringify(selectedRef.cropMetadata, null, 2)}
                        </pre>
                      </div>
                    )}

                    {selectedRef.readableMarkings && (
                      <div>
                        <span className="text-neutral-400 block text-[10px] uppercase font-semibold">
                          Readable Markings
                        </span>
                        <div className="space-y-1 mt-1">
                          {Array.isArray(selectedRef.readableMarkings) ? (
                            selectedRef.readableMarkings.map((m: any, idx: number) => {
                              const text = typeof m === "string" ? m : m?.text || JSON.stringify(m);
                              const loc = typeof m === "object" && m?.location ? ` (${m.location})` : "";
                              return (
                                <div
                                  key={idx}
                                  className="text-[11px] p-1.5 rounded bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800"
                                >
                                  <strong className="font-mono text-indigo-600 dark:text-indigo-400">{text}</strong>
                                  {loc && <span className="text-neutral-500">{loc}</span>}
                                </div>
                              );
                            })
                          ) : typeof selectedRef.readableMarkings === "string" ? (
                            <div className="text-[11px] p-1.5 rounded bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                              <strong className="font-mono text-indigo-600 dark:text-indigo-400">
                                {selectedRef.readableMarkings}
                              </strong>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-neutral-200 dark:border-neutral-800">
                <Button variant="outline" size="sm" onClick={() => setShowDetailModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Sync Modal */}
        <Modal
          isOpen={showSyncModal}
          onClose={() => setShowSyncModal(false)}
          title="Seed Package Synchronization"
        >
          <div className="space-y-4 text-xs">
            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Synchronize the production display inventory database from the seed package manifest.
              This checks all {syncPreview?.manifestProducts ?? stats?.totalProducts ?? 76} product variants and {stats?.totalReferences ?? 83} cropped back-reference samples idempotently.
            </p>

            {previewingSync ? (
              <LoadingMessage label="Generating dry-run sync diff…" className="py-8 justify-center" />
            ) : syncPreview ? (
              <div className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 space-y-2 font-mono text-[11px]">
                <div className="text-neutral-400 uppercase text-[10px] font-bold">Dry-Run Preview Result</div>
                <div className="flex justify-between">
                  <span>Products in Manifest:</span>
                  <strong className="text-neutral-900 dark:text-neutral-100">{syncPreview.manifestProducts}</strong>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>New Products to Create:</span>
                  <strong>{syncPreview.createProducts}</strong>
                </div>
                {(syncPreview.updateProducts ?? 0) > 0 && (
                  <div className="flex justify-between text-indigo-600">
                    <span>Products to Update:</span>
                    <strong>{syncPreview.updateProducts}</strong>
                  </div>
                )}
                <div className="flex justify-between text-neutral-500">
                  <span>Unchanged Products:</span>
                  <strong>{syncPreview.unchangedProducts}</strong>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>New References to Store:</span>
                  <strong>{syncPreview.createReferences}</strong>
                </div>
                {(syncPreview.updateReferences ?? 0) > 0 && (
                  <div className="flex justify-between text-indigo-600">
                    <span>References to Update:</span>
                    <strong>{syncPreview.updateReferences}</strong>
                  </div>
                )}
                <div className="flex justify-between text-neutral-500">
                  <span>Unchanged References:</span>
                  <strong>{syncPreview.unchangedReferences}</strong>
                </div>
                <div className="flex justify-between text-amber-600">
                  <span>Excluded References:</span>
                  <strong>{syncPreview.excludedSamples}</strong>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200 dark:border-neutral-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSyncModal(false)}
                disabled={syncing}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApplySync}
                disabled={syncing || previewingSync || !syncPreview}
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
              >
                {syncing ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Applying...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Apply Synchronization</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Test Records Cleanup Modal */}
        <Modal
          isOpen={showCleanupModal}
          onClose={() => setShowCleanupModal(false)}
          title="Safe Test Data Management"
        >
          <div className="space-y-4 text-xs">
            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              The system identifies disposable development/test RMA records to maintain clean production reporting. Real customer orders and live inventory remain strictly protected.
            </p>

            {loadingCleanup ? (
              <LoadingMessage label="Scanning for test RMA records…" className="py-8 justify-center" />
            ) : cleanupCandidates.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-500">
                <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
                No disposable test RMA records found. Database is clean.
              </div>
            ) : (
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Identified Test Records ({cleanupCandidates.length}):
                </span>
                <div className="max-h-60 overflow-y-auto space-y-2 divide-y divide-neutral-100 dark:divide-neutral-800">
                  {cleanupCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="pt-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                          {candidate.rmaNumber}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Customer: {candidate.customerName || "Unassigned"} · {candidate.itemCount} items
                        </div>
                      </div>

                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={cleaningId === candidate.id}
                        onClick={() => handleDeleteTestRma(candidate.id, candidate.rmaNumber)}
                        className="h-7 text-xs gap-1"
                      >
                        {cleaningId === candidate.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        <span>Delete Test</span>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-neutral-200 dark:border-neutral-800">
              <Button variant="outline" size="sm" onClick={() => setShowCleanupModal(false)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
