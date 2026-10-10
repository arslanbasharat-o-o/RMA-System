import { describe, it, expect } from "vitest";
import { z } from "zod";

// Schemas matching the application routes
const CreateCustomerSchema = z.object({
  name: z.string().min(2, "Customer name is required"),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

const CreateRmaSchema = z.object({
  customerId: z.string().uuid("Please select a valid customer"),
  returnReasonId: z.string().uuid("Please select a return reason"),
  returnReasonNotes: z.string().optional(),
  externalRmaNumber: z.string().optional(),
  trackingNumber: z.string().optional(),
  expectedDisplayCount: z.number().int().positive().optional().nullable(),
  notes: z.string().optional(),
});

const UpdateRmaSchema = z.object({
  status: z
    .enum([
      "draft",
      "receiving",
      "processing",
      "review_required",
      "completed",
      "archived",
    ])
    .optional(),
  notes: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  externalRmaNumber: z.string().optional().nullable(),
});

export function normalizeModelIdentifier(manufacturer: string, modelName: string): string {
  return `${manufacturer}-${modelName}`
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function rankVisualCandidates(
  candidates: Array<{ title: string; rank?: number; score?: number }>
) {
  return [...candidates].sort((a, b) => {
    if (a.rank !== undefined && b.rank !== undefined) {
      return a.rank - b.rank;
    }
    return (b.score || 0) - (a.score || 0);
  });
}

describe("Customer Validation Schema", () => {
  it("should accept valid customer records", () => {
    const valid = {
      name: "Apple Express Repairs",
      contactName: "John Smith",
      email: "john@applerepairs.com",
      phone: "+1-555-0199",
      notes: "High volume RMA partner",
    };
    expect(CreateCustomerSchema.safeParse(valid).success).toBe(true);
  });

  it("should accept customer with optional email omitted or blank string", () => {
    const withoutEmail = {
      name: "Local Repair Shop",
      email: "",
    };
    expect(CreateCustomerSchema.safeParse(withoutEmail).success).toBe(true);
  });

  it("should reject customer with invalid email format", () => {
    const invalidEmail = {
      name: "Bad Email Shop",
      email: "not-an-email",
    };
    const res = CreateCustomerSchema.safeParse(invalidEmail);
    expect(res.success).toBe(false);
  });

  it("should reject customer with name shorter than 2 characters", () => {
    const shortName = {
      name: "A",
    };
    const res = CreateCustomerSchema.safeParse(shortName);
    expect(res.success).toBe(false);
  });
});

describe("Return Reason & RMA Intake Validation Schema", () => {
  it("should accept valid RMA creation payload with valid UUIDs", () => {
    const validRma = {
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      returnReasonId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      trackingNumber: "1Z9999999999999999",
      expectedDisplayCount: 25,
      notes: "Box arrived slightly dented",
    };
    expect(CreateRmaSchema.safeParse(validRma).success).toBe(true);
  });

  it("should reject RMA creation without a valid customer UUID", () => {
    const invalidRma = {
      customerId: "not-a-uuid",
      returnReasonId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    };
    const res = CreateRmaSchema.safeParse(invalidRma);
    expect(res.success).toBe(false);
  });

  it("should reject non-positive expected display counts", () => {
    const invalidCount = {
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      returnReasonId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      expectedDisplayCount: -5,
    };
    const res = CreateRmaSchema.safeParse(invalidCount);
    expect(res.success).toBe(false);
  });
});

describe("Model Normalization & Candidate Ranking", () => {
  it("should normalize model identifiers predictably", () => {
    expect(normalizeModelIdentifier("Apple", "iPhone 13 Pro")).toBe("apple-iphone-13-pro");
    expect(normalizeModelIdentifier("Samsung", "Galaxy A15 5G (SM-A155F)")).toBe("samsung-galaxy-a15-5g-sm-a155f");
    expect(normalizeModelIdentifier("Xiaomi", "Redmi Note 12 / 12S")).toBe("xiaomi-redmi-note-12-12s");
  });

  it("should rank visual candidates in ascending rank order (rank 1 first)", () => {
    const raw = [
      { title: "Generic Screen", rank: 3 },
      { title: "iPhone 13 Pro OEM Screen", rank: 1 },
      { title: "iPhone 13 Pro Max Screen", rank: 2 },
    ];
    const ranked = rankVisualCandidates(raw);
    expect(ranked[0].title).toBe("iPhone 13 Pro OEM Screen");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].rank).toBe(3);
  });
});

describe("RMA Lifecycle Status Transitions", () => {
  const allowedStatuses = [
    "draft",
    "receiving",
    "processing",
    "review_required",
    "completed",
    "archived",
  ];

  it("should permit valid lifecycle states", () => {
    for (const status of allowedStatuses) {
      expect(UpdateRmaSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("should reject unknown lifecycle status values", () => {
    const res = UpdateRmaSchema.safeParse({ status: "cancelled_by_user" });
    expect(res.success).toBe(false);
  });
});
