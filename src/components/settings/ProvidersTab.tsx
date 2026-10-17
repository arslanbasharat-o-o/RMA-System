"use client";

import { CardSpotlight, ShimmerButton } from "@/components/premium";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Eye, CheckCircle2, AlertCircle } from "lucide-react";

interface ProviderStatus {
  activeLensProvider?: string;
  activeLensFilterQuery?: string;
  activeOpenAiModel?: string;
  serpapiConfigured?: boolean;
  selfHostedConfigured?: boolean;
  providerManagedByEnvironment?: boolean;
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

const isSelfHosted = (provider: string) => provider === "self_hosted_lens"
  || provider === "self-hosted-lens" || provider === "self_hosted";

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
  const activeProvider = status.activeLensProvider || lensProvider;
  const visualConfigured = isSelfHosted(activeProvider)
    ? status.selfHostedConfigured
    : activeProvider === "mock" || status.serpapiConfigured;

  return (
    <div className="space-y-6">
      {/* Live Provider Health Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Visual Recognition Card */}
        <CardSpotlight className="p-5 border-neutral-200/90 dark:border-neutral-800">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                Visual Recognition
              </h3>
            </div>
            <Badge variant={visualConfigured ? "success" : "secondary"}>
              {visualConfigured ? "Configured" : "Unconfigured"}
            </Badge>
          </div>
          <div className="space-y-3">
            <div className="text-xs space-y-1">
              <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                <span>Active Provider:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {activeProvider}
                </span>
              </div>
              {!isSelfHosted(activeProvider) && (
                <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                  <span>Query Filter:</span>
                  <span className="font-mono font-medium text-neutral-900 dark:text-white">
                    {status.activeLensFilterQuery || lensFilterQuery || "None"}
                  </span>
                </div>
              )}
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
              {isSelfHosted(activeProvider) ? "Check API & Worker Health" : "Test Visual Recognition Connection"}
            </Button>
          </div>
        </CardSpotlight>

        {/* Vision Markings Card */}
        <CardSpotlight className="p-5 border-neutral-200/90 dark:border-neutral-800">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                Markings & Stamp Recognition
              </h3>
            </div>
            <Badge variant={status.openaiConfigured ? "success" : "secondary"}>
              {status.openaiConfigured ? "API Key Configured" : "Unconfigured"}
            </Badge>
          </div>
          <div className="space-y-3">
            <div className="text-xs space-y-1">
              <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                <span>Active Model:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {status.activeOpenAiModel || openaiModel}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                <span>Method:</span>
                <span className="font-medium text-neutral-900 dark:text-white">
                  Part Number Matching + Image Scan
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
          </div>
        </CardSpotlight>
      </div>

      {/* Configuration Form */}
      <CardSpotlight className="p-5 sm:p-6 border-neutral-200/90 dark:border-neutral-800">
        <div className="pb-3 mb-4 border-b border-neutral-100 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Recognition Provider Settings
          </h2>
        </div>
        <div>
          <form onSubmit={onSave} className="space-y-5">
            {/* Visual Match Provider Adapter */}
            <div>
              <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                Visual Search Provider
              </label>
              <Select
                value={lensProvider}
                onChange={(e) => setLensProvider(e.target.value)}
                disabled={status.providerManagedByEnvironment}
              >
                <option value="mock">Local Test Provider</option>
                <option value="serpapi_lens">SerpApi Visual Search</option>
                <option value="self_hosted_lens">Self-hosted Google Lens API</option>
              </Select>
              {status.providerManagedByEnvironment && (
                <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Provider selection is managed by the deployment configuration.
                </p>
              )}
            </div>

            {/* Filter Query */}
            {!isSelfHosted(lensProvider) && <div>
              <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                Visual Match Query Filter (<code className="font-mono text-neutral-600 dark:text-neutral-300">q</code> parameter)
              </label>
              <Input
                value={lensFilterQuery}
                onChange={(e) => setLensFilterQuery(e.target.value)}
                placeholder="e.g. display screen, replacement screen"
                className="h-9 text-xs"
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
            </div>}

            {/* OpenAI Vision Model */}
            <div>
              <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                Markings Recognition Model
              </label>
              <Select
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
              >
                <option value="gpt-5.6-terra">GPT-5.6 Terra</option>
                <option value="gpt-5.6-luna">GPT-5.6 Luna</option>
                <option value="gpt-4o">GPT-4o Vision</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
              </Select>
            </div>

            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
              <ShimmerButton type="submit" loading={saving} className="h-9 px-4 text-xs font-semibold">
                Save Recognition Settings
              </ShimmerButton>
            </div>
          </form>
        </div>
      </CardSpotlight>
    </div>
  );
}
