import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, sessions, customers, rmas, rmaItems, returnReasons, recognitionRuns, recognitionCandidates, reviewActions, itemImages, ocrExtractions } from "@/db/schema";
import { createSessionToken } from "@/lib/auth/session";
import { processRmaItem } from "@/lib/queue/processor";
import { storage } from "@/lib/storage";
import { GET } from "@/app/api/rma-items/[id]/route";
import { eq } from "drizzle-orm";

describe("Current item inspection evidence", () => {
  let userId = "", customerId = "", rmaId = "", itemId = "", token = "";
  beforeAll(async () => {
    const key = crypto.randomUUID();
    const [user] = await db.insert(users).values({ email: `${key}@example.test`, name: "Evidence QA", passwordHash: "unused-test-hash", role: "admin" }).returning();
    userId = user.id;
    token = await createSessionToken({ userId, email: user.email, name: user.name, role: "admin" });
    const [customer] = await db.insert(customers).values({ name: "Synthetic evidence QA" }).returning();
    customerId = customer.id;
    const [reason] = await db.select().from(returnReasons).limit(1);
    const [rma] = await db.insert(rmas).values({ rmaNumber: `QA-${key}`, customerId, returnReasonId: reason.id }).returning();
    rmaId = rma.id;
    const [item] = await db.insert(rmaItems).values({ rmaId, itemNumber: 1, recognitionRevision: 3 }).returning();
    itemId = item.id;
    const [oldRun] = await db.insert(recognitionRuns).values({ rmaItemId: itemId, recognitionRevision: 1, pipelineType: "visual", providerName: "mock", status: "completed", createdAt: new Date("2026-01-03") }).returning();
    const [newRun] = await db.insert(recognitionRuns).values({ rmaItemId: itemId, recognitionRevision: 2, pipelineType: "visual", providerName: "mock", status: "completed", rawResponse: { visual_matches: [{ title: "16Pro lcd screen" }] }, createdAt: new Date("2026-01-02") }).returning();
    const [oldOcr] = await db.insert(recognitionRuns).values({ rmaItemId: itemId, recognitionRevision: 1, pipelineType: "vendor_ocr", providerName: "mock", status: "completed", createdAt: new Date("2026-01-04") }).returning();
    const [newOcr] = await db.insert(recognitionRuns).values({ rmaItemId: itemId, recognitionRevision: 3, pipelineType: "vendor_ocr", providerName: "mock", status: "completed", createdAt: new Date("2026-01-02") }).returning();
    await db.insert(ocrExtractions).values([
      { rmaItemId: itemId, recognitionRunId: oldOcr.id, rawText: ["Stale OCR"] },
      { rmaItemId: itemId, recognitionRunId: newOcr.id, rawText: ["Current OCR"] },
    ]);
    await db.insert(recognitionCandidates).values([
      { rmaItemId: itemId, recognitionRunId: oldRun.id, candidateType: "display_model", candidateTitle: "Old generation", rank: 1 },
      { rmaItemId: itemId, recognitionRunId: newRun.id, candidateType: "display_model", candidateTitle: "Reordered cleaner title Pro Max", rank: 1 },
    ]);
  });
  afterAll(async () => {
    if (rmaId) await db.delete(rmas).where(eq(rmas.id, rmaId));
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
    if (userId) {
      await db.delete(sessions).where(eq(sessions.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  });
  it("returns only the latest run and its original source title with a no-store response", async () => {
    const response = await GET(new NextRequest("http://localhost/api/rma-items/test", { headers: { cookie: `rma_session=${token}` } }), { params: Promise.resolve({ id: itemId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].candidateTitle).toBe("16Pro lcd screen");
    expect(body.item.recognitionRevision).toBe(3);
    expect(body.ocrExtractions).toHaveLength(1);
    expect(body.ocrExtractions[0].rawText).toEqual(["Current OCR"]);
  });
  it("retains an operator model correction when a forced retry returns another model", async () => {
    const stored = await storage.saveImage(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"), "iphone13_ami.jpg", "image/png", `qa-evidence/${itemId}`);
    await db.insert(itemImages).values({ rmaItemId: itemId, imageType: "primary", storagePath: stored.storagePath, originalFilename: stored.originalFilename, mimeType: stored.mimeType, fileSizeBytes: stored.fileSizeBytes, checksumSha256: stored.checksumSha256 });
    await db.insert(reviewActions).values({ rmaItemId: itemId, userId, actionType: "change_model", previousState: {}, newState: { predicted_model: "iPhone 16 Pro", predicted_manufacturer: "Apple", predicted_display_assembly: "Apple iPhone 16 Pro Display", catalog_display_id: null }, notes: "Synthetic operator correction" });
    await processRmaItem(itemId, { force: true });
    const [result] = await db.select().from(rmaItems).where(eq(rmaItems.id, itemId));
    expect(result.predictedModel).toBe("iPhone 16 Pro");
    expect(result.predictedDisplayAssembly).toBe("Apple iPhone 16 Pro Display");
    expect(result.reviewNotes).toContain("Automated suggestion: iPhone 13 Pro");
    expect(result.status).toBe("review_required");
    expect(result.matchStatus).toBe("ambiguous");
    const response = await GET(new NextRequest("http://localhost/api/rma-items/test", { headers: { cookie: `rma_session=${token}` } }), { params: Promise.resolve({ id: itemId }) });
    expect((await response.json()).item.modelSource).toBe("manual");
  });

});
