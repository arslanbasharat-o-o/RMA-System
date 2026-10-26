import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import { customers, rmas, rmaItems, itemImages, returnReasons, recognitionRuns, recognitionCandidates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { processRmaItem } from "@/lib/queue/processor";
import { readVisualDecisionSnapshot, VISUAL_DECISION_POLICY } from "@/lib/recognition/lens/stable-decision";
import { MockLensProvider, type VisualIdentificationResult } from "@/lib/recognition/lens";
import sharp from "sharp";

let customerId = "", rmaId = "";
let storedImagePaths: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  if (rmaId) await db.delete(rmas).where(eq(rmas.id, rmaId));
  if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  await Promise.all(storedImagePaths.map((storagePath) => storage.deleteImage(storagePath)));
  storedImagePaths = [];
});

it("finishes OCR while visual search is waiting, then preserves OCR after a visual timeout", async () => {
  const [customer] = await db.insert(customers).values({ name: "Offline concurrency QA" }).returning();
  customerId = customer.id;
  const [reason] = await db.select().from(returnReasons).limit(1);
  const [rma] = await db.insert(rmas).values({ rmaNumber: `QA-${crypto.randomUUID()}`, customerId, returnReasonId: reason.id }).returning();
  rmaId = rma.id;
  const [item] = await db.insert(rmaItems).values({ rmaId, itemNumber: 1 }).returning();
  const stored = await storage.saveImage(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"), "iphone13_ami.png", "image/png", `qa-concurrency/${item.id}`);
  await db.insert(itemImages).values({ rmaItemId: item.id, imageType: "primary", storagePath: stored.storagePath, originalFilename: stored.originalFilename, mimeType: stored.mimeType, fileSizeBytes: stored.fileSizeBytes, checksumSha256: stored.checksumSha256 });
  let release!: (result: VisualIdentificationResult) => void;
  vi.spyOn(MockLensProvider.prototype, "identifyDisplay").mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const pending = processRmaItem(item.id);
  try {
    await vi.waitFor(async () => {
      const [live] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
      expect(live.vendorOcrStatus).toBe("success");
      expect(live.visualStatus).toBe("pending");
      expect(live.status).toBe("processing");
    }, { timeout: 3000 });
  } finally {
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release({ provider: "mock_lens", candidates: [], rawResponse: {}, durationMs: 60000, error: "Visual identification timed out" });
    await pending;
  }
  const [result] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
  expect(result.visualStatus).toBe("failed");
  expect(result.vendorOcrStatus).toBe("success");
  expect(result.extractedTextSummary).toBeTruthy();
  expect(result.status).toBe("review_required");
});

it("reuses the same verified visual evidence for identical image bytes across items", async () => {
  const [customer] = await db.insert(customers).values({ name: "Exact image reuse QA" }).returning();
  customerId = customer.id;
  const [reason] = await db.select().from(returnReasons).limit(1);
  const [rma] = await db.insert(rmas).values({ rmaNumber: `QA-${crypto.randomUUID()}`, customerId, returnReasonId: reason.id }).returning();
  rmaId = rma.id;
  const color = crypto.getRandomValues(new Uint8Array(3));
  const image = await sharp({ create: {
    width: 4, height: 4, channels: 3,
    background: { r: color[0], g: color[1], b: color[2] },
  } }).png().toBuffer();
  const items = await db.insert(rmaItems).values([
    { rmaId, itemNumber: 1 },
    { rmaId, itemNumber: 2 },
  ]).returning();
  for (const item of items) {
    const stored = await storage.saveImage(image, "iphone13_ami.png", "image/png", `qa-stable/${item.id}`);
    await db.insert(itemImages).values({
      rmaItemId: item.id, imageType: "primary", storagePath: stored.storagePath,
      originalFilename: stored.originalFilename, mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes, checksumSha256: stored.checksumSha256,
    });
  }

  const providerCall = vi.spyOn(MockLensProvider.prototype, "identifyDisplay");
  await processRmaItem(items[0].id);
  await processRmaItem(items[1].id);

  expect(providerCall).toHaveBeenCalledTimes(1);
  const processed = await db.select().from(rmaItems).where(eq(rmaItems.rmaId, rmaId));
  expect(processed.map((item) => item.predictedModel)).toEqual(["iPhone 13 Pro", "iPhone 13 Pro"]);
  const runs = await db.select().from(recognitionRuns).where(eq(recognitionRuns.rmaItemId, items[1].id));
  expect(runs.find((run) => run.pipelineType === "visual")?.providerName).toBe("stable-visual-evidence");
});

it("reuses unresolved visual evidence for identical image bytes without repeating Lens requests", async () => {
  const [customer] = await db.insert(customers).values({ name: "Unresolved image cache QA" }).returning();
  customerId = customer.id;
  const [reason] = await db.select().from(returnReasons).limit(1);
  const [rma] = await db.insert(rmas).values({ rmaNumber: `QA-${crypto.randomUUID()}`, customerId, returnReasonId: reason.id }).returning();
  rmaId = rma.id;
  const image = await sharp({ create: {
    width: 4, height: 4, channels: 3,
    background: { r: 54, g: 105, b: 160 },
  } }).png().toBuffer();
  const items = await db.insert(rmaItems).values([
    { rmaId, itemNumber: 1 },
    { rmaId, itemNumber: 2 },
  ]).returning();
  for (const item of items) {
    const stored = await storage.saveImage(image, "unknown-display.png", "image/png", `qa-unresolved-cache/${item.id}`);
    await db.insert(itemImages).values({
      rmaItemId: item.id, imageType: "primary", storagePath: stored.storagePath,
      originalFilename: stored.originalFilename, mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes, checksumSha256: stored.checksumSha256,
    });
  }

  const providerCall = vi.spyOn(MockLensProvider.prototype, "identifyDisplay").mockResolvedValue({
    provider: "mock_lens",
    candidates: [{ title: "Generic replacement display", rank: 1, sourceUrl: "https://example.test/display" }],
    normalizedManufacturer: "Apple",
    detectedDisplayAssembly: "Unidentified Apple Display",
    cleanDecision: {
      manufacturer: "Apple",
      model: null,
      displayName: "Unidentified Apple Display",
      confidence: 0.45,
      cleanedCandidates: [],
      reasoning: "No model could be established from the available evidence.",
    },
    // The real adapter stores the provider payload and clean decision here,
    // while its normalized candidate objects live on the typed result.
    rawResponse: {
      cleanDecision: {
        manufacturer: "Apple", model: null, displayName: "Unidentified Apple Display",
        confidence: 0.45, cleanedCandidates: [], reasoning: "No exact model evidence.",
      },
      visual_matches: [{ title: "Generic replacement display", link: "https://example.test/display" }],
    },
    durationMs: 25,
  });

  await processRmaItem(items[0].id, { pipeline: "visual" });
  await processRmaItem(items[1].id, { pipeline: "visual" });

  expect(providerCall).toHaveBeenCalledTimes(1);
  const [reused] = await db.select().from(rmaItems).where(eq(rmaItems.id, items[1].id));
  expect(reused.predictedModel).toBeNull();
  expect(reused.predictedDisplayAssembly).toBe("Unidentified Apple Display");
  expect(reused.status).toBe("review_required");
  const runs = await db.select().from(recognitionRuns).where(eq(recognitionRuns.rmaItemId, items[1].id));
  expect(runs.find((run) => run.pipelineType === "visual")?.providerName).toBe("stable-visual-evidence");
  const reusedSnapshot = readVisualDecisionSnapshot(runs.find((run) => run.pipelineType === "visual")?.rawResponse);
  expect(reusedSnapshot?.candidates).toEqual([{ title: "Generic replacement display", rank: 1, sourceUrl: "https://example.test/display" }]);
  const candidates = await db.select().from(recognitionCandidates).where(eq(recognitionCandidates.rmaItemId, items[1].id));
  expect(candidates).toEqual([expect.objectContaining({
    candidateTitle: "Generic replacement display", sourceEvidence: "https://example.test/display", rank: 1,
  })]);
});

it("ignores conflicting legacy Lens results and fetches fresh evidence for an identical photo", async () => {
  const [customer] = await db.insert(customers).values({ name: "Legacy conflict QA" }).returning();
  customerId = customer.id;
  const [reason] = await db.select().from(returnReasons).limit(1);
  const [rma] = await db.insert(rmas).values({ rmaNumber: `QA-${crypto.randomUUID()}`, customerId, returnReasonId: reason.id }).returning();
  rmaId = rma.id;
  const color = crypto.getRandomValues(new Uint8Array(3));
  const image = await sharp({ create: {
    width: 4, height: 4, channels: 3,
    background: { r: color[0], g: color[1], b: color[2] },
  } }).png().toBuffer();
  const items = await db.insert(rmaItems).values([
    { rmaId, itemNumber: 1 },
    { rmaId, itemNumber: 2 },
  ]).returning();
  const [priorItem, nextItem] = items;
  const stored = await storage.saveImage(image, "same-display.png", "image/png", `qa-legacy-conflict/${priorItem.id}`);
  for (const item of items) {
    await db.insert(itemImages).values({
      rmaItemId: item.id, imageType: "primary", storagePath: stored.storagePath,
      originalFilename: stored.originalFilename, mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes, checksumSha256: stored.checksumSha256,
    });
  }

  const legacyDecision = (model: string) => ({
    cleanDecision: {
      manufacturer: "Apple",
      model,
      displayName: `Apple ${model} Display`,
      confidence: 0.88,
      cleanedCandidates: [`Apple ${model} Display`],
      reasoning: "Legacy Lens visual evidence",
    },
    candidates: [{ title: `Apple ${model} Display`, rank: 1 }],
  });
  await db.insert(recognitionRuns).values([
    {
      rmaItemId: priorItem.id, pipelineType: "visual", providerName: "google-lens",
      status: "completed", rawRequest: { filename: stored.originalFilename },
      rawResponse: legacyDecision("iPhone 14"),
      createdAt: new Date(Date.now() + 2_000),
    },
    {
      rmaItemId: priorItem.id, pipelineType: "visual", providerName: "google-lens",
      status: "completed", rawRequest: { filename: stored.originalFilename },
      rawResponse: legacyDecision("iPhone 15 Pro"),
      createdAt: new Date(Date.now() + 3_000),
    },
  ]);

  const providerCall = vi.spyOn(MockLensProvider.prototype, "identifyDisplay");
  await processRmaItem(nextItem.id);

  expect(providerCall).toHaveBeenCalledTimes(1);
  const [processed] = await db.select().from(rmaItems).where(eq(rmaItems.id, nextItem.id));
  expect(processed.predictedModel).toBe("iPhone 13 Pro");
  const runs = await db.select().from(recognitionRuns).where(eq(recognitionRuns.rmaItemId, nextItem.id));
  const visualRun = runs.find((run) => run.pipelineType === "visual");
  expect(visualRun?.providerName).toBe("mock_lens");
  expect((visualRun?.rawRequest as { decisionPolicy?: string }).decisionPolicy)
    .toBe(VISUAL_DECISION_POLICY);
});

it("serializes concurrent recognition of duplicate image bytes across five workers", async () => {
  const [customer] = await db.insert(customers).values({ name: "Concurrent duplicate QA" }).returning();
  customerId = customer.id;
  const [reason] = await db.select().from(returnReasons).limit(1);
  const [rma] = await db.insert(rmas).values({
    rmaNumber: `QA-${crypto.randomUUID()}`,
    customerId,
    returnReasonId: reason.id,
  }).returning();
  rmaId = rma.id;
  const image = await sharp({ create: {
    width: 8,
    height: 8,
    channels: 3,
    background: { r: 34, g: 92, b: 148 },
  } }).png().toBuffer();
  const items = await db.insert(rmaItems).values(Array.from({ length: 15 }, (_, index) => ({
    rmaId,
    itemNumber: index + 1,
  }))).returning();

  for (const item of items) {
    const stored = await storage.saveImage(image, "duplicate-display.png", "image/png", `qa-duplicate/${item.id}`);
    storedImagePaths.push(stored.storagePath);
    await db.insert(itemImages).values({
      rmaItemId: item.id,
      imageType: "primary",
      storagePath: stored.storagePath,
      originalFilename: stored.originalFilename,
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
      checksumSha256: stored.checksumSha256,
    });
  }

  const identifyDisplay = MockLensProvider.prototype.identifyDisplay;
  let resultIndex = 0;
  const providerCall = vi.spyOn(MockLensProvider.prototype, "identifyDisplay").mockImplementation(async (buffer, context) => {
    // Hold the first call open long enough for the other worker jobs to contend
    // for the same image checksum before the first result is persisted.
    await new Promise((resolve) => setTimeout(resolve, 40));
    const result = await identifyDisplay.call(new MockLensProvider(), buffer, context);
    const model = resultIndex++ % 2 === 0 ? "iPhone 14 Plus" : "iPhone 15 Pro";
    const candidates = result.candidates.map((candidate) => ({
      ...candidate,
      title: candidate.title.replaceAll("iPhone 13 Pro", model),
      sourceUrl: candidate.sourceUrl?.replaceAll("iphone-13-pro", model.toLowerCase().replaceAll(" ", "-")),
    }));
    const cleanDecision = result.cleanDecision
      ? {
          ...result.cleanDecision,
          model,
          displayName: `Apple ${model} Display`,
          cleanedCandidates: candidates.map((candidate) => candidate.title),
          reasoning: `Independent listings consistently identify ${model}.`,
        }
      : undefined;
    return {
      ...result,
      candidates,
      normalizedModel: model,
      detectedDisplayAssembly: `Apple ${model} Display`,
      cleanDecision,
      rawResponse: { ...result.rawResponse, cleanDecision },
    };
  });

  for (let offset = 0; offset < items.length; offset += 5) {
    await Promise.all(items.slice(offset, offset + 5).map((item) =>
      processRmaItem(item.id, { pipeline: "visual" })
    ));
  }

  const processed = await db.select().from(rmaItems).where(eq(rmaItems.rmaId, rmaId));
  expect(processed).toHaveLength(15);
  expect(processed.every((item) => item.predictedModel === "iPhone 14 Plus")).toBe(true);
  expect(providerCall).toHaveBeenCalledTimes(1);
});
