"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Plus, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusTransition } from "@/components/motion/StatusTransition";

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

  const fetchRmas = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search.trim());
      if (statusFilter !== "all") params.append("status", statusFilter);

      const res = await fetch(`/api/rmas?${params.toString()}`);
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setRmas(json.rmas || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRmas();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRmas();
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              RMA Shipments
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              Active return merchandise authorizations and batch workflows.
            </p>
          </div>

          <Link href="/rmas/new">
            <Button size="sm" variant="primary">
              <Plus className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <span>Create RMA</span>
            </Button>
          </Link>
        </div>

        {/* Filter Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <form onSubmit={handleSearchSubmit} className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  placeholder="Search RMA #, customer, tracking number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </form>

              <div className="flex items-center gap-2">
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  wrapperClassName="w-40 sm:w-44"
                >
                  <option value="all">All Statuses</option>
                  <option value="receiving">Receiving</option>
                  <option value="processing">Processing</option>
                  <option value="review_required">Review Required</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </Select>

                <Button variant="outline" size="sm" onClick={fetchRmas}>
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mobile View: Cards */}
        <div className="sm:hidden space-y-3">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : rmas.map((rma) => (
            <div
              key={rma.id}
              className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-neutral-200/90 dark:border-neutral-800 shadow-xs space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-xs text-neutral-900 dark:text-neutral-100">
                  {rma.rmaNumber}
                </span>
                <StatusTransition status={rma.status} />
              </div>
              <div className="text-xs">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {rma.customerName}
                </span>
                <span className="text-neutral-400 mx-1.5">·</span>
                <span className="text-neutral-500 dark:text-neutral-400">
                  {rma.returnReasonLabel || "Unspecified"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <span className="font-mono text-[11px]">
                  Displays: <strong className="text-neutral-900 dark:text-neutral-100">{rma.verifiedItems || 0}</strong>/{rma.totalItems || 0}
                  {rma.reviewRequiredItems > 0 && (
                    <span className="ml-1 text-amber-700 dark:text-amber-400">
                      ({rma.reviewRequiredItems} rev)
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/rmas/${rma.id}/capture`}
                    className="text-xs text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white font-medium py-1 px-2 rounded bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                  >
                    Scan
                  </Link>
                  <Link
                    href={`/rmas/${rma.id}`}
                    className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 hover:underline"
                  >
                    Details &rarr;
                  </Link>
                </div>
              </div>
            </div>
          ))}
          {rmas.length === 0 && !loading && (
            <div className="p-8 text-center text-xs text-neutral-400 dark:text-neutral-500 bg-white dark:bg-[#121215] rounded-xl border border-neutral-200 dark:border-neutral-800">
              No RMAs matched the search criteria.
            </div>
          )}
        </div>

        {/* Desktop View: Table */}
        <Card className="hidden sm:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                  <tr>
                    <th className="px-5 py-3">RMA Identifier</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Return Reason</th>
                    <th className="px-5 py-3">Displays (Verified / Total)</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Tracking #</th>
                    <th className="px-5 py-3">Created</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-6">
                        <Skeleton className="h-5 w-full my-1.5" />
                        <Skeleton className="h-5 w-full my-1.5" />
                        <Skeleton className="h-5 w-full my-1.5" />
                      </td>
                    </tr>
                  ) : rmas.map((rma) => (
                    <tr
                      key={rma.id}
                      className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="px-5 py-3 font-semibold text-neutral-900 dark:text-neutral-100 font-mono">
                        {rma.rmaNumber}
                      </td>
                      <td className="px-5 py-3 font-medium text-neutral-800 dark:text-neutral-200">
                        {rma.customerName}
                      </td>
                      <td className="px-5 py-3 text-neutral-600 dark:text-neutral-400">
                        {rma.returnReasonLabel || "Unspecified"}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-neutral-900 dark:text-neutral-100 font-semibold">
                          {rma.verifiedItems || 0}
                        </span>
                        <span className="text-neutral-400 dark:text-neutral-500"> / {rma.totalItems || 0}</span>
                        {rma.reviewRequiredItems > 0 && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-medium">
                            {rma.reviewRequiredItems} need review
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <StatusTransition status={rma.status} />
                      </td>
                      <td className="px-5 py-3 font-mono text-neutral-500 dark:text-neutral-400">
                        {rma.trackingNumber || "—"}
                      </td>
                      <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                        {new Date(rma.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/rmas/${rma.id}/capture`}
                            className="text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 font-medium"
                          >
                            Scan
                          </Link>
                          <span className="text-neutral-300 dark:text-neutral-700">·</span>
                          <Link
                            href={`/rmas/${rma.id}`}
                            className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 hover:underline"
                          >
                            Details &rarr;
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && rmas.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-neutral-400 dark:text-neutral-500">
                        No RMAs matched the search criteria.
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
