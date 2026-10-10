import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  customer: vi.fn(), select: vi.fn(), transaction: vi.fn(), insert: vi.fn(),
  enqueue: vi.fn(), saveImage: vi.fn(), sequence: vi.fn(),
}));
vi.mock("@/lib/auth/middleware", () => ({ requireAuth: vi.fn(async () => ({ user: { userId: "test-user" } })) }));
vi.mock("@/lib/intake-customer", () => ({ hasIntakeCustomer: mocks.customer, CUSTOMER_REQUIRED: "Add customer information before uploading or processing images." }));
vi.mock("@/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction, insert: mocks.insert } }));
vi.mock("@/lib/queue", () => ({ enqueueRmaItem: mocks.enqueue }));
vi.mock("@/lib/storage", () => ({ storage: { saveImage: mocks.saveImage } }));
vi.mock("@/lib/utils/rma-sequence", () => ({ generateNextRmaNumber: mocks.sequence }));

import { POST as upload } from "@/app/api/rma-items/[id]/upload/route";
import { POST as retry } from "@/app/api/rma-items/[id]/recognition/route";
import { POST as addItem } from "@/app/api/rmas/[id]/items/route";
import { POST as createRma } from "@/app/api/rmas/route";
import { POST as bulkAction } from "@/app/api/rmas/[id]/bulk-action/route";

const params = { params: Promise.resolve({ id: "test-id" }) };
const request = () => new NextRequest("http://localhost/api/test", { method: "POST" });
function selectRows(rows: unknown[]) {
  mocks.select.mockReturnValue({ from: () => ({ where: async () => rows }) });
}

describe("Customer requirement protects intake before side effects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.customer.mockResolvedValue(false);
    selectRows([{ id: "test-id", rmaId: "test-rma" }]);
  });

  it("rejects image upload before reading files, writing storage, or queueing recognition", async () => {
    const req = request();
    const parseFiles = vi.spyOn(req, "formData");
    const response = await upload(req, params);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("customer information");
    expect(parseFiles).not.toHaveBeenCalled();
    expect(mocks.saveImage).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects recognition retries without changing item status or publishing a job", async () => {
    const response = await retry(request(), params);
    expect(response.status).toBe(400);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("rejects new display creation before starting a write transaction", async () => {
    const response = await addItem(request(), params);
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects RMA creation with no customer before allocating a number", async () => {
    const req = new NextRequest("http://localhost/api/rmas", { method: "POST", body: JSON.stringify({ returnReasonId: "11111111-1111-4111-8111-111111111111" }) });
    expect((await createRma(req)).status).toBe(400);
    expect(mocks.sequence).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects bulk recognition retries without queueing work", async () => {
    const req = new NextRequest("http://localhost/api/test", { method: "POST", body: JSON.stringify({ action: "bulk_reprocess", itemIds: ["11111111-1111-4111-8111-111111111111"] }) });
    expect((await bulkAction(req, params)).status).toBe(400);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it.each([{ name: "   ", active: true }, { name: "Customer", active: false }])("rejects invalid customer records before allocating a number: %j", async (customer) => {
    selectRows([customer]);
    const req = new NextRequest("http://localhost/api/rmas", { method: "POST", body: JSON.stringify({ customerId: "11111111-1111-4111-8111-111111111111", returnReasonId: "22222222-2222-4222-8222-222222222222" }) });
    expect((await createRma(req)).status).toBe(400);
    expect(mocks.sequence).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("lets a named customer reach upload validation", async () => {
    mocks.customer.mockResolvedValue(true);
    const form = new FormData();
    const req = new NextRequest("http://localhost/api/test", { method: "POST", body: form });
    const response = await upload(req, params);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("No image file");
    expect(mocks.saveImage).not.toHaveBeenCalled();
  });
});
