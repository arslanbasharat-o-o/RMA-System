import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import { customers, rmas, rmaItems, itemImages, returnReasons, recognitionRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { processRmaItem } from "@/lib/queue/processor";
import { MockLensProvider, type VisualIdentificationResult } from "@/lib/recognition/lens";
import sharp from "sharp";

let customerId = "", rmaId = "";
afterEach(async () => {
  vi.restoreAllMocks();
  if (rmaId) await db.delete(rmas).where(eq(rmas.id, rmaId));
  if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
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
