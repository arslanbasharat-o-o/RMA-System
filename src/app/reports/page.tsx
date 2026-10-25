"use client";

import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Download, Smartphone, Users, CheckCircle2 } from "lucide-react";
import { LoadingMessage } from "@/components/ui/loading-message";
import { BlurIn } from "@/components/ui/blur-in";
import {
  CardSpotlight,
  DataTableToolbar,
  CopyBadge,
  StatusText,
  MetricBentoCard,
  ShimmerButton,
} from "@/components/premium";

export default function ReportsPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function fetchReports() {
      try {
        const res = await fetch("/api/reports");
        if (res.status === 401) {
          window.location.assign("/login");
          return;
        }
        const json = await res.json();
        setRecords(json.records || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, []);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const q = search.toLowerCase();
      const matchesSearch =
        search === "" ||
        r.rmaNumber?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q) ||
        r.displayAssembly?.toLowerCase().includes(q) ||
        r.model?.toLowerCase().includes(q) ||
        r.vendorName?.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "verified" && r.itemStatus === "verified") ||
        (statusFilter === "review_required" && r.itemStatus === "review_required") ||
        (statusFilter === "rejected" && (r.itemStatus === "failed" || r.itemStatus === "rejected"));

      return matchesSearch && matchesStatus;
    });
  }, [records, search, statusFilter]);

  const statusOptions = useMemo(() => {
    return [
      { label: "All Items", value: "all", count: records.length },
      {
        label: "Verified",
        value: "verified",
        count: records.filter((r) => r.itemStatus === "verified").length,
      },
      {
        label: "Manual Review",
        value: "review_required",
        count: records.filter((r) => r.itemStatus === "review_required").length,
      },
      {
        label: "Rejected",
        value: "rejected",
        count: records.filter((r) => r.itemStatus === "failed" || r.itemStatus === "rejected").length,
      },
    ];
  }, [records]);

  // Derived stats
  const distinctCustomers = useMemo(() => {
    return new Set(records.map((r) => r.customerName)).size;
  }, [records]);

  const formatReportItemStatus = (status: string) => {
    switch (status) {
      case "verified":
        return "Verified";
      case "review_required":
        return "Needs Review";
      case "failed":
      case "rejected":
        return "Rejected";
      case "processing":
        return "Processing";
      default:
        return (status || "Verified").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };

  const formatMatchStatus = (status: string) => {
    switch (status) {
      case "auto_matched":
      case "exact_match":
        return "Auto Matched";
      case "manual_verified":
      case "manual_match":
        return "Manual Match";
      case "suggested_match":
        return "Suggested";
      case "failed":
        return "Unmatched";
      default:
        return (status || "Matched").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };

  const matchStatusVariant = (status: string): "success" | "warning" | "danger" | "info" | "neutral" => {
    switch (status) {
      case "auto_matched":
      case "exact_match":
        return "success";
      case "manual_verified":
      case "manual_match":
        return "info";
      case "suggested_match":
        return "warning";
      case "failed":
        return "danger";
      default:
        return "neutral";
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-full min-w-0">
        {/* Executive Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
          <div>
            <BlurIn
              word="Operations & Inventory Reports"
              duration={0.24}
              className="text-left text-lg sm:text-2xl md:text-2xl md:leading-8 font-bold tracking-tight text-neutral-900 dark:text-neutral-50"
            />
          </div>

          <a href="/api/reports?format=csv" className="shrink-0 self-start sm:self-auto">
            <ShimmerButton className="h-8.5 px-3.5 text-xs font-semibold gap-1.5">
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">Export CSV</span>
              <span className="hidden sm:inline">Export Full CSV</span>
            </ShimmerButton>
          </a>
        </div>

        {/* Key Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricBentoCard
            title="Total Screens Logged"
            value={records.length}
            loading={loading}
            icon={Smartphone}
            iconColor="text-blue-500"
            sparklineColor="blue"
          />

          <MetricBentoCard
            title="Active Repair Shops"
            value={distinctCustomers}
            loading={loading}
            icon={Users}
            iconColor="text-violet-500"
            sparklineColor="violet"
          />

          <MetricBentoCard
            title="Verified Screens"
            value={
              records.length > 0
                ? Math.round(
                    (records.filter((r) => r.itemStatus === "verified").length / records.length) * 100
                  )
                : 0
            }
            loading={loading}
            suffix="%"
            icon={CheckCircle2}
            iconColor="text-emerald-500"
            sparklineColor="emerald"
            className="col-span-2 lg:col-span-1"
          />
        </div>

        {/* Data Grid Section */}
        <CardSpotlight className="p-0 overflow-hidden">
          <div className="p-4 sm:p-5 flex items-center justify-between border-b border-neutral-200/80 dark:border-neutral-800">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Display Screen Log
              </h3>
            </div>
            <span className="text-xs font-mono text-neutral-400">
              {filteredRecords.length} / {records.length} items
            </span>
          </div>

          {/* Faceted Filter Toolbar */}
          <DataTableToolbar
            searchQuery={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            statusOptions={statusOptions}
            placeholder="Search RMA #, customer, display model, vendor..."
          />

          {/* Mobile View: High-density touch cards */}
          <div className="sm:hidden p-3 space-y-3">
            {loading ? (
              <LoadingMessage label="Loading report data…" compact className="justify-center py-8" />
            ) : filteredRecords.length > 0 ? (
              filteredRecords.map((r, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-neutral-200/90 dark:border-neutral-800 shadow-xs space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <CopyBadge value={r.rmaNumber} />
                    <StatusText
                      variant={
                        r.itemStatus === "verified"
                          ? "success"
                          : r.itemStatus === "review_required"
                          ? "warning"
                          : "neutral"
                      }
                    >
                      {formatReportItemStatus(r.itemStatus)}
                    </StatusText>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                      {r.displayAssembly ||
                        (r.model
                          ? `${r.manufacturer ? r.manufacturer + " " : ""}${r.model}`
                          : "Unresolved Model")}
                    </h4>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {r.customerName} · {r.returnReason || "Standard Return"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-neutral-100 dark:border-zinc-800 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                    <span>Vendor: {r.vendorName || "Unassigned"}</span>
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-neutral-400 dark:text-neutral-500 bg-neutral-50/50 dark:bg-neutral-900/30 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800">
                No report records match the active criteria.
              </div>
            )}
          </div>

          {/* Desktop View: Polished Table */}
          <div className="hidden sm:block overflow-x-auto w-full">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50/80 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                <tr>
                  <th className="px-5 py-3 font-semibold">RMA #</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Return Reason</th>
                  <th className="px-5 py-3 font-semibold">Display Model</th>
                  <th className="px-5 py-3 font-semibold">Vendor / Variant</th>
                  <th className="px-5 py-3 font-semibold">Match Status</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Intake Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800/80">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-6">
                      <LoadingMessage label="Loading report rows…" compact className="justify-center" />
                    </td>
                  </tr>
                ) : filteredRecords.length > 0 ? (
                  filteredRecords.map((r, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-neutral-50/60 dark:hover:bg-zinc-800/40 transition-colors group"
                    >
                      <td className="px-5 py-3">
                        <CopyBadge value={r.rmaNumber} />
                      </td>
                      <td className="px-5 py-3 text-neutral-800 dark:text-neutral-200 font-medium">
                        {r.customerName}
                      </td>
                      <td className="px-5 py-3 text-neutral-600 dark:text-neutral-400">
                        {r.returnReason}
                      </td>
                      <td className="px-5 py-3 font-semibold text-neutral-900 dark:text-neutral-100">
                        {r.displayAssembly ||
                          (r.model
                            ? `${r.manufacturer ? r.manufacturer + " " : ""}${r.model}`
                            : "Unresolved")}
                      </td>
                      <td className="px-5 py-3 text-neutral-700 dark:text-neutral-300">
                        {r.vendorName || "Unresolved"}
                        {r.variantName ? ` (${r.variantName})` : ""}
                      </td>
                      <td className="px-5 py-3">
                        <StatusText variant={matchStatusVariant(r.matchStatus)} showIcon={false} className="text-[10px] font-mono">
                          {formatMatchStatus(r.matchStatus)}
                        </StatusText>
                      </td>
                      <td className="px-5 py-3">
                        <StatusText
                          variant={
                            r.itemStatus === "verified"
                              ? "success"
                              : r.itemStatus === "review_required"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {formatReportItemStatus(r.itemStatus)}
                        </StatusText>
                      </td>
                      <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400 font-mono text-[11px]">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-8 text-center text-neutral-400 dark:text-neutral-500"
                    >
                      No report records match the active criteria.
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
