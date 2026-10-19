"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CameraScanner } from "@/components/scanner/CameraScanner";
import { ArrowLeft } from "lucide-react";
import { LoadingMessage } from "@/components/ui/loading-message";

interface CaptureRma { rmaNumber: string; customerName: string | null }

export default function RmaCapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rmaId } = use(params);
  const router = useRouter();
  const [rma, setRma] = useState<CaptureRma | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/rmas/${rmaId}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Could not load this RMA. Return to its details and try again.");
        const data = await response.json();
        setRma(data.rma);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load this RMA.");
      }
    })();
    return () => controller.abort();
  }, [rmaId]);

  return (
    <main className="flex h-dvh min-h-0 flex-col bg-neutral-950 text-white sm:p-4 lg:mx-auto lg:max-w-6xl">
      {error || (rma && !rma.customerName?.trim()) ? <div className="m-auto max-w-sm space-y-4 p-6 text-center">
        <p role="alert">{error || "Add customer information to this RMA before uploading or processing images."}</p>
        <Link href={`/rmas/${rmaId}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-neutral-800 px-4 text-sm"><ArrowLeft className="size-4" /> Return to RMA details</Link>
      </div> : rma ? <CameraScanner rmaId={rmaId} rmaNumber={rma.rmaNumber} customerName={rma.customerName!} onComplete={() => router.push(`/rmas/${rmaId}`)} /> : <LoadingMessage label="Loading camera…" className="m-auto" />}
    </main>
  );
}
