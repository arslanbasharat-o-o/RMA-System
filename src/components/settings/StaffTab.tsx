"use client";

import React, { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, UserPlus, Search, Shield, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  active: boolean;
  createdAt?: string;
}

interface StaffTabProps {
  usersList: StaffUser[];
  loading: boolean;
  onRefresh: () => void;
}

export function StaffTab({ usersList, loading, onRefresh }: StaffTabProps) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // New user state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "operator" | "viewer">("operator");
  const [password, setPassword] = useState("");

  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [usersList, search, roleFilter]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, password }),
      });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create user");

      toast.success("Staff account created successfully.");
      setName("");
      setEmail("");
      setPassword("");
      setRole("operator");
      setShowAddModal(false);
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Creation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    setTogglingId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentActive }),
      });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }
      toast.success(`Account ${!currentActive ? "activated" : "deactivated"}.`);
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update account status");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="p-5 sm:p-6 pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-neutral-500" />
                <span>Staff & Access Management</span>
              </CardTitle>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => setShowAddModal(true)}
              className="gap-1.5 self-start sm:self-auto shrink-0"
            >
              <UserPlus className="h-3.5 w-3.5 shrink-0" />
              <span>Add Staff Account</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 pt-4 space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff by name or email..."
                className="pl-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {["all", "admin", "operator", "viewer"].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer shrink-0 ${
                    roleFilter === r
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Directory Content */}
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                No staff accounts found matching your filters.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
              {filteredUsers.map((u) => {
                const isToggling = togglingId === u.id;
                const initials = u.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-3.5 bg-white dark:bg-[#121215] hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors text-xs gap-3"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="h-8 w-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 flex items-center justify-center font-bold text-xs shrink-0 border border-neutral-200 dark:border-neutral-700">
                        {initials}
                      </span>
                      <span className="min-w-0 block">
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                            {u.name}
                          </span>
                          <Badge
                            variant={
                              u.role === "admin"
                                ? "default"
                                : u.role === "operator"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {u.role}
                          </Badge>
                          {!u.active && (
                            <Badge variant="danger">Inactive</Badge>
                          )}
                        </span>
                        <p className="text-neutral-500 dark:text-neutral-400 text-[11px] font-mono truncate mt-0.5">
                          {u.email}
                        </p>
                      </span>
                    </span>

                    <span className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={isToggling}
                        onClick={() => handleToggleActive(u.id, u.active)}
                        className={
                          u.active
                            ? "text-neutral-500 hover:text-rose-600 dark:hover:text-rose-400 text-xs"
                            : "text-emerald-600 dark:text-emerald-400 text-xs"
                        }
                      >
                        {u.active ? "Deactivate" : "Activate"}
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Staff Account Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Staff Account"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              Full Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah Connor"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              Email Address
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@rma-platform.internal"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              Access Role
            </label>
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
            >
              <option value="operator">Operator (RMA intake, scanning, queue verification)</option>
              <option value="admin">Administrator (Full catalog, settings, staff management)</option>
              <option value="viewer">Viewer (Read-only reports and dashboards)</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              Initial Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
            >
              Create Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
