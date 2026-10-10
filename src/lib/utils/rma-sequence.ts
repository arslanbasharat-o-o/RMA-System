import { pool } from "@/db";

/**
 * Generates an atomic, collision-resistant, concurrency-safe RMA identifier.
 * Example format: RMA-2026-000001
 * Uses PostgreSQL sequence `rma_number_seq` to guarantee monotonicity even
 * under high concurrency across multiple Next.js / worker processes.
 */
export async function generateNextRmaNumber(year?: number): Promise<string> {
  const targetYear = year ?? new Date().getFullYear();

  try {
    const result = await pool.query<{ next_val: string }>(
      `SELECT nextval('rma_number_seq') AS next_val;`
    );
    const seqNumber = parseInt(result.rows[0].next_val, 10);
    const formattedSeq = String(seqNumber).padStart(6, "0");
    return `RMA-${targetYear}-${formattedSeq}`;
  } catch (err: any) {
    if (err?.code === "42P01") {
      await pool.query(`CREATE SEQUENCE IF NOT EXISTS rma_number_seq START 1;`);
      const result = await pool.query<{ next_val: string }>(
        `SELECT nextval('rma_number_seq') AS next_val;`
      );
      const seqNumber = parseInt(result.rows[0].next_val, 10);
      const formattedSeq = String(seqNumber).padStart(6, "0");
      return `RMA-${targetYear}-${formattedSeq}`;
    }
    throw err;
  }
}
