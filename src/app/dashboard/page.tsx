"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Plus,
  Layers,
  ArrowRight,
} from "lucide-react";
import {
  AnimatedPackageCheck,
  AnimatedDisplayModule,
  AnimatedGauge,
  AnimatedAlertTriage,
} from "@/components/icons/AnimatedIcons";
import { LoadingMessage } from "@/components/ui/loading-message";
import { BlurIn } from "@/components/ui/blur-in";
import {
  MetricBentoCard,
  CardSpotlight,
  RmaStatusPipeline,
  DataTableToolbar,
  CopyBadge,
  StatusText,
  ShimmerButton,
} from "@/components/premium";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchDashboard = async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const kpis = data?.kpis || {
    totalRmas: 0,
    totalDisplays: 0,
    verifiedDisplays: 0,
    reviewDisplays: 0,
    processingDisplays: 0,
    verificationRate: 0,
  };

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
        return (status || "Draft").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };

  // Pipeline stages mapped to actual RMA operations
  const pipelineStages = useMemo(() => {
    return [
      {
        id: "intake",
        name: "Shipments Received",
        count: kpis.totalRmas || 0,
        status: "complete" as const,
        icon: AnimatedPackageCheck,
      },
      {
        id: "optical_inspection",
        name: "Screen Inspection",
        count: kpis.processingDisplays || 0,
        status: "current" as const,
        icon: AnimatedDisplayModule,
      },
      {
        id: "review",
        name: "Manual Review",
        count: kpis.reviewDisplays || 0,
        status: (kpis.reviewDisplays > 0 ? "current" : "complete") as "current" | "complete",
        icon: AnimatedAlertTriage,
      },
      {
        id: "verified",
        name: "Verified Displays",
        count: kpis.verifiedDisplays || 0,
        status: "complete" as const,
        icon: AnimatedGauge,
      },
    ];
  }, [kpis]);

  // Filtered recent RMAs
  const recentRmas = useMemo(() => {
    if (!data?.recentRmas) return [];
    return data.recentRmas.filter((rma: any) => {
      const matchesSearch =
        searchQuery === "" ||
        rma.rmaNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rma.customerName?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "completed" && rma.status === "completed") ||
        (statusFilter === "review_required" &&
          (rma.status === "review_required" || rma.status === "suggested_match")) ||
        (statusFilter === "draft" &&
          (rma.status === "draft" || rma.status === "processing"));

      return matchesSearch && matchesStatus;
    });
  }, [data, searchQuery, statusFilter]);

  // Filter status options
  const statusOptions = useMemo(() => {
    const all = data?.recentRmas?.length || 0;
    const completed =
      data?.recentRmas?.filter((r: any) => r.status === "completed").length || 0;
    const review =
      data?.recentRmas?.filter(
        (r: any) => r.status === "review_required" || r.status === "suggested_match"
      ).length || 0;
    const draft =
      data?.recentRmas?.filter((r: any) => r.status === "draft" || r.status === "processing")
        .length || 0;

    return [
      { label: "All Returns", value: "all", count: all },
      { label: "Completed", value: "completed", count: completed },
      { label: "Needs Review", value: "review_required", count: review },
      { label: "Drafts", value: "draft", count: draft },
    ];
  }, [data]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Executive Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
          <div>
            <BlurIn
              word="Operations Dashboard"
              data-testid="dashboard-title"
              duration={0.24}
              className="text-left text-xl sm:text-2xl md:text-2xl md:leading-8 font-bold tracking-tight text-neutral-900 dark:text-neutral-50"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/rmas/new">
              <ShimmerButton className="h-8.5 px-3.5 text-xs font-semibold gap-1.5">
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span>New Return (RMA)</span>
              </ShimmerButton>
            </Link>
          </div>
        </div>

        {/* 4 Executive KPI Cards - Symmetrical, Balanced, Clean */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 lg:gap-5">
          <MetricBentoCard
            title="Total Returns"
            value={kpis.totalRmas || 0}
            loading={loading}
            icon={AnimatedPackageCheck}
            iconColor="text-indigo-600 dark:text-indigo-400"
            sparklineData={data?.kpis?.trends?.rmas}
            sparklineColor="indigo"
          />

          <MetricBentoCard
            title="Screens Received"
            value={kpis.totalDisplays || 0}
            loading={loading}
            icon={AnimatedDisplayModule}
            iconColor="text-indigo-600 dark:text-indigo-400"
            sparklineData={data?.kpis?.trends?.displays}
            sparklineColor="indigo"
          />

          <MetricBentoCard
            title="Verification Rate"
            value={kpis.verificationRate || 0}
            loading={loading}
            suffix="%"
            icon={AnimatedGauge}
            iconColor="text-slate-800 dark:text-zinc-200"
            sparklineColor="slate"
          />

          <MetricBentoCard
            title="Needs Review"
            value={kpis.reviewDisplays || 0}
            loading={loading}
            icon={AnimatedAlertTriage}
            iconColor={kpis.reviewDisplays > 0 ? "text-amber-500" : "text-slate-700 dark:text-zinc-300"}
            sparklineData={data?.kpis?.trends?.review}
            sparklineColor="amber"
          />
        </div>

        {/* RMA Operational Flow Pipeline */}
        <RmaStatusPipeline stages={pipelineStages} loading={loading} />

        {/* Analytics Grid: Verified Models & Return Reasons */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {/* Card 1: Verified Models */}
          <CardSpotlight className="min-h-[280px] h-auto p-4 sm:p-5 lg:p-6 flex flex-col justify-between border-neutral-200/90 dark:border-zinc-800">
            <div className="overflow-hidden">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-100 dark:border-zinc-800">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Verified Models
                </h3>
                <Layers className="h-4 w-4 text-neutral-400" />
              </div>

              {loading ? (
                <LoadingMessage label="Loading model totals…" compact className="justify-center py-8" />
              ) : data?.modelBreakdown && data.modelBreakdown.length > 0 ? (
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {data.modelBreakdown.slice(0, 6).map((m: any, idx: number) => {
                    const maxCount = Math.max(...data.modelBreakdown.map((x: any) => x.count), 1);
                    const percentage = Math.round((m.count / maxCount) * 100);
                    const displayLabel = m.model || "Unidentified Model";

                    return (
                      <div key={idx} className="space-y-1.5 p-2 rounded-lg bg-slate-50/60 dark:bg-zinc-900/40">
                        <div className="flex items-center justify-between text-xs">
                          <span
                            className="font-medium truncate max-w-[200px] sm:max-w-xs text-neutral-800 dark:text-neutral-200"
                          >
                            {displayLabel}
                          </span>
                          <span className="font-mono text-neutral-500 dark:text-neutral-400 text-[11px]">
                            {m.count} {m.count === 1 ? "screen" : "screens"}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-neutral-200/60 dark:bg-neutral-800 rounded-sm overflow-hidden">
                          <div
                            className="h-full rounded-sm bg-indigo-600 transition-all duration-300 dark:bg-indigo-400"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 py-10 text-center">
                  No display models have been verified yet.
                </p>
              )}
            </div>
          </CardSpotlight>

          {/* Card 2: Return Reasons Breakdown */}
          <CardSpotlight className="min-h-[280px] h-auto p-4 sm:p-5 lg:p-6 flex flex-col justify-between border-neutral-200/90 dark:border-zinc-800">
            <div className="overflow-hidden">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-100 dark:border-zinc-800">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Return Reasons
                </h3>
              </div>

              {loading ? (
                <LoadingMessage label="Loading return reasons…" compact className="justify-center py-8" />
              ) : data?.reasonBreakdown && data.reasonBreakdown.length > 0 ? (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {data.reasonBreakdown.slice(0, 5).map((r: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800 text-xs"
                    >
                      <span className="font-medium text-neutral-800 dark:text-neutral-200">
                        {r.label}
                      </span>
                      <span className="font-mono text-neutral-600 dark:text-zinc-200 font-semibold px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-neutral-200/60 dark:border-zinc-700 text-[11px]">
                        {r.count} returns
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 py-10 text-center">
                  No return reasons recorded yet.
                </p>
              )}
            </div>
          </CardSpotlight>
        </div>

        {/* Recent RMA Batches Data Grid */}
        <CardSpotlight className="p-0 overflow-hidden border-neutral-200/90 dark:border-neutral-800">
          <div className="p-4 sm:p-5 flex items-center justify-between border-b border-neutral-200/80 dark:border-neutral-800">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Recent Returns
              </h3>
            </div>
            <Link
              href="/rmas?view=all"
              className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white transition-colors"
            >
              <span>View all returns</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Faceted Filter Toolbar (Dice UI) */}
          <DataTableToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            statusOptions={statusOptions}
            placeholder="Search RMA number or customer..."
          />

          {/* Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50/70 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                <tr>
                  <th className="px-5 py-3 font-semibold">RMA Number</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Screens</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Date Created</th>
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800/80">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6">
                      <LoadingMessage label="Loading recent RMAs…" compact className="justify-center" />
                    </td>
                  </tr>
                ) : recentRmas.length > 0 ? (
                  recentRmas.map((rma: any) => {
                    const isCompleted = rma.status === "completed";
                    const isReview =
                      rma.status === "review_required" || rma.status === "suggested_match";

                    return (
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
                            <span className="font-medium text-neutral-800 dark:text-neutral-200 truncate">
                              {rma.customerName || "Unnamed Customer"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono text-neutral-600 dark:text-neutral-400">
                          <span className="inline-flex items-center gap-1">
                            <AnimatedDisplayModule size={13} className="text-neutral-400" />
                            {rma.itemCount || 0} screens
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <StatusText
                            variant={
                              isCompleted ? "success" : isReview ? "warning" : "neutral"
                            }
                          >
                            {formatRmaStatus(rma.status)}
                          </StatusText>
                        </td>
                        <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400 font-mono text-[11px]">
                          {rma.createdAt ? new Date(rma.createdAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/rmas/${rma.id}`}
                            className="inline-flex items-center gap-1 font-semibold text-neutral-900 hover:text-blue-600 dark:text-neutral-100 dark:hover:text-blue-400 transition-colors"
                          >
                            <span>View</span>
                            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-neutral-400 dark:text-neutral-500"
                    >
                      {searchQuery || statusFilter !== "all"
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
