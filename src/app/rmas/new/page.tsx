"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ArrowLeft, Plus, Camera, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
  cardEntranceVariants,
  errorAlertVariants,
  accordionVariants,
} from "@/lib/motion/variants";

export default function CreateRmaPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<any[]>([]);
  const [returnReasons, setReturnReasons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form Fields
  const [customerId, setCustomerId] = useState("");
  const [returnReasonId, setReturnReasonId] = useState("");
  const [returnReasonNotes, setReturnReasonNotes] = useState("");
  const [externalRmaNumber, setExternalRmaNumber] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [expectedDisplayCount, setExpectedDisplayCount] = useState<number | "">("");
  const [notes, setNotes] = useState("");

  // Quick Add Customer Modal
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [quickCustomerSaving, setQuickCustomerSaving] = useState(false);

  useEffect(() => {
    async function initData() {
      try {
        const [cRes, rRes] = await Promise.all([
          fetch("/api/customers"),
          fetch("/api/return-reasons"),
        ]);
        const cJson = await cRes.json();
        const rJson = await rRes.json();

        setCustomers(cJson.customers || []);
        setReturnReasons(rJson.returnReasons || []);

        if (cJson.customers?.length > 0) {
          setCustomerId(cJson.customers[0].id);
        }
        if (rJson.returnReasons?.length > 0) {
          setReturnReasonId(rJson.returnReasons[0].id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    initData();
  }, []);

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) return;

    setQuickCustomerSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCustomerName,
          email: newCustomerEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCustomers((prev) => [data.customer, ...prev]);
      setCustomerId(data.customer.id);
      setShowQuickCustomer(false);
      setNewCustomerName("");
      setNewCustomerEmail("");
      toast.success(`Customer '${data.customer.name}' created and selected.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add customer");
    } finally {
      setQuickCustomerSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !returnReasonId) {
      setErrorMessage("Please select a customer and return reason.");
      toast.error("Please select a customer and return reason.");
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/rmas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          returnReasonId,
          returnReasonNotes: returnReasonNotes || undefined,
          externalRmaNumber: externalRmaNumber || undefined,
          trackingNumber: trackingNumber || undefined,
          expectedDisplayCount: expectedDisplayCount ? Number(expectedDisplayCount) : undefined,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create RMA");

      toast.success(`RMA ${data.rma.rmaNumber} created successfully!`);
      // Open the display capture workflow directly
      router.push(`/rmas/${data.rma.id}/capture`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create RMA";
      setErrorMessage(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  };

  const selectedReason = returnReasons.find((r) => r.id === returnReasonId);
  const isOtherReason = selectedReason?.code === "OTHER";

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back Link */}
        <div>
          <Link
            href="/rmas"
            className="inline-flex items-center text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            <span>Back to RMA Shipments</span>
          </Link>
        </div>

        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Create RMA Intake
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Register a new return shipment and begin item intake.
          </p>
        </div>

        {/* Intake Form */}
        <motion.div
          variants={cardEntranceVariants}
          initial="hidden"
          animate="visible"
        >
          <Card>
            <CardContent className="p-6">
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Inline Error Banner */}
                  <AnimatePresence>
                    {errorMessage && (
                      <motion.div
                        variants={errorAlertVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                          <span>{errorMessage}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setErrorMessage(null)}
                          className="text-red-500 hover:text-red-700 dark:hover:text-red-300 text-xs font-bold"
                          aria-label="Dismiss error"
                        >
                          &times;
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Customer Selector */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                        Customer / Business Name *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowQuickCustomer(true)}
                        className="text-xs text-neutral-900 dark:text-neutral-100 hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Quick Add Customer</span>
                      </button>
                    </div>
                    <Select
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      required
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.contactName ? `(${c.contactName})` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* Return Reason Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                      Return Reason *
                    </label>
                    <Select
                      value={returnReasonId}
                      onChange={(e) => setReturnReasonId(e.target.value)}
                      required
                    >
                      {returnReasons.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* Other Reason Explanation */}
                  <AnimatePresence>
                    {isOtherReason && (
                      <motion.div
                        variants={accordionVariants}
                        initial="collapsed"
                        animate="expanded"
                        exit="collapsed"
                        className="overflow-hidden"
                      >
                        <div className="pt-1">
                          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                            Explain Return Reason *
                          </label>
                          <Input
                            placeholder="Provide details about return reason..."
                            value={returnReasonNotes}
                            onChange={(e) => setReturnReasonNotes(e.target.value)}
                            required
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                {/* Optional Fields Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      External RMA # (Optional)
                    </label>
                    <Input
                      placeholder="e.g. CUST-RMA-8841"
                      value={externalRmaNumber}
                      onChange={(e) => setExternalRmaNumber(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Return Tracking # (Optional)
                    </label>
                    <Input
                      placeholder="e.g. 1Z9999999999999999"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Expected Display Count (Optional)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="e.g. 25"
                      value={expectedDisplayCount}
                      onChange={(e) =>
                        setExpectedDisplayCount(
                          e.target.value ? parseInt(e.target.value) : ""
                        )
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Internal Notes (Optional)
                    </label>
                    <Input
                      placeholder="Package condition, special instructions..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    RMA sequence identifier assigned automatically upon creation.
                  </span>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={submitting}
                    className="gap-2 shrink-0 w-full sm:w-auto h-10 px-4 text-xs sm:text-sm font-medium"
                  >
                    <Camera className="h-4 w-4 shrink-0" />
                    <span>Create RMA & Open Scanner</span>
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
        </motion.div>

        {/* Quick Add Customer Modal */}
        <Modal
          isOpen={showQuickCustomer}
          onClose={() => setShowQuickCustomer(false)}
          title="Quick Add Customer"
          description="Add a customer record without losing current intake form progress."
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleQuickAddCustomer} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Business or Customer Name *
              </label>
              <Input
                required
                placeholder="e.g. FastFix Direct"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Email Address (Optional)
              </label>
              <Input
                type="email"
                placeholder="returns@fastfix.com"
                value={newCustomerEmail}
                onChange={(e) => setNewCustomerEmail(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowQuickCustomer(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={quickCustomerSaving}
              >
                Save Customer
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
