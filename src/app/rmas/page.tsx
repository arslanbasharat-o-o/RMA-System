"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Plus,
  Search,
  Smartphone,
  Camera,
  ArrowRight,
  Package,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CardSpotlight,
  DataTableToolbar,
  CopyBadge,
  GlowingBadge,
  ShimmerButton,
} from "@/components/premium";

interface RmaSummary {
  id: string;
  rmaNumber: string;
  customerName: string;
  returnReasonLabel?: string;
  status: string;
  trackingNumber?: string;
  totalItems: number;
  verifiedItems: number;
  reviewRequiredItems: number;
  createdAt: string;
}

export default function RmaListPage() {
  const [rmas, setRmas] = useState<RmaSummary[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const listRequest = useRef<AbortController | null>(null);

  const fetchRmas = async () => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search.trim());
      if (statusFilter !== "all") params.append("status", statusFilter);

      const res = await fetch(`/api/rmas?${params.toString()}`, { signal: controller.signal });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (res.ok) {
        const json = await res.json();
        if (!controller.signal.aborted) setRmas(json.rmas || []);
      }
    } catch (err) {
      if (!controller.signal.aborted) console.error(err);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const handleSearchSubmit = (value: string) => {
    setSearch(value);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRmas();
    }, 250);
    return () => { clearTimeout(timer); listRequest.current?.abort(); };
  }, [search, statusFilter]);

  // Status options for the faceted toolbar
  const statusOptions = useMemo(() => {
    return [
      { label: "All Batches", value: "all" },
      { label: "Receiving", value: "receiving" },
      { label: "Processing", value: "processing" },
      { label: "Needs Review", value: "review_required" },
      { label: "Completed", value: "completed" },
      { label: "Archived", value: "archived" },
    ];
  }, []);

  const formatRmaStatus = (status: string) => {
    switch (status) {
      case "review_required":
        return "Needs Review";
      case "processing":
        return "Processing";
      case "completed":
        return "Completed";
      case "receiving":
        return "Receiving";
      case "pending_upload":
        return "Pending Upload";
      case "archived":
        return "Archived";
      case "draft":
        return "Draft";
      default:
        return (status || "Unknown").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };

  const getStatusVariant = (status: string): "success" | "warning" | "info" | "neutral" => {
    switch (status) {
      case "completed":
        return "success";
      case "review_required":
        return "warning";
      case "processing":
        return "info";
      default:
        return "neutral";
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Executive Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              RMA Shipments
            </h1>
          </div>

          <Link href="/rmas/new" className="shrink-0 self-start sm:self-auto">
            <ShimmerButton className="h-8.5 px-3.5 text-xs font-semibold gap-1.5">
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span>Create RMA</span>
            </ShimmerButton>
          </Link>
        </div>

        {/* Faceted Filter Toolbar (Dice UI pattern) */}
        <CardSpotlight className="p-0 overflow-hidden">
          <DataTableToolbar
            searchQuery={search}
            onSearchChange={handleSearchSubmit}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            statusOptions={statusOptions}
            placeholder="Search RMA #, customer, tracking number..."
          />

          {/* Mobile View: High-density interactive cards */}
          <div className="sm:hidden p-3 space-y-3">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            ) : rmas.length > 0 ? (
              rmas.map((rma) => (
                <div
                  key={rma.id}
                  className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-neutral-200/90 dark:border-neutral-800 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <CopyBadge value={rma.rmaNumber} />
                    <GlowingBadge
                      variant={getStatusVariant(rma.status)}
                      pulse={rma.status === "review_required"}
                    >
                      {formatRmaStatus(rma.status)}
                    </GlowingBadge>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/60 dark:border-neutral-700/60 flex items-center justify-center text-[10px] font-bold text-neutral-700 dark:text-neutral-300 shrink-0">
                      {(rma.customerName || "C").slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                      {rma.customerName}
                    </span>
                    <span className="text-neutral-400">·</span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                      {rma.returnReasonLabel || "Standard Return"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80">
                    <span className="font-mono text-[11px] flex items-center gap-1">
                      <Smartphone className="h-3 w-3 text-neutral-400" />
                      <strong>{rma.verifiedItems || 0}</strong>/{rma.totalItems || 0} verified
                      {rma.reviewRequiredItems > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold ml-1">
                          ({rma.reviewRequiredItems} rev)
                        </span>
                      )}
                    </span>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/rmas/${rma.id}/capture`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium py-1 px-2.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700"
                      >
                        <Camera className="h-3 w-3" />
                        <span>Scan</span>
                      </Link>
                      <Link
                        href={`/rmas/${rma.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-900 dark:text-neutral-100 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <span>Details</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-neutral-400 dark:text-neutral-500 bg-neutral-50/50 dark:bg-neutral-900/30 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800">
                No RMAs matched the search criteria.
              </div>
            )}
          </div>

          {/* Desktop View: Polished Table with CopyBadge & GlowingBadge */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50/80 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                <tr>
                  <th className="px-5 py-3 font-semibold">RMA Number</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Return Reason</th>
                  <th className="px-5 py-3 font-semibold">Screens (Verified / Total)</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Tracking #</th>
                  <th className="px-5 py-3 font-semibold">Created Date</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800/80">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-6">
                      <Skeleton className="h-5 w-full my-1.5" />
                      <Skeleton className="h-5 w-full my-1.5" />
                      <Skeleton className="h-5 w-full my-1.5" />
                    </td>
                  </tr>
                ) : rmas.length > 0 ? (
                  rmas.map((rma) => (
                    <tr
                      key={rma.id}
                      className="hover:bg-neutral-50/60 dark:hover:bg-zinc-800/40 transition-colors group"
                    >
                      <td className="px-5 py-3">
                        <CopyBadge value={rma.rmaNumber} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/60 dark:border-neutral-700/60 flex items-center justify-center text-[10px] font-bold text-neutral-700 dark:text-neutral-300 shrink-0">
                            {(rma.customerName || "C").slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                            {rma.customerName}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-neutral-600 dark:text-neutral-400">
                        {rma.returnReasonLabel || "Unspecified"}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-neutral-900 dark:text-neutral-100 font-semibold">
                          {rma.verifiedItems || 0}
                        </span>
                        <span className="text-neutral-400 dark:text-neutral-500">
                          {" "}
                          / {rma.totalItems || 0}
                        </span>
                        {rma.reviewRequiredItems > 0 && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-medium shrink-0 whitespace-nowrap leading-none">
                            {rma.reviewRequiredItems} need review
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <GlowingBadge
                          variant={getStatusVariant(rma.status)}
                          pulse={rma.status === "review_required"}
                        >
                          {formatRmaStatus(rma.status)}
                        </GlowingBadge>
                      </td>
                      <td className="px-5 py-3 font-mono text-neutral-500 dark:text-neutral-400">
                        {rma.trackingNumber ? (
                          <CopyBadge value={rma.trackingNumber} showIcon={false} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400 font-mono text-[11px]">
                        {new Date(rma.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          <Link
                            href={`/rmas/${rma.id}/capture`}
                            className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white font-medium"
                          >
                            <Camera className="h-3 w-3" />
                            <span>Scan</span>
                          </Link>
                          <span className="text-neutral-300 dark:text-neutral-700">·</span>
                          <Link
                            href={`/rmas/${rma.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900 hover:text-blue-600 dark:text-neutral-100 dark:hover:text-blue-400 transition-colors"
                          >
                            <span>View</span>
                            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-8 text-center text-neutral-400 dark:text-neutral-500"
                    >
                      {search || statusFilter !== "all"
                        ? "No return shipments match your filters."
                        : "No return shipments recorded yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardSpotlight>
      </div>
    </AppShell>
  );
}
