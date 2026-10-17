import { cleanVisualCandidatesHeuristic } from "./decision";
import {
  DisplayVisualRecognitionContext,
  DisplayVisualRecognitionProvider,
  VisualCandidate,
  VisualIdentificationResult,
} from "./types";

export type SelfHostedLensApiMode = "upload_search" | "direct";

export interface SelfHostedLensProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  mode?: SelfHostedLensApiMode;
}

type JsonObject = Record<string, unknown>;

const DEFAULT_TIMEOUT_MS = 60_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MIN_POLL_INTERVAL_MS = 100;
const MAX_POLL_INTERVAL_MS = 10_000;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getConfiguredTimeout(timeoutMs?: number): number {
  const configured = Number(timeoutMs ?? process.env.LENS_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= MIN_TIMEOUT_MS && configured <= MAX_TIMEOUT_MS
    ? Math.floor(configured)
    : DEFAULT_TIMEOUT_MS;
}

function getConfiguredPollInterval(intervalMs?: number): number {
  const configured = Number(intervalMs ?? process.env.LENS_API_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS);
  return Number.isFinite(configured)
    && configured >= MIN_POLL_INTERVAL_MS
    && configured <= MAX_POLL_INTERVAL_MS
    ? Math.floor(configured)
    : DEFAULT_POLL_INTERVAL_MS;
}

function getNestedObjects(payload: JsonObject): JsonObject[] {
  return [payload.data, payload.result, payload.response, payload.search_result]
    .filter(isJsonObject);
}

function getVisualPayload(payload: JsonObject): JsonObject {
  if (Array.isArray(payload.visual_matches)) return payload;
  const nested = getNestedObjects(payload).find((candidate) => Array.isArray(candidate.visual_matches));
  return nested || payload;
}

function hasVisualMatches(payload: JsonObject): boolean {
  return Array.isArray(getVisualPayload(payload).visual_matches);
}

function getImageId(payload: JsonObject): string | undefined {
  const possibleValues = [payload, ...getNestedObjects(payload)].flatMap((candidate) => [
    candidate.image_id,
    candidate.imageId,
    candidate.upload_id,
    candidate.uploadId,
    candidate.id,
    candidate.job_id,
    candidate.jobId,
  ]);

  const imageId = possibleValues.find((value) => typeof value === "string" || typeof value === "number");
  return imageId === undefined ? undefined : String(imageId);
}

function getPrice(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (!isJsonObject(value)) return undefined;

  if (typeof value.extracted === "number") {
    const currency = typeof value.currency === "string" ? `${value.currency} ` : "";
    return `${currency}${value.extracted}`;
  }
  if (typeof value.value === "number") return String(value.value);
  return undefined;
}

function getStatus(payload: JsonObject): string | undefined {
  return typeof payload.status === "string" ? payload.status.toLowerCase() : undefined;
}

function getStatusUrl(payload: JsonObject): string | undefined {
  const statusUrl = payload.status_url || payload.statusUrl || payload.json_endpoint;
  return typeof statusUrl === "string" && statusUrl.trim() ? statusUrl : undefined;
}

function joinServicePath(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/${path.replace(/^\/+/, "")}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function isDirectEndpoint(baseUrl: string): boolean {
  const pathname = new URL(baseUrl).pathname.replace(/\/+$/, "").toLowerCase();
  return /(?:^|\/)(?:search|lens|google[-_]?lens|visual[-_]?search|identify|recognize)$/.test(pathname);
}

export class SelfHostedLensProvider implements DisplayVisualRecognitionProvider {
  public name = "self_hosted_lens";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly mode?: SelfHostedLensApiMode;

  public constructor(options?: SelfHostedLensProviderOptions);
  public constructor(
    apiKey?: string,
    baseUrl?: string,
    timeoutMs?: number,
    mode?: SelfHostedLensApiMode,
    pollIntervalMs?: number
  );
  public constructor(
    optionsOrApiKey: SelfHostedLensProviderOptions | string = {},
    baseUrl?: string,
    timeoutMs?: number,
    mode?: SelfHostedLensApiMode,
    pollIntervalMs?: number
  ) {
    const options = typeof optionsOrApiKey === "string"
      ? { apiKey: optionsOrApiKey, baseUrl, timeoutMs, mode, pollIntervalMs }
      : optionsOrApiKey;

    this.apiKey = options.apiKey || process.env.LENS_API_KEY || "";
    this.baseUrl = (options.baseUrl || process.env.LENS_API_BASE_URL || "").trim().replace(/\/+$/, "");
    this.timeoutMs = getConfiguredTimeout(options.timeoutMs);
    this.pollIntervalMs = getConfiguredPollInterval(options.pollIntervalMs);
    const configuredMode = options.mode || process.env.LENS_API_MODE;
    this.mode = configuredMode === "direct" || configuredMode === "upload_search"
      ? configuredMode
      : undefined;
  }

  public async identifyDisplay(
    imageBuffer: Buffer,
    context?: DisplayVisualRecognitionContext
  ): Promise<VisualIdentificationResult> {
    const startTime = Date.now();
    let stage = "configuration";

    if (!this.apiKey) {
      throw new Error(
        "Self-hosted Lens API key is not configured. Set LENS_API_KEY in environment or settings."
      );
    }
    if (!this.baseUrl) {
      throw new Error(
        "Self-hosted Lens API base URL is not configured. Set LENS_API_BASE_URL in environment or settings."
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const uploadMime = context?.mimeType || "image/jpeg";
      const filename = context?.filename || "display.jpg";
      let payload: JsonObject;

      if (this.useDirectEndpoint()) {
        stage = "visual search";
        payload = await this.requestDirect(
          imageBuffer,
          uploadMime,
          filename,
          controller.signal
        );
        payload = await this.waitForResult(payload, controller.signal);
      } else {
        stage = "image upload";
        const uploadPayload = await this.requestUpload(
          imageBuffer,
          uploadMime,
          filename,
          controller.signal
        );

        // A service may expose upload as a direct recognition endpoint. Accept
        // that response without issuing a second request when it already
        // contains the normalized visual_matches array.
        if (hasVisualMatches(uploadPayload)) {
          payload = uploadPayload;
        } else {
          const imageId = getImageId(uploadPayload);
          if (!imageId) {
            throw new Error(
              "Self-hosted Lens image upload failed to return an image_id or visual_matches."
            );
          }

          stage = "visual search";
          payload = await this.requestSearch(imageId, controller.signal);
          payload = await this.waitForResult(payload, controller.signal);
        }
      }

      clearTimeout(timeout);
      return this.toIdentificationResult(payload, context, startTime);
    } catch (err: unknown) {
      clearTimeout(timeout);
      const message = controller.signal.aborted
        ? `Visual identification timed out after ${Math.round(this.timeoutMs / 1000)} second${this.timeoutMs === 1000 ? "" : "s"} during ${stage}. The visual provider may be slow or unavailable. Photos are retained; retry the image later or select a model manually.`
        : err instanceof Error ? err.message : String(err);

      return {
        provider: this.name,
        candidates: [],
        rawResponse: { error: message },
        durationMs: Date.now() - startTime,
        error: message,
      };
    }
  }

  private useDirectEndpoint(): boolean {
    if (this.mode) return this.mode === "direct";
    return isDirectEndpoint(this.baseUrl);
  }

  private authHeaders(): Record<string, string> {
    return {
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "X-API-Key": this.apiKey,
    };
  }

  private createFormData(
    imageBuffer: Buffer,
    mimeType: string,
    filename: string
  ): FormData {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
    formData.append("image", blob, filename);
    return formData;
  }

  private async requestDirect(
    imageBuffer: Buffer,
    mimeType: string,
    filename: string,
    signal: AbortSignal
  ): Promise<JsonObject> {
    const formData = this.createFormData(imageBuffer, mimeType, filename);

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.authHeaders(),
      body: formData,
      signal,
    });
    return this.readJsonResponse(response, "direct visual search");
  }

  private async requestUpload(
    imageBuffer: Buffer,
    mimeType: string,
    filename: string,
    signal: AbortSignal
  ): Promise<JsonObject> {
    const response = await fetch(joinServicePath(this.baseUrl, "upload"), {
      method: "POST",
      headers: this.authHeaders(),
      body: this.createFormData(imageBuffer, mimeType, filename),
      signal,
    });
    return this.readJsonResponse(response, "image upload");
  }

  private async requestSearch(
    imageId: string,
    signal: AbortSignal
  ): Promise<JsonObject> {
    const searchUrl = new URL(joinServicePath(this.baseUrl, "search"));
    searchUrl.searchParams.set("image_id", imageId);

    const response = await fetch(searchUrl.toString(), {
      method: "GET",
      headers: this.authHeaders(),
      signal,
    });
    return this.readJsonResponse(response, "visual search");
  }

  private async waitForResult(payload: JsonObject, signal: AbortSignal): Promise<JsonObject> {
    let current = payload;
    const pendingStatuses = new Set(["queued", "running", "pending", "processing"]);

    while (!hasVisualMatches(current) && pendingStatuses.has(getStatus(current) || "")) {
      const statusUrl = getStatusUrl(current);
      if (!statusUrl) {
        throw new Error("Self-hosted Lens returned a pending job without a status URL.");
      }

      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const onAbort = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          reject(new DOMException("The request was aborted.", "AbortError"));
        };
        timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, this.pollIntervalMs);
        signal.addEventListener("abort", onAbort, { once: true });
      });

      const response = await fetch(new URL(statusUrl, this.baseUrl).toString(), {
        method: "GET",
        headers: this.authHeaders(),
        signal,
      });
      current = await this.readJsonResponse(response, "job status");
    }

    if (getStatus(current) === "failed" || getStatus(current) === "error") {
      throw new Error("Self-hosted Lens job failed without a response payload.");
    }
    return current;
  }

  private async readJsonResponse(response: Response, operation: string): Promise<JsonObject> {
    if (!response.ok) {
      const errorText = await response.text();
      const details = errorText || response.statusText || "Unknown error";
      throw new Error(`Self-hosted Lens ${operation} error [${response.status}]: ${details}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Self-hosted Lens ${operation} returned invalid JSON.`);
    }

    if (!isJsonObject(payload)) {
      throw new Error(`Self-hosted Lens ${operation} returned a non-object JSON response.`);
    }

    const apiError = payload.error;
    if (typeof apiError === "string" && apiError.trim()) {
      throw new Error(`Self-hosted Lens ${operation} failed: ${apiError}`);
    }
    if (isJsonObject(apiError) && typeof apiError.message === "string" && apiError.message.trim()) {
      throw new Error(`Self-hosted Lens ${operation} failed: ${apiError.message}`);
    }
    return payload;
  }

  private toIdentificationResult(
    payload: JsonObject,
    context: DisplayVisualRecognitionContext | undefined,
    startTime: number
  ): VisualIdentificationResult {
    const visualPayload = getVisualPayload(payload);
    const matches = Array.isArray(visualPayload.visual_matches) ? visualPayload.visual_matches : [];
    const candidates: VisualCandidate[] = matches
      .filter(isJsonObject)
      .slice(0, 20)
      .map((match, index) => ({
        title: typeof match.title === "string" && match.title.trim()
          ? match.title
          : "Unknown Display Assembly",
        sourceUrl: typeof match.link === "string" ? match.link : undefined,
        thumbnailUrl: typeof match.thumbnail === "string" ? match.thumbnail : undefined,
        price: getPrice(match.price),
        rank: index + 1,
      }));

    // This provider deliberately uses the local heuristic cleaner. It keeps
    // self-hosted visual recognition independent from OpenAI credentials and
    // network calls while retaining the normalized result shape.
    const cleanDecision = cleanVisualCandidatesHeuristic(candidates, {
      filename: context?.filename,
    });
    const normalizedManufacturer = cleanDecision.manufacturer || undefined;
    const normalizedModel = cleanDecision.model || undefined;

    return {
      provider: this.name,
      candidates,
      cleanDecision,
      normalizedManufacturer,
      normalizedModel,
      detectedDisplayAssembly: cleanDecision.displayName || undefined,
      rawResponse: { ...payload, cleanDecision },
      durationMs: Date.now() - startTime,
    };
  }
}
