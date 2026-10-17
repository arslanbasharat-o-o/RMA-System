"use client";

import React, { useEffect, useState, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Plus, Search, Building2, Mail, Phone, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CardSpotlight,
  CopyBadge,
  ShimmerButton,
} from "@/components/premium";

interface Customer {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // New customer form
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const listRequest = useRef<AbortController | null>(null);

  const fetchCustomers = async () => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/customers${q}`, { signal: controller.signal });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (res.ok) {
        const json = await res.json();
        if (!controller.signal.aborted) setCustomers(json.customers || []);
      }
    } catch (err) {
      if (!controller.signal.aborted) console.error(err);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 250);
    return () => { clearTimeout(timer); listRequest.current?.abort(); };
  }, [search]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contactName, email, phone, notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create customer");

      toast.success(`Customer "${name}" created.`);
      setName("");
      setContactName("");
      setEmail("");
      setPhone("");
      setNotes("");
      setShowAddModal(false);
      fetchCustomers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Creation failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Executive Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              Customer Directory
            </h1>
          </div>

          <ShimmerButton
            onClick={() => setShowAddModal(true)}
            className="h-8.5 px-3.5 text-xs font-semibold gap-1.5 self-start sm:self-auto"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span>Add Customer</span>
          </ShimmerButton>
        </div>

        {/* Search Toolbar */}
        <CardSpotlight className="p-3 bg-neutral-50/70 dark:bg-neutral-900/40">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search customer name or contact person..."
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

        {/* Mobile View: High-Density Customer Cards */}
        <div className="sm:hidden space-y-3">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : customers.length > 0 ? (
            customers.map((c) => (
              <div
                key={c.id}
                className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-neutral-200/90 dark:border-neutral-800 shadow-xs space-y-2.5"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/60 dark:border-neutral-700/60 flex items-center justify-center font-bold text-xs text-neutral-800 dark:text-neutral-200 shrink-0">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                      {c.name}
                    </h4>
                    {c.contactName && (
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                        <User className="h-3 w-3 text-neutral-400" />
                        <span>{c.contactName}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-100 dark:border-zinc-800 space-y-1 text-xs">
                  {c.email && (
                    <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400 font-mono text-[11px]">
                      <span className="flex items-center gap-1.5 truncate">
                        <Mail className="h-3 w-3 text-neutral-400 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </span>
                      <CopyBadge value={c.email} label="Copy" />
                    </div>
                  )}

                  {c.phone && (
                    <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400 text-[11px]">
                      <span className="flex items-center gap-1.5 font-mono">
                        <Phone className="h-3 w-3 text-neutral-400 shrink-0" />
                        <span>{c.phone}</span>
                      </span>
                      <CopyBadge value={c.phone} label="Copy" />
                    </div>
                  )}

                  {c.notes && (
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 pt-1 italic">
                      "{c.notes}"
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-neutral-400 dark:text-neutral-500 bg-white dark:bg-[#121215] rounded-xl border border-neutral-200 dark:border-neutral-800">
              No customers found.
            </div>
          )}
        </div>

        {/* Desktop View: Polished Data Table */}
        <CardSpotlight className="hidden sm:block p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50/80 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                <tr>
                  <th className="px-5 py-3 font-semibold">Business Name</th>
                  <th className="px-5 py-3 font-semibold">Contact Person</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Phone</th>
                  <th className="px-5 py-3 font-semibold">Notes</th>
                  <th className="px-5 py-3 font-semibold">Date Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800/80">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6">
                      <Skeleton className="h-5 w-full my-1.5" />
                      <Skeleton className="h-5 w-full my-1.5" />
                      <Skeleton className="h-5 w-full my-1.5" />
                    </td>
                  </tr>
                ) : customers.length > 0 ? (
                  customers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-neutral-50/60 dark:hover:bg-zinc-800/40 transition-colors group"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/60 dark:border-neutral-700/60 flex items-center justify-center font-bold text-[10px] text-neutral-800 dark:text-neutral-200 shrink-0">
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {c.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-neutral-700 dark:text-neutral-300 font-medium">
                        {c.contactName || "—"}
                      </td>
                      <td className="px-5 py-3 text-neutral-600 dark:text-neutral-400 font-mono">
                        {c.email ? (
                          <CopyBadge value={c.email} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3 text-neutral-600 dark:text-neutral-400 font-mono">
                        {c.phone ? (
                          <CopyBadge value={c.phone} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400 max-w-xs truncate">
                        {c.notes || "—"}
                      </td>
                      <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400 font-mono text-[11px]">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-neutral-400 dark:text-neutral-500"
                    >
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardSpotlight>

        {/* Modal: Add Customer */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Add New Customer"
          maxWidth="max-w-md"
        >
          <form onSubmit={handleCreateCustomer} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Business Name *
              </label>
              <Input
                required
                placeholder="e.g. Apex Mobile Repairs"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Contact Person
              </label>
              <Input
                placeholder="e.g. David Miller"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="david@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Phone
                </label>
                <Input
                  placeholder="+44 20 7946 0912"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Notes
              </label>
              <Input
                placeholder="Wholesale terms, return rates..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 text-xs"
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
                Save Customer
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
