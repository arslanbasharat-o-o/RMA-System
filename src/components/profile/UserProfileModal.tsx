"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { APP_VERSION } from "@/lib/version";
import { AlertCircle } from "lucide-react";
import {
  AnimatedKey,
  AnimatedLogout,
  AnimatedEye,
  AnimatedCheckCircle,
} from "@/components/icons/AnimatedIcons";
import { toast } from "sonner";

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    id?: string;
    name: string;
    email: string;
    role: string;
  } | null;
  onProfileUpdated?: (updated: { name: string }) => void;
  onLogout: () => void;
}

export function UserProfileModal({
  isOpen,
  onClose,
  currentUser,
  onProfileUpdated,
  onLogout,
}: UserProfileModalProps) {
  const [name, setName] = useState(currentUser?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  // Reset local state when opened
  React.useEffect(() => {
    if (isOpen) {
      setName(currentUser?.name || "");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrorMessage(null);
      setSuccessMessage(null);
      setConfirmingLogout(false);
    }
  }, [isOpen, currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!name.trim()) {
      setErrorMessage("Name cannot be empty.");
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        setErrorMessage("New password must be at least 6 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMessage("New passwords do not match.");
        return;
      }
      if (!currentPassword) {
        setErrorMessage("Please enter your current password to set a new password.");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile.");
      }

      setSuccessMessage(data.message || "Profile updated successfully.");
      toast.success(data.message || "Profile updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      if (onProfileUpdated) {
        onProfileUpdated({ name: name.trim() });
      }
      if (newPassword) {
        onClose();
        onLogout();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error updating profile.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const initials = (currentUser?.name || "U")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Your Account"
      maxWidth="max-w-lg"
    >
      <div className="space-y-5">
        {/* User Identity Header Card */}
        <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
              {initials}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {currentUser?.name || "User"}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate">
                {currentUser?.email || "user@rma-platform.local"}
              </p>
            </div>
          </div>
          <Badge
            variant={currentUser?.role === "admin" ? "default" : "secondary"}
            className="capitalize text-xs font-mono shrink-0"
          >
            {currentUser?.role || "operator"}
          </Badge>
        </div>

        {/* Feedback Banners */}
        {errorMessage && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <AnimatedCheckCircle size={16} className="text-emerald-600 dark:text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Profile Update Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Display Name
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full Name"
              required
              className="text-xs"
            />
          </div>

          {/* Password Update Section */}
          <div className="p-3.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              <AnimatedKey size={15} className="text-neutral-500 shrink-0" />
              <span>Change Password</span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Current Password
              </label>
              <div className="relative">
                <Input
                  type={showCurrentPass ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Required only to set a new password"
                  className="text-xs pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                  tabIndex={-1}
                >
                  <AnimatedEye size={15} visible={showCurrentPass} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <Input
                    type={showNewPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="text-xs pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                    tabIndex={-1}
                  >
                    <AnimatedEye size={15} visible={showNewPass} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Confirm New Password
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="submit"
              size="sm"
              variant="primary"
              loading={saving}
              className="w-full sm:w-auto"
            >
              Save Changes
            </Button>
          </div>
        </form>

        <div className="pt-4 border-t border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
          <span>App version</span>
          <Badge variant="outline">v{APP_VERSION.version}</Badge>
        </div>

        {/* Explicit Prominent Log Out Section */}
        <div className="pt-4 border-t border-neutral-200/80 dark:border-neutral-800">
          {!confirmingLogout ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingLogout(true)}
              className="w-full text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 gap-2 h-9 text-xs font-semibold justify-center"
            >
              <AnimatedLogout size={16} className="shrink-0" />
              <span>Log Out</span>
            </Button>
          ) : (
            <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-2.5">
              <div className="flex items-center gap-2">
                <AnimatedLogout size={16} className="text-rose-600 dark:text-rose-400 shrink-0" />
                <p className="text-xs font-medium text-rose-800 dark:text-rose-300">
                  Are you sure you want to log out?
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={onLogout}
                  className="bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-600 dark:text-white text-xs h-8 gap-1.5"
                >
                  <AnimatedLogout size={14} />
                  <span>Yes, Log Out</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmingLogout(false)}
                  className="text-xs h-8"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
