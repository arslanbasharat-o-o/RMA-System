"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  PackageCheck,
  Smartphone,
  TrendingUp,
  AlertCircle,
  Plus,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { MotionCardGrid, MotionCardItem } from "@/components/motion/CardMotion";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
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
    }
    fetchDashboard();
  }, []);

  const kpis = data?.kpis || {
    totalRmas: 0,
    totalDisplays: 0,
    verifiedDisplays: 0,
    reviewDisplays: 0,
    verificationRate: 0,
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Title & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Operations Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              Intake throughput, operational metrics, and verification queue.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/rmas/new">
              <Button size="sm" variant="primary" className="gap-1.5">
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span>New RMA Intake</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Real KPI Cards */}
        <MotionCardGrid className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MotionCardItem>
            <Card>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Total RMAs
                  </CardDescription>
                  <PackageCheck className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                </div>
                <CardTitle className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <AnimatedNumber value={kpis.totalRmas || 0} />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  Total intake batches recorded
                </span>
              </CardContent>
            </Card>
          </MotionCardItem>

          <MotionCardItem>
            <Card>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Displays Received
                  </CardDescription>
                  <Smartphone className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                </div>
                <CardTitle className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <AnimatedNumber value={kpis.totalDisplays || 0} />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  Individual display panels
                </span>
              </CardContent>
            </Card>
          </MotionCardItem>

          <MotionCardItem>
            <Card>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Verification Rate
                  </CardDescription>
                  <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {loading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <>
                      <AnimatedNumber value={kpis.verificationRate || 0} />%
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  {loading ? (
                    <Skeleton className="h-3.5 w-28" />
                  ) : (
                    <>
                      <AnimatedNumber value={kpis.verifiedDisplays || 0} /> of{" "}
                      <AnimatedNumber value={kpis.totalDisplays || 0} /> verified
                    </>
                  )}
                </span>
              </CardContent>
            </Card>
          </MotionCardItem>

          <MotionCardItem>
            <Card>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Awaiting Review
                  </CardDescription>
                  <AlertCircle className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                </div>
                <CardTitle className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <AnimatedNumber value={kpis.reviewDisplays || 0} />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Link
                  href="/review-queue?view=all"
                  className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline font-medium"
                >
                  Open Review Queue &rarr;
                </Link>
              </CardContent>
            </Card>
          </MotionCardItem>
        </MotionCardGrid>

        {/* Analytical Breakdowns */}
        <MotionCardGrid className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top Vendors */}
          <MotionCardItem className="lg:col-span-1">
            <Card className="h-full">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Vendor Distribution
              </CardTitle>
              <CardDescription className="text-xs">
                Recognized display suppliers
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-2.5">
              {loading ? (
                <div className="space-y-2 py-1">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : data?.vendorBreakdown?.length > 0 ? (
                data.vendorBreakdown.map((v: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">
                      {v.name}
                    </span>
                    <span className="font-mono text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
                      {v.count} screens
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 py-3">
                  No display data recorded yet.
                </p>
              )}
            </CardContent>
          </Card>
          </MotionCardItem>

          {/* Top Display Models */}
          <MotionCardItem className="lg:col-span-1">
            <Card className="h-full">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Top Returned Models
              </CardTitle>
              <CardDescription className="text-xs">
                Smartphone screen models
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-2.5">
              {loading ? (
                <div className="space-y-2 py-1">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : data?.modelBreakdown?.length > 0 ? (
                data.modelBreakdown.map((m: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">
                      {m.model}
                    </span>
                    <span className="font-mono text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
                      {m.count}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 py-3">
                  No display models identified yet.
                </p>
              )}
            </CardContent>
          </Card>
          </MotionCardItem>

          {/* Return Reasons */}
          <MotionCardItem className="lg:col-span-1">
            <Card className="h-full">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Return Reasons
              </CardTitle>
              <CardDescription className="text-xs">
                Reported defect breakdown
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-2.5">
              {loading ? (
                <div className="space-y-2 py-1">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : data?.reasonBreakdown?.length > 0 ? (
                data.reasonBreakdown.map((r: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">
                      {r.label}
                    </span>
                    <span className="font-mono text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
                      {r.count} RMAs
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 py-3">
                  No return reasons recorded.
                </p>
              )}
            </CardContent>
          </Card>
          </MotionCardItem>
        </MotionCardGrid>

        {/* Recent RMAs Table */}
        <Card>
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Recent RMA Batches
                </CardTitle>
                <CardDescription className="text-xs">
                  Most recent returned shipments
                </CardDescription>
              </div>
              <Link
                href="/rmas?view=all"
                className="text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 font-medium"
              >
                View all RMAs &rarr;
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                  <tr>
                    <th className="px-5 py-2.5">RMA Number</th>
                    <th className="px-5 py-2.5">Customer</th>
                    <th className="px-5 py-2.5">Displays</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-5 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-6">
                        <Skeleton className="h-5 w-full my-1" />
                        <Skeleton className="h-5 w-full my-1" />
                        <Skeleton className="h-5 w-full my-1" />
                      </td>
                    </tr>
                  ) : data?.recentRmas?.map((rma: any) => (
                    <tr
                      key={rma.id}
                      className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="px-5 py-3 font-semibold text-neutral-900 dark:text-neutral-100 font-mono">
                        {rma.rmaNumber}
                      </td>
                      <td className="px-5 py-3 text-neutral-700 dark:text-neutral-300">
                        {rma.customerName}
                      </td>
                      <td className="px-5 py-3 font-mono text-neutral-600 dark:text-neutral-400">
                        {rma.itemCount || 0} screens
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          variant={
                            rma.status === "completed"
                              ? "success"
                              : rma.status === "review_required"
                              ? "warning"
                              : "secondary"
                          }
                        >
                          {rma.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                        {new Date(rma.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/rmas/${rma.id}`}
                          className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline"
                        >
                          View &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!loading && (!data?.recentRmas || data.recentRmas.length === 0) && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-6 text-center text-neutral-400 dark:text-neutral-500"
                      >
                        No RMA batches recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
