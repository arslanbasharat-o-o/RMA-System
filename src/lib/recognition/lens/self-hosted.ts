import {
  cleanVisualCandidatesWithOpenAi,
} from "./decision";
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

const DEFAULT_TIMEOUT_MS = 8_000;
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

export const DEFAULT_DISPLAY_INSPECTION_PROMPT =
  "Identify exact phone display screen model. Inspect notch vs Dynamic Island cutout, length and width dimensions, aftermarket IC chip markings (e.g. SQ9, JK, RJ), flex cable layout, connector pin count, and laser etched QR/text codes to distinguish Pro vs Pro Max and standard vs Plus models.";

function getAiOverview(payload: JsonObject): string | undefined {
  for (const candidate of [payload, ...getNestedObjects(payload)]) {
    for (const key of ["ai_mode", "aiMode", "ai_overview", "aiOverview"]) {
      const value = candidate[key];
      const text = typeof value === "string"
        ? value
        : isJsonObject(value) && typeof value.text === "string"
          ? value.text
          : undefined;
      const normalized = text?.trim();
      if (normalized && normalized.length <= 10000) return normalized;
    }
  }
  return undefined;
}

function getAiMode(payload: JsonObject): { text: string; sources?: Array<{ title?: string; link: string }> } | undefined {
  for (const candidate of [payload, ...getNestedObjects(payload)]) {
    for (const key of ["ai_mode", "aiMode"]) {
      const value = candidate[key];
      if (isJsonObject(value) && typeof value.text === "string" && value.text.trim()) {
        const sources = Array.isArray(value.sources)
          ? value.sources
              .filter(isJsonObject)
              .map((s) => ({
                title: typeof s.title === "string" ? s.title : undefined,
                link: String(s.link || s.url || ""),
              }))
              .filter((s) => Boolean(s.link))
          : undefined;
        return {
          text: value.text.trim(),
          sources,
        };
      }
    }
  }
  return undefined;
}

function getStatus(payload: JsonObject): string | undefined {
  return typeof payload.status === "string" ? payload.status.trim().toLowerCase() : undefined;
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

function detectImageMimeType(buffer: Buffer, declared?: string): { mime: string; ext: string } {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: "image/png", ext: ".png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", ext: ".jpg" };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mime: "image/webp", ext: ".webp" };
  }
  if (buffer.length >= 6) {
    const sig = buffer.subarray(0, 6).toString("ascii");
    if (sig === "GIF87a" || sig === "GIF89a") {
      return { mime: "image/gif", ext: ".gif" };
    }
  }
  const fallback = declared || "image/jpeg";
  const ext = fallback.includes("png") ? ".png" : fallback.includes("webp") ? ".webp" : ".jpg";
  return { mime: fallback, ext };
}

/**
 * Bounds display image dimensions to max 1280x1280 and compresses to progressive JPEG (85% quality).
 * Slashes proxy payload by 70-90% (down to 100-300KB) and cuts upload transfer latency over proxies.
 */
