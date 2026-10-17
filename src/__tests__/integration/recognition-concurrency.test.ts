import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import { customers, rmas, rmaItems, itemImages, returnReasons } from "@/db/schema";
import { eq } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { processRmaItem } from "@/lib/queue/processor";
import { MockLensProvider, type VisualIdentificationResult } from "@/lib/recognition/lens";

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
