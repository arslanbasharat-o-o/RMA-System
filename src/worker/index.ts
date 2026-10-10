try {
  process.loadEnvFile();
} catch {
  // Ignore if .env is missing or environment variables are provided via container
}

import { getBoss, QUEUE_PROCESS_ITEM } from "../lib/queue";
import { processRmaItem } from "../lib/queue/processor";

async function runWorker() {
  console.log("=================================================");
  console.log("  RMA System Dedicated Background Worker Starting");
  console.log("=================================================");

  const boss = await getBoss();
  console.log("[Worker] pg-boss connected to database queue.");

  const workerConcurrency = parseInt(process.env.WORKER_CONCURRENCY || "3", 10);

  try {
    await boss.createQueue(QUEUE_PROCESS_ITEM);
  } catch {
    // Queue might already exist
  }

  await boss.work(
    QUEUE_PROCESS_ITEM,
    { batchSize: workerConcurrency, pollingIntervalSeconds: 2 },
    async (jobs) => {
      const results = await Promise.allSettled(
        jobs.map(async (job) => {
          const { itemId, options } = job.data as {
            itemId: string;
            options?: { pipeline?: "all" | "visual" | "vendor_ocr"; force?: boolean; revision?: number };
          };
          console.log(`[Worker] Started job ${job.id} for item ${itemId} (pipeline: ${options?.pipeline || "all"})`);
          try {
            await processRmaItem(itemId, options);
            console.log(`[Worker] Completed job ${job.id}`);
          } catch (err) {
            console.error(`[Worker] Error processing job ${job.id}:`, err);
            throw err;
          }
        })
      );
      const rejected = results.find((r) => r.status === "rejected");
      if (rejected && rejected.status === "rejected") {
        throw rejected.reason;
      }
    }
  );

  console.log(`[Worker] Listening for jobs on '${QUEUE_PROCESS_ITEM}' with concurrency ${workerConcurrency}...`);

  const shutdown = async () => {
    console.log("\n[Worker] Gracefully shutting down worker...");
    await boss.stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

runWorker().catch((err) => {
  console.error("[Worker] Fatal startup error:", err);
  process.exit(1);
});
