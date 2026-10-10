"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { CameraScanner } from "@/components/scanner/CameraScanner";
import { ArrowLeft } from "lucide-react";

export default function RmaCapturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rmaId } = use(params);
  const router = useRouter();
  const [rma, setRma] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRma() {
      try {
        const res = await fetch(`/api/rmas/${rmaId}`);
        if (res.ok) {
          const json = await res.json();
          setRma(json.rma);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadRma();
  }, [rmaId]);

  if (loading || !rma) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="text-xs text-neutral-400 animate-pulse">
          Initializing Camera Scanner...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 p-2 sm:p-4 flex flex-col justify-center">
      <div className="max-w-4xl mx-auto w-full mb-2 flex items-center justify-between text-neutral-400">
        <button
          onClick={() => router.push(`/rmas/${rmaId}`)}
          className="inline-flex items-center text-xs hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          <span>Return to RMA Details</span>
        </button>
      </div>

      <CameraScanner
        rmaId={rmaId}
        rmaNumber={rma.rmaNumber}
        customerName={rma.customerName}
        onComplete={() => router.push(`/rmas/${rmaId}`)}
      />
    </div>
  );
}
