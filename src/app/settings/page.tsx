"use client";

import React, { useEffect, useState, useTransition, Suspense, lazy } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Sliders, Eye, Users, Palette } from "lucide-react";

// Lazy-load tabs for optimal performance and code splitting
const GeneralTab = lazy(() =>
  import("@/components/settings/GeneralTab").then((m) => ({ default: m.GeneralTab }))
);
const ProvidersTab = lazy(() =>
  import("@/components/settings/ProvidersTab").then((m) => ({ default: m.ProvidersTab }))
);
const StaffTab = lazy(() =>
  import("@/components/settings/StaffTab").then((m) => ({ default: m.StaffTab }))
);
const AppearanceTab = lazy(() =>
  import("@/components/settings/AppearanceTab").then((m) => ({ default: m.AppearanceTab }))
);

function TabFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("general");

  // Form states
  const [lensProvider, setLensProvider] = useState("mock");
  const [lensFilterQuery, setLensFilterQuery] = useState("display screen");
  const [openaiModel, setOpenaiModel] = useState("gpt-5.6-terra");
  const [timezone, setTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);

  // Connection testing states
  const [testingLens, setTestingLens] = useState(false);
  const [testingOpenAi, setTestingOpenAi] = useState(false);
  const [lensTestResult, setLensTestResult] = useState<{
    success?: boolean;
    durationMs?: number;
    message?: string;
  } | null>(null);
  const [openAiTestResult, setOpenAiTestResult] = useState<{
    success?: boolean;
    durationMs?: number;
    message?: string;
  } | null>(null);

  // Staff users list
  const [usersList, setUsersList] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLensProvider(json.settings?.LENS_PROVIDER || "mock");
        setLensFilterQuery(
          json.settings?.LENS_FILTER_QUERY ||
            json.providerStatus?.activeLensFilterQuery ||
            "display screen"
        );
        setOpenaiModel(json.settings?.OPENAI_VISION_MODEL || "gpt-5.6-terra");
        setTimezone(json.settings?.BUSINESS_TIMEZONE || "UTC");
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setUsersList(json.users || []);
      }
    } catch (err) {
      console.error("Failed to load staff users:", err);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchUsers();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          LENS_PROVIDER: lensProvider,
          LENS_FILTER_QUERY: lensFilterQuery,
          OPENAI_VISION_MODEL: openaiModel,
          BUSINESS_TIMEZONE: timezone,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update settings");
      toast.success("Settings saved successfully.");
      fetchSettings();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (provider: "lens" | "openai") => {
    if (provider === "lens") {
      setTestingLens(true);
      setLensTestResult(null);
    }
    if (provider === "openai") {
      setTestingOpenAi(true);
      setOpenAiTestResult(null);
    }

    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = await res.json();

      if (provider === "lens") {
        setLensTestResult({
          success: json.success,
          durationMs: json.durationMs,
          message: json.message,
        });
      } else {
        setOpenAiTestResult({
          success: json.success,
          durationMs: json.durationMs,
          message: json.message,
        });
      }

      if (json.success) {
        toast.success(provider === "lens" ? "Google Lens connection verified" : "OpenAI Vision connection verified");
      } else {
        toast.error(json.message);
      }
    } catch {
      toast.error("Connection test failed");
    } finally {
      setTestingLens(false);
      setTestingOpenAi(false);
    }
  };

  const providerStatus = data?.providerStatus || {};

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            System Settings
          </h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full sm:w-auto flex-wrap sm:flex-nowrap">
            <TabsTrigger value="general" className="flex-1 sm:flex-none">
              <Sliders className="h-3.5 w-3.5 mr-1" />
              <span>General</span>
            </TabsTrigger>
            <TabsTrigger value="providers" className="flex-1 sm:flex-none">
              <Eye className="h-3.5 w-3.5 mr-1" />
              <span>Recognition Providers</span>
            </TabsTrigger>
            <TabsTrigger value="staff" className="flex-1 sm:flex-none">
              <Users className="h-3.5 w-3.5 mr-1" />
              <span>Staff & Access</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex-1 sm:flex-none">
              <Palette className="h-3.5 w-3.5 mr-1" />
              <span>Appearance</span>
            </TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="space-y-4 pt-2">
              <TabFallback />
            </div>
          ) : (
            <>
              <TabsContent value="general">
                <Suspense fallback={<TabFallback />}>
                  <GeneralTab
                    timezone={timezone}
                    setTimezone={setTimezone}
                    onSave={handleSave}
                    saving={saving}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="providers">
                <Suspense fallback={<TabFallback />}>
                  <ProvidersTab
                    lensProvider={lensProvider}
                    setLensProvider={setLensProvider}
                    lensFilterQuery={lensFilterQuery}
                    setLensFilterQuery={setLensFilterQuery}
                    openaiModel={openaiModel}
                    setOpenaiModel={setOpenaiModel}
                    status={providerStatus}
                    testingLens={testingLens}
                    testingOpenAi={testingOpenAi}
                    lensTestResult={lensTestResult}
                    openAiTestResult={openAiTestResult}
                    onTestConnection={handleTestConnection}
                    onSave={handleSave}
                    saving={saving}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="staff">
                <Suspense fallback={<TabFallback />}>
                  <StaffTab
                    usersList={usersList}
                    loading={usersLoading}
                    onRefresh={fetchUsers}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="appearance">
                <Suspense fallback={<TabFallback />}>
                  <AppearanceTab />
                </Suspense>
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </AppShell>
  );
}
