import { db } from "@/db";
import { customers, rmas } from "@/db/schema";
import { eq } from "drizzle-orm";

export const CUSTOMER_REQUIRED = "Add customer information before uploading or processing images.";

/** Protect intake endpoints before storage writes or recognition jobs. */
export async function hasIntakeCustomer(rmaId: string): Promise<boolean> {
  const [customer] = await db
    .select({ name: customers.name })
    .from(rmas)
    .innerJoin(customers, eq(rmas.customerId, customers.id))
    .where(eq(rmas.id, rmaId));
  return Boolean(customer?.name.trim());
}
