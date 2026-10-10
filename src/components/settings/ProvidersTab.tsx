"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Eye, Sparkles, Activity, CheckCircle2, AlertCircle } from "lucide-react";

interface ProviderStatus {
  activeLensProvider?: string;
  activeLensFilterQuery?: string;
  activeOpenAiModel?: string;
  serpapiConfigured?: boolean;
  openaiConfigured?: boolean;
}

interface TestResult {
  durationMs?: number;
  message?: string;
  success?: boolean;
}

interface ProvidersTabProps {
  lensProvider: string;
  setLensProvider: (val: string) => void;
  lensFilterQuery: string;
  setLensFilterQuery: (val: string) => void;
  openaiModel: string;
  setOpenaiModel: (val: string) => void;
  status: ProviderStatus;
  testingLens: boolean;
  testingOpenAi: boolean;
  lensTestResult: TestResult | null;
  openAiTestResult: TestResult | null;
  onTestConnection: (provider: "lens" | "openai") => void;
  onSave: (e: React.FormEvent) => void;
  saving: boolean;
}

const FILTER_PRESETS = [
  "display screen",
  "replacement screen",
  "phone screen assembly",
  "lcd digitizer",
];

export function ProvidersTab({
  lensProvider,
  setLensProvider,
  lensFilterQuery,
  setLensFilterQuery,
  openaiModel,
  setOpenaiModel,
  status,
  testingLens,
  testingOpenAi,
  lensTestResult,
  openAiTestResult,
  onTestConnection,
  onSave,
  saving,
}: ProvidersTabProps) {
  return (
    <div className="space-y-6">
      {/* Live Provider Health Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Visual Recognition Card */}
        <Card>
          <CardHeader className="p-4 sm:p-5 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                  Google Lens Visual Recognition
                </CardTitle>
              </div>
              <Badge variant={status.serpapiConfigured ? "success" : "secondary"}>
                {status.serpapiConfigured ? "API Key Configured" : "Unconfigured"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-1 space-y-3">
            <div className="text-xs space-y-1">
              <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                <span>Active Provider:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {status.activeLensProvider || lensProvider}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                <span>Query Filter:</span>
                <span className="font-mono font-medium text-neutral-900 dark:text-white">
                  {status.activeLensFilterQuery || lensFilterQuery || "None"}
                </span>
              </div>
            </div>

            {lensTestResult && (
              <div
                className={`p-2.5 rounded-md text-xs flex items-start gap-2 ${
                  lensTestResult.success
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                    : "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60"
                }`}
              >
                {lensTestResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{lensTestResult.message}</p>
                  {lensTestResult.durationMs !== undefined && (
                    <p className="text-[11px] opacity-80 mt-0.5">
                      Roundtrip latency: {lensTestResult.durationMs}ms
                    </p>
                  )}
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              loading={testingLens}
              onClick={() => onTestConnection("lens")}
              className="w-full text-xs"
            >
              Test Google Lens Connection
            </Button>
          </CardContent>
        </Card>

        {/* Vision OCR Card */}
        <Card>
          <CardHeader className="p-4 sm:p-5 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                  OpenAI Vision Markings OCR Engine
                </CardTitle>
              </div>
              <Badge variant={status.openaiConfigured ? "success" : "secondary"}>
                {status.openaiConfigured ? "API Key Configured" : "Unconfigured"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-1 space-y-3">
            <div className="text-xs space-y-1">
              <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                <span>Active Model:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {status.activeOpenAiModel || openaiModel}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                <span>Attribution Method:</span>
                <span className="font-medium text-neutral-900 dark:text-white">
                  Deterministic Regex + Vision Fallback
                </span>
              </div>
            </div>

            {openAiTestResult && (
              <div
                className={`p-2.5 rounded-md text-xs flex items-start gap-2 ${
                  openAiTestResult.success
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                    : "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60"
                }`}
              >
                {openAiTestResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{openAiTestResult.message}</p>
                  {openAiTestResult.durationMs !== undefined && (
                    <p className="text-[11px] opacity-80 mt-0.5">
                      Roundtrip latency: {openAiTestResult.durationMs}ms
                    </p>
                  )}
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              loading={testingOpenAi}
              onClick={() => onTestConnection("openai")}
              className="w-full text-xs"
            >
              Test OpenAI Vision Connection
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Configuration Form */}
      <Card>
        <CardHeader className="p-5 sm:p-6 pb-2">
          <CardTitle className="text-base font-semibold">
            Recognition Engine Parameters
          </CardTitle>
          <CardDescription className="text-xs">
            Tune adapters, models, and query filtering for display recognition.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 pt-4">
          <form onSubmit={onSave} className="space-y-5">
            {/* Visual Match Provider Adapter */}
            <div>
              <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                Visual Identification Adapter
              </label>
              <Select
                value={lensProvider}
                onChange={(e) => setLensProvider(e.target.value)}
              >
                <option value="mock">Local Deterministic Provider (Offline / Dev)</option>
                <option value="serpapi_lens">SerpApi Visual Search (Direct Image Upload)</option>
              </Select>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                The local provider simulates visual matches without consuming external API quotas.
              </p>
            </div>

            {/* Filter Query */}
            <div>
              <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                Visual Match Query Filter (<code className="font-mono text-neutral-600 dark:text-neutral-300">q</code> parameter)
              </label>
              <Input
                value={lensFilterQuery}
                onChange={(e) => setLensFilterQuery(e.target.value)}
                placeholder="e.g. display screen, replacement screen"
              />
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Suggestions:</span>
                {FILTER_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLensFilterQuery(preset)}
                    className="px-2 py-0.5 rounded text-[10px] bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* OpenAI Vision Model */}
            <div>
              <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                Vision OCR Markings Model
              </label>
              <Select
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
              >
                <option value="gpt-5.6-terra">Terra: gpt-5.6-terra (Balanced High-Precision Vision OCR & Reasoning)</option>
                <option value="gpt-5.6-luna">Luna: gpt-5.6-luna (High-Speed Exact Markings Vision OCR)</option>
                <option value="gpt-4o">gpt-4o (Standard Flagship Multimodal Vision)</option>
                <option value="gpt-4o-mini">gpt-4o-mini (Lightweight High-Speed OCR)</option>
              </Select>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                Used to parse alphanumeric flex cable markings and vendor stamps.
              </p>
            </div>

            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
              <Button type="submit" variant="primary" loading={saving} size="sm">
                Save Recognition Settings
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
