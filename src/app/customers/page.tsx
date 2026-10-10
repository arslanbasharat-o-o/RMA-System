"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Plus, Search, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

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

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/customers${q}`);
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setCustomers(json.customers || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

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
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Customer Directory
          </h1>

          <Button size="sm" variant="primary" onClick={() => setShowAddModal(true)} className="h-8.5 sm:h-9 text-xs shrink-0">
            <Plus className="h-3.5 w-3.5 mr-1 shrink-0" />
            <span>Add Customer</span>
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  placeholder="Search customer name or contact person..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchCustomers()}
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchCustomers}>
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Customers Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                  <tr>
                    <th className="px-5 py-3">Business Name</th>
                    <th className="px-5 py-3">Contact Person</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Phone</th>
                    <th className="px-5 py-3">Notes</th>
                    <th className="px-5 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-6">
                        <Skeleton className="h-5 w-full my-1.5" />
                        <Skeleton className="h-5 w-full my-1.5" />
                        <Skeleton className="h-5 w-full my-1.5" />
                      </td>
                    </tr>
                  ) : customers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="px-5 py-3 font-semibold text-neutral-900 dark:text-neutral-100">
                        {c.name}
                      </td>
                      <td className="px-5 py-3 text-neutral-700 dark:text-neutral-300">
                        {c.contactName || "—"}
                      </td>
                      <td className="px-5 py-3 text-neutral-600 dark:text-neutral-400 font-mono">
                        {c.email || "—"}
                      </td>
                      <td className="px-5 py-3 text-neutral-600 dark:text-neutral-400">
                        {c.phone || "—"}
                      </td>
                      <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400 max-w-xs truncate">
                        {c.notes || "—"}
                      </td>
                      <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {!loading && customers.length === 0 && (
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
          </CardContent>
        </Card>

        {/* Modal: Add Customer */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Add New Customer"
          maxWidth="max-w-md"
        >
          <form onSubmit={handleCreateCustomer} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Business Name *
              </label>
              <Input
                required
                placeholder="e.g. Apex Mobile Repairs"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Contact Person
              </label>
              <Input
                placeholder="e.g. David Miller"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="david@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Phone
                </label>
                <Input
                  placeholder="+44 20 7946 0912"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Notes
              </label>
              <Input
                placeholder="Wholesale terms, return rates..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={saving}
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