export async function optimizeImageForVisualSearch(
  imageBuffer: Buffer,
  declaredMime?: string
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  try {
    const sharp = (await import("sharp")).default;
    const optimized = await sharp(imageBuffer)
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();

    if (optimized.length < imageBuffer.length || imageBuffer.length > 400_000) {
      return { buffer: optimized, mime: "image/jpeg", ext: ".jpg" };
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[SelfHostedLens] Image compression fallback to raw buffer:", err);
    }
  }
  const detected = detectImageMimeType(imageBuffer, declaredMime);
  return { buffer: imageBuffer, mime: detected.mime, ext: detected.ext };
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
    let pendingJobUrl: string | undefined;
    const rememberPendingJob = (url: string) => { pendingJobUrl = url; };

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
      const optimized = await optimizeImageForVisualSearch(imageBuffer, context?.mimeType);
      const uploadBuffer = optimized.buffer;
      const uploadMime = optimized.mime;
      // Original names are private metadata, not visual recognition evidence.
      const filename = `display${optimized.ext}`;
      const prompt = context?.prompt ?? process.env.LENS_SEARCH_PROMPT;
      let payload: JsonObject;

      if (this.useDirectEndpoint()) {
        stage = "visual search";
        payload = await this.requestDirect(
          uploadBuffer,
          uploadMime,
          filename,
          controller.signal,
          prompt
        );
        payload = await this.waitForResult(payload, controller.signal, rememberPendingJob);
      } else {
        stage = "image upload";
        const uploadPayload = await this.requestUpload(
          uploadBuffer,
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
          payload = await this.requestSearch(imageId, controller.signal, context?.noCache, prompt);
          payload = await this.waitForResult(payload, controller.signal, rememberPendingJob);
        }
      }

      const result = await this.toIdentificationResult(payload, startTime, uploadBuffer, uploadMime, controller.signal);
      if (controller.signal.aborted) throw new Error("Recognition deadline exceeded");
      clearTimeout(timeout);
      return result;
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (pendingJobUrl && /\/v1\/(?:lens\/)?jobs\/[^/]+$/.test(new URL(pendingJobUrl).pathname)) {
        try {
          // Stop this request's own abandoned search; never flush the shared queue.
          await fetch(pendingJobUrl, { method: "DELETE", headers: this.authHeaders(),
            redirect: "error", signal: AbortSignal.timeout(2000) });
        } catch { /* The original failure remains visible if cancellation is unavailable. */ }
      }
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
    signal: AbortSignal,
    prompt?: string
  ): Promise<JsonObject> {
    const formData = this.createFormData(imageBuffer, mimeType, filename);
    if (prompt) {
      formData.append("prompt", prompt);
      formData.append("q", prompt);
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.authHeaders(),
      redirect: "error",
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
      redirect: "error",
      body: this.createFormData(imageBuffer, mimeType, filename),
      signal,
    });
    return this.readJsonResponse(response, "image upload");
  }

  private async requestSearch(
    imageId: string,
    signal: AbortSignal,
    noCache?: boolean,
    prompt?: string
  ): Promise<JsonObject> {
    const searchUrl = new URL(joinServicePath(this.baseUrl, "search"));
    searchUrl.searchParams.set("image_id", imageId);
    // Obtain the owning job URL before waiting. A synchronous search can
    // otherwise outlive our deadline before we have an ID to cancel.
    searchUrl.searchParams.set("async", "true");
    if (noCache) {
      searchUrl.searchParams.set("no_cache", "true");
    }
    if (prompt) {
      searchUrl.searchParams.set("prompt", prompt);
      searchUrl.searchParams.set("q", prompt);
    }

    const response = await fetch(searchUrl.toString(), {
      method: "GET",
      headers: this.authHeaders(),
      redirect: "error",
      signal,
    });
    return this.readJsonResponse(response, "visual search");
  }

  private async waitForResult(
    payload: JsonObject, signal: AbortSignal, rememberPendingJob: (url: string) => void
  ): Promise<JsonObject> {
    let current = payload;
    const pendingStatuses = new Set(["queued", "running", "pending", "processing"]);
    let fetchedCompletedJob = false;

    while (true) {
      const status = getStatus(current) || "";
      if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        throw new Error("Self-hosted Lens job failed or was cancelled without a response payload.");
      }
      const pending = pendingStatuses.has(status);
      if (!pending && hasVisualMatches(current)) return current;
      const statusUrl = getStatusUrl(current);
      if (!statusUrl) {
        throw new Error(pending
          ? "Self-hosted Lens returned a pending job without a status URL."
          : "Self-hosted Lens returned no visual result payload.");
      }
      // Cached asynchronous search returns a succeeded job receipt, not its
      // result. Fetch that receipt once too; never call it an empty success.
      if (!pending && fetchedCompletedJob) throw new Error("Self-hosted Lens completed a job without a visual result payload.");
      if (!pending) fetchedCompletedJob = true;
      const resolvedStatusUrl = new URL(statusUrl, this.baseUrl);
      if (resolvedStatusUrl.origin !== new URL(this.baseUrl).origin ||
          resolvedStatusUrl.username || resolvedStatusUrl.password) {
        throw new Error("Self-hosted Lens returned an untrusted job status URL.");
      }
      rememberPendingJob(resolvedStatusUrl.toString());
      if (signal.aborted) throw new DOMException("The request was aborted.", "AbortError");

      if (pending) await new Promise<void>((resolve, reject) => {
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

      const response = await fetch(resolvedStatusUrl.toString(), {
        method: "GET",
        headers: this.authHeaders(),
        redirect: "error",
        signal,
      });
      current = await this.readJsonResponse(response, "job status");
    }

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

  private async toIdentificationResult(
    payload: JsonObject,
    startTime: number,
    imageBuffer?: Buffer,
    uploadMime?: string,
    signal?: AbortSignal
  ): Promise<VisualIdentificationResult> {
    const visualPayload = getVisualPayload(payload);
    const matches = Array.isArray(visualPayload.visual_matches) ? visualPayload.visual_matches : [];
    const aiOverview = getAiOverview(payload);
    const aiMode = getAiMode(payload);
    const candidates: VisualCandidate[] = matches
      .filter(isJsonObject)
      .slice(0, 30)
      .map((match, index) => ({
        title: typeof match.title === "string" && match.title.trim()
          ? match.title
          : "Unknown Display Assembly",
        sourceUrl: typeof match.link === "string" ? match.link : undefined,
        sourceName: typeof match.source === "string" ? match.source : undefined,
        thumbnailUrl: typeof match.thumbnail === "string" ? match.thumbnail : undefined,
        price: getPrice(match.price),
        rank: index + 1,
      }));

    // Clean candidates using OpenAI when configured, with immediate heuristic fallback
    const cleanDecision = await cleanVisualCandidatesWithOpenAi(candidates, {
      aiOverview,
      imageBuffer,
      mimeType: uploadMime,
      signal,
    });

    const normalizedManufacturer = cleanDecision.manufacturer || undefined;
    const normalizedModel = cleanDecision.model || undefined;

    return {
      provider: this.name,
      candidates,
      aiOverview,
      aiMode,
      cleanDecision,
      normalizedManufacturer,
      normalizedModel,
      detectedDisplayAssembly: cleanDecision.displayName || undefined,
      rawResponse: { ...payload, cleanDecision },
      durationMs: Date.now() - startTime,
    };
  }
}
