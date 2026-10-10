import PgBoss from "pg-boss";
import { pool } from "@/db";

const connectionString =
  process.env.DATABASE_URL || "";

export const QUEUE_PROCESS_ITEM = "process-rma-item";

let bossPromise: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    const boss = new PgBoss({
      connectionString,
      max: 5,
    });
    boss.on("error", (error) => console.error("[pg-boss error]", error));
    bossPromise = (async () => {
      await boss.start();
      try {
        await boss.createQueue(QUEUE_PROCESS_ITEM);
      } catch {
        // Queue may already exist; publishing a job below will surface other failures.
      }
      return boss;
    })().catch((error) => {
      bossPromise = null;
      throw error;
    });
  }
  return bossPromise;
}

export interface EnqueueOptions {
  pipeline?: "all" | "visual" | "vendor_ocr";
  force?: boolean;
  revision?: number;
}

/**
 * Enqueues an RMA item for asynchronous processing.
 * Guarantees that the HTTP request lifecycle never blocks on external AI analysis.
 */
export async function enqueueRmaItem(
  itemId: string,
  options?: EnqueueOptions
): Promise<void> {
  const boss = await getBoss();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ recognition_revision: number }>(
      `UPDATE rma_items
       SET status = 'queued',
           recognition_revision = recognition_revision + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING recognition_revision`,
      [itemId]
    );
    const item = result.rows[0];
    if (!item) throw new Error(`RMA item ${itemId} was not found while queueing.`);

    const jobOptions = { ...options, revision: item.recognition_revision };
    const jobId = await boss.send(
      QUEUE_PROCESS_ITEM,
      { itemId, options: jobOptions },
      {
        retryLimit: 3,
        retryDelay: 5,
        db: {
          executeSql: async (text, values) => {
            const queryResult = await client.query(text, values);
            return { rows: queryResult.rows };
          },
        },
      }
    );
    if (!jobId) {
      throw new Error(`pg-boss returned null job ID for queue '${QUEUE_PROCESS_ITEM}'`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch((rollbackError) =>
      console.error(`[Queue] Failed to roll back enqueue for item ${itemId}:`, rollbackError)
    );
    console.error(`[Queue] Durable enqueue failed for item ${itemId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}
