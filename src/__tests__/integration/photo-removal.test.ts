import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "@/db";
import { customers, itemImages, recognitionRuns, returnReasons, reviewActions, rmaItems, rmas, sessions, users } from "@/db/schema";
import { createSessionToken } from "@/lib/auth/session";
import { getBoss, QUEUE_PROCESS_ITEM } from "@/lib/queue";
import { processRmaItem } from "@/lib/queue/processor";
import { MockLensProvider, type VisualIdentificationResult } from "@/lib/recognition/lens";
import { storage } from "@/lib/storage";
import { createUniqueTestImage } from "@/__tests__/helpers/image-fixtures";
import { DELETE } from "@/app/api/rma-items/[id]/images/[imageId]/route";
import { GET } from "@/app/api/rma-items/[id]/route";

describe("Removing an incorrect intake photo", () => {
  let userId = "", customerId = "", reasonId = "", rmaId = "", token = "";
  const itemIds: string[] = [];
  const paths: string[] = [];
  let itemNumber = 0;

  beforeAll(async () => {
    const key = crypto.randomUUID();
    const [user] = await db.insert(users).values({ email: `${key}@example.test`, name: "Photo removal QA", passwordHash: "unused", role: "admin" }).returning();
    userId = user.id;
    token = await createSessionToken({ userId, email: user.email, name: user.name, role: "admin" });
    const [customer] = await db.insert(customers).values({ name: "Synthetic photo removal QA" }).returning();
    customerId = customer.id;
    const [reason] = await db.insert(returnReasons).values({ code: `PHOTO-${key}`, label: "Photo QA" }).returning();
    reasonId = reason.id;
    const [rma] = await db.insert(rmas).values({ rmaNumber: `PHOTO-${key}`, customerId, returnReasonId: reasonId }).returning();
    rmaId = rma.id;
    await getBoss();
  });
  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    if (itemIds.length) await pool.query("DELETE FROM pgboss.job WHERE name = $1 AND data->>'itemId' = ANY($2)", [QUEUE_PROCESS_ITEM, itemIds]);
    await (await getBoss()).stop();
    if (rmaId) await db.delete(rmas).where(eq(rmas.id, rmaId));
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
    if (reasonId) await db.delete(returnReasons).where(eq(returnReasons.id, reasonId));
    if (userId) {
      await db.delete(sessions).where(eq(sessions.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    await Promise.all(paths.map(path => storage.deleteImage(path)));
  });

  async function makeItem(photoCount = 1) {
    const [item] = await db.insert(rmaItems).values({ rmaId, itemNumber: ++itemNumber, status: "suggested_match", predictedModel: "Wrong photo model" }).returning();
    itemIds.push(item.id);
    const photos = [];
    for (let i = 0; i < photoCount; i++) {
      const stored = await storage.saveImage(await createUniqueTestImage(), `photo-${i}.png`, "image/png", `photo-removal-qa/${item.id}`);
      paths.push(stored.storagePath);
      const [photo] = await db.insert(itemImages).values({ ...stored, rmaItemId: item.id, imageType: i ? "back" : "primary", sortOrder: i }).returning();
      photos.push(photo);
    }
    return { item, photos };
  }
  const remove = (id: string, imageId: string, authenticated = true) => DELETE(
    new NextRequest(`http://localhost/api/rma-items/${id}/images/${imageId}`, { method: "DELETE", headers: authenticated ? { cookie: `rma_session=${token}` } : {} }),
    { params: Promise.resolve({ id, imageId }) }
  );

  it("removes only the selected image and its files, retaining the display for a replacement", async () => {
    const { item, photos: [photo] } = await makeItem();
    const result = await remove(item.id, photo.id);
    expect(result.status).toBe(200);
    expect((await result.json()).itemStatus).toBe("pending_upload");
    expect(await db.select().from(itemImages).where(eq(itemImages.id, photo.id))).toHaveLength(0);
    const [updated] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(updated.status).toBe("pending_upload");
    expect(updated.predictedModel).toBeNull();
    expect(updated.recognitionRevision).toBe(item.recognitionRevision + 1);
    for (const path of [photo.storagePath, photo.previewPath!, photo.thumbnailPath!]) {
      await expect(storage.getImageBuffer(path)).rejects.toThrow();
    }
    expect(await db.select().from(reviewActions).where(eq(reviewActions.rmaItemId, item.id))).toMatchObject([{ actionType: "remove_photo" }]);
  });

  it("atomically queues remaining photos with the new revision and retains their files", async () => {
    const { item, photos } = await makeItem(2);
    expect((await remove(item.id, photos[0].id)).status).toBe(200);
    const remaining = await db.select().from(itemImages).where(eq(itemImages.rmaItemId, item.id));
    expect(remaining.map(p => p.id)).toEqual([photos[1].id]);
    expect((await storage.getImageBuffer(photos[1].storagePath)).length).toBeGreaterThan(0);
    const jobs = await pool.query("SELECT data FROM pgboss.job WHERE name = $1 AND data->>'itemId' = $2", [QUEUE_PROCESS_ITEM, item.id]);
    expect(jobs.rows).toMatchObject([{ data: { itemId: item.id, options: { revision: item.recognitionRevision + 1 } } }]);
  });

  it("rolls back the photo, revision, audit and file deletion when queue publication fails", async () => {
    const { item, photos } = await makeItem(2);
    vi.spyOn(await getBoss(), "send").mockResolvedValueOnce(null);
    expect((await remove(item.id, photos[0].id)).status).toBe(503);
    expect(await db.select().from(itemImages).where(eq(itemImages.rmaItemId, item.id))).toHaveLength(2);
    const [updated] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(updated.recognitionRevision).toBe(item.recognitionRevision);
    expect(updated.predictedModel).toBe(item.predictedModel);
    expect(await db.select().from(reviewActions).where(eq(reviewActions.rmaItemId, item.id))).toHaveLength(0);
    expect((await storage.getImageBuffer(photos[0].storagePath)).length).toBeGreaterThan(0);
  });

  it("rejects an image from another display, unauthenticated requests and verified displays", async () => {
    const a = await makeItem(), b = await makeItem();
    expect((await remove(a.item.id, b.photos[0].id)).status).toBe(404);
    expect((await remove(a.item.id, a.photos[0].id, false)).status).toBe(401);
    await db.update(rmaItems).set({ status: "verified", verifiedAt: new Date() }).where(eq(rmaItems.id, a.item.id));
    expect((await remove(a.item.id, a.photos[0].id)).status).toBe(409);
    expect(await db.select().from(itemImages).where(inArray(itemImages.rmaItemId, [a.item.id, b.item.id]))).toHaveLength(2);
  });

  it("reports the committed removal even if a storage cleanup operation fails", async () => {
    const { item, photos: [photo] } = await makeItem();
    vi.spyOn(storage, "deleteImage").mockRejectedValueOnce(new Error("Synthetic storage interruption"));
    const result = await remove(item.id, photo.id);
    expect(result.status).toBe(200);
    expect((await result.json()).success).toBe(true);
    expect(await db.select().from(itemImages).where(eq(itemImages.id, photo.id))).toHaveLength(0);
  });

  it("prevents a running worker from restoring the removed photo's result or evidence", async () => {
    const { item, photos: [photo] } = await makeItem();
    let release: ((value: VisualIdentificationResult) => void) | undefined;
    vi.spyOn(MockLensProvider.prototype, "identifyDisplay").mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const processing = processRmaItem(item.id, { revision: item.recognitionRevision });
    try {
      await vi.waitFor(() => expect(release).toBeTypeOf("function"));
      expect((await remove(item.id, photo.id)).status).toBe(200);
    } finally {
      release?.({ provider: "mock_lens", candidates: [{ title: "Wrong model", rank: 1 }], normalizedModel: "Wrong model", rawResponse: {}, durationMs: 1 });
      await processing;
    }
    const [updated] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(updated.status).toBe("pending_upload");
    expect(updated.predictedModel).toBeNull();
    expect(await db.select().from(recognitionRuns).where(eq(recognitionRuns.rmaItemId, item.id))).not.toHaveLength(0);
    const result = await GET(new NextRequest(`http://localhost/api/rma-items/${item.id}`, { headers: { cookie: `rma_session=${token}` } }), { params: Promise.resolve({ id: item.id }) });
    const data = await result.json();
    expect(data.images).toEqual([]);
    expect(data.candidates).toEqual([]);
    expect(data.ocrExtractions).toEqual([]);
    expect(data.runs.length).toBeGreaterThan(0); // History remains available for audit.
  });
});
