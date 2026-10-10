import { NextResponse } from "next/server";
import { pool } from "@/db";

export async function GET() {
  const startTime = Date.now();
  let isHealthy = true;

  try {
    await pool.query("SELECT 1 as ping;");
  } catch (err) {
    isHealthy = false;
    console.error("Health check database query failed:", err);
  }

  return NextResponse.json(
    {
      status: isHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      database: isHealthy ? "healthy" : "unhealthy",
      durationMs: Date.now() - startTime,
      version: "1.0.0",
    },
    { status: isHealthy ? 200 : 503 }
  );
}
