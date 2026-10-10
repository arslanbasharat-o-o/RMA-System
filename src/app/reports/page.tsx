"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusTransition } from "@/components/motion/StatusTransition";

export default function ReportsPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <AppShell>
      <div className="space-y-6 max-w-full min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Operations & Inventory Reports
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              Intake analytics, vendor distributions, and operational audit reports.
            </p>
          </div>

          <a href="/api/reports?format=csv">
            <Button size="sm" variant="primary">
              <Download className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <span>Export Full CSV</span>
            </Button>
          </a>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Verified Display Item Records ({records.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                  <tr>
                    <th className="px-5 py-3">RMA #</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Return Reason</th>
                    <th className="px-5 py-3">Display Model</th>
                    <th className="px-5 py-3">Vendor / Variant</th>
                    <th className="px-5 py-3">Match Status</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Intake Date</th>
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
                  ) : records.map((r, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                        {r.rmaNumber}
                      </td>
                      <td className="px-5 py-3 text-neutral-800 dark:text-neutral-200 font-medium">
                        {r.customerName}
                      </td>
                      <td className="px-5 py-3 text-neutral-600 dark:text-neutral-400">
                        {r.returnReason}
                      </td>
                      <td className="px-5 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                        {r.displayAssembly || (r.model ? `${r.manufacturer ? r.manufacturer + " " : ""}${r.model}` : "Unresolved")}
                      </td>
                      <td className="px-5 py-3 text-neutral-700 dark:text-neutral-300">
                        {r.vendorName || "Unresolved"}
                        {r.variantName ? ` (${r.variantName})` : ""}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="outline">{r.matchStatus}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <StatusTransition status={r.itemStatus} />
                      </td>
                      <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {!loading && records.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-8 text-center text-neutral-400 dark:text-neutral-500"
                      >
                        No report records available.
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
