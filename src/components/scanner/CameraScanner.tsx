"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Camera, SwitchCamera, Images, Check, AlertCircle, Loader2, ArrowRight, RotateCcw, ScanLine } from "lucide-react";

interface CapturedPhoto {
  id: string;
  blob: Blob;
  previewUrl: string;
  imageType: "primary" | "back" | "stamp_closeup";
  status: "uploading" | "saved" | "error";
  error?: string;
  serverImageId?: string;
}

const angles = [
  { type: "primary", label: "Front", hint: "Fit the entire front of the display inside the guide." },
  { type: "back", label: "Back", hint: "Turn the display over. Keep connectors and labels in focus." },
  { type: "stamp_closeup", label: "Label", hint: "Move closer to the stamp or sticker. Avoid glare." },
] as const;

export function CameraScanner({ rmaId, rmaNumber, customerName, onComplete }: {
  rmaId: string;
  rmaNumber: string;
  customerName: string;
  onComplete?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);
  const previewUrls = useRef(new Set<string>());
  const itemIdRef = useRef<string | null>(null);
  const pendingItem = useRef<Promise<string> | null>(null);
  const captureLock = useRef(false);
  const pickerAngle = useRef<CapturedPhoto["imageType"]>("primary");
  const uploadQueue = useRef<Promise<void>>(Promise.resolve());
  const uploadingPhotos = useRef(new Set<string>());
  const savedPhotosByImageId = useRef(new Map<string, string>());
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturing, setCapturing] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [displayNumber, setDisplayNumber] = useState(1);
  const [completed, setCompleted] = useState(0);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [angle, setAngle] = useState<CapturedPhoto["imageType"]>("primary");
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const customerReady = Boolean(customerName?.trim());
  const saving = capturing || photos.some((photo) => photo.status === "uploading");
  const failed = photos.some((photo) => photo.status === "error");
  const canAdvance = photos.length > 0 && !saving && !failed;
  const selectedAngle = angles.find((entry) => entry.type === angle)!;

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    const request = ++cameraRequest.current;
    stopTracks();
    setCameraActive(false);
    setCameraError(null);
    if (!customerReady) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      // A permission prompt can resolve after navigation or a camera switch.
      if (request !== cameraRequest.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (request !== cameraRequest.current) return;
      setCameraActive(true);
    } catch (error) {
      if (request !== cameraRequest.current) return;
      stopTracks();
      const name = error instanceof Error ? error.name : "";
      setCameraError(name === "NotAllowedError"
        ? "Allow camera access in your browser settings, then try again."
        : "No camera is available. Connect a camera or choose photos from your device.");
    }
  }, [customerReady, facingMode, stopTracks]);

  useEffect(() => {
    void startCamera();
    return () => { ++cameraRequest.current; stopTracks(); };
  }, [startCamera, stopTracks]);

  useEffect(() => () => { previewUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  useEffect(() => {
    if (!flashing) return;
    const timer = window.setTimeout(() => setFlashing(false), 150);
    return () => window.clearTimeout(timer);
  }, [flashing]);
  useEffect(() => {
    if (!saving && !failed) return;
    const protectUpload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", protectUpload);
    return () => window.removeEventListener("beforeunload", protectUpload);
  }, [saving, failed]);

  const ensureItem = async (): Promise<string> => {
    if (!customerReady) throw new Error("Add customer information before starting intake.");
    if (itemIdRef.current) return itemIdRef.current;
    if (pendingItem.current) return pendingItem.current;
    pendingItem.current = (async () => {
      const response = await fetch(`/api/rmas/${rmaId}/items`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create the display. Try again.");
      itemIdRef.current = data.item.id;
      setDisplayNumber(data.item.itemNumber);
      return data.item.id as string;
    })();
    try { return await pendingItem.current; }
    finally { pendingItem.current = null; }
  };

  const performUpload = async (photo: CapturedPhoto) => {
    setPhotos((previous) => previous.map((entry) => entry.id === photo.id ? { ...entry, status: "uploading", error: undefined } : entry));
    try {
      const itemId = await ensureItem();
      const form = new FormData();
      const filename = photo.blob instanceof File ? photo.blob.name : `${photo.id}.jpg`;
      form.append("file", photo.blob, filename);
      form.append("imageType", photo.imageType);
      const response = await fetch(`/api/rma-items/${itemId}/upload`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed. Try again.");
      const serverImageId = data.image?.id;
      if (typeof serverImageId !== "string" || !serverImageId) {
        throw new Error("The photo could not be confirmed as saved. Try again.");
      }
      const storedAngle = angles.find((entry) => entry.type === data.image?.imageType
        || (entry.type === "primary" && data.image?.imageType === "front"));
      if (data.deduplicated) {
        setIntakeError(`This photo is already saved as ${storedAngle?.label || "an existing angle"}. No duplicate was added. Take a different photo for another side.`);
      }
      const existingPhotoId = savedPhotosByImageId.current.get(serverImageId);
      if (existingPhotoId && existingPhotoId !== photo.id) {
        URL.revokeObjectURL(photo.previewUrl);
        previewUrls.current.delete(photo.previewUrl);
        setPhotos((previous) => previous.filter((entry) => entry.id !== photo.id));
        return;
      }
      savedPhotosByImageId.current.set(serverImageId, photo.id);
      setPhotos((previous) => previous.map((entry) => entry.id === photo.id ? {
        ...entry, status: "saved", serverImageId,
        imageType: storedAngle?.type || photo.imageType,
      } : entry));
    } catch (error) {
      setPhotos((previous) => previous.map((entry) => entry.id === photo.id ? {
        ...entry, status: "error", error: error instanceof Error ? error.message : "Connection lost. Try again.",
      } : entry));
    }
  };

  const uploadPhoto = (photo: CapturedPhoto) => {
    if (uploadingPhotos.current.has(photo.id)) return;
    uploadingPhotos.current.add(photo.id);
    // Serialize uploads so two selected copies reach server deduplication in order.
    uploadQueue.current = uploadQueue.current.then(() => performUpload(photo)).finally(() => {
      uploadingPhotos.current.delete(photo.id);
    });
  };

  const addPhoto = (blob: Blob, imageType: CapturedPhoto["imageType"]) => {
    const previewUrl = URL.createObjectURL(blob);
    previewUrls.current.add(previewUrl);
    const photo: CapturedPhoto = { id: crypto.randomUUID(), blob, previewUrl, imageType, status: "uploading" };
    setPhotos((previous) => [...previous, photo]);
    void uploadPhoto(photo);
  };

  const processFiles = (files: File[], imageType: CapturedPhoto["imageType"]) => {
    if (!customerReady) return;
    setIntakeError(null);
    files.forEach((file) => {
      if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) {
        setIntakeError("Choose image files smaller than 25 MB.");
        return;
      }
      addPhoto(file, imageType);
    });
  };

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!customerReady || !cameraActive || saving || uploadingPhotos.current.size > 0 || captureLock.current || !video?.videoWidth || !canvas) return;
    const capturedAngle = angle;
    captureLock.current = true;
    setCapturing(true);
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not capture this photo. Try again.");
      context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("Could not capture this photo. Try again.");
      setFlashing(true);
      setIntakeError(null);
      addPhoto(blob, capturedAngle);
    } catch (error) {
      setIntakeError(error instanceof Error ? error.message : "Capture failed. Try again.");
    } finally { captureLock.current = false; setCapturing(false); }
  };

  const nextDisplay = () => {
    if (!canAdvance) return;
    photos.forEach((photo) => { URL.revokeObjectURL(photo.previewUrl); previewUrls.current.delete(photo.previewUrl); });
    setPhotos([]);
    savedPhotosByImageId.current.clear();
    itemIdRef.current = null;
    setCompleted((previous) => previous + 1);
    setDisplayNumber((previous) => previous + 1);
    setAngle("primary");
    setIntakeError(null);
  };

  const finish = () => {
    if (saving || failed) return;
    stopTracks();
    onComplete?.();
  };
  const buttonStyle = "inline-flex items-center justify-center gap-2 rounded-xl min-h-11 px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <section aria-label="Display camera intake" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-neutral-950 text-white sm:rounded-2xl sm:border sm:border-neutral-800 [&_button]:touch-manipulation [&_button]:select-none">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-5">
        <div className="min-w-0">
          <p className="text-xs font-mono text-neutral-400">{rmaNumber}</p>
          <h1 className="truncate text-sm font-semibold sm:text-base">{customerName}</h1>
        </div>
        <button type="button" onClick={finish} disabled={saving || failed} className={`${buttonStyle} bg-neutral-800 hover:bg-neutral-700`}>
          <Check className="size-4" /> Finish <span className="sr-only">intake</span>
        </button>
      </header>

      {!customerReady ? <div role="alert" className="p-6 text-amber-200">Add customer information on the RMA before using the scanner.</div> : <>
        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 text-xs">
              <span className="font-semibold">Display {displayNumber}</span>
              <span className="text-neutral-400">{completed + (canAdvance ? 1 : 0)} saved this session</span>
            </div>
            <div data-testid="camera-viewfinder" className={`relative min-h-40 flex-1 overflow-hidden bg-black ${dragging ? "ring-2 ring-inset ring-emerald-400" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); processFiles(Array.from(event.dataTransfer.files), angle); }}>
              {/* Keep mounted so the stream always attaches to a real video element. */}
              <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 h-full w-full object-contain ${facingMode === "user" ? "-scale-x-100" : ""}`} />
              {cameraActive && <div className="pointer-events-none absolute left-1/2 top-[8%] h-[84%] aspect-[9/16] max-w-[80%] -translate-x-1/2 rounded-2xl border border-white/25">
                {['top-0 left-0 border-t-2 border-l-2 rounded-tl-2xl', 'top-0 right-0 border-t-2 border-r-2 rounded-tr-2xl', 'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-2xl', 'bottom-0 right-0 border-b-2 border-r-2 rounded-br-2xl'].map((corner) => <span key={corner} className={`absolute size-8 border-white/80 ${corner}`} />)}
              </div>}
              {!cameraActive && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <Camera className="size-9 text-neutral-500" />
                <h2 className="text-base font-semibold">{cameraError ? "Camera unavailable" : "Opening camera…"}</h2>
                <p className="max-w-xs text-sm leading-relaxed text-neutral-400">{cameraError || "Allow camera access to photograph this display."}</p>
                {cameraError && <button type="button" onClick={() => void startCamera()} className={`${buttonStyle} border border-neutral-600 hover:bg-neutral-800`}><RotateCcw className="size-4" /> Try camera again</button>}
              </div>}
              {flashing && <div className="pointer-events-none absolute inset-0 bg-white/30 motion-reduce:bg-white/10" />}
              {dragging && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-950/90 text-sm font-medium">Drop photos for display {displayNumber}</div>}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </div>

          <aside className="hidden overflow-y-auto border-l border-neutral-800 p-5 lg:block">
            <ScanLine className="mb-4 size-6 text-neutral-400" />
            <h2 className="font-semibold">Capture each display</h2>
            <ol className="mt-4 space-y-4 text-sm text-neutral-400">
              <li><span className="block font-medium text-white">1. Front</span>Keep the full display in frame.</li>
              <li><span className="block font-medium text-white">2. Back</span>Photograph connectors and markings.</li>
              <li><span className="block font-medium text-white">3. Label, if needed</span>Add a close-up of stamps or stickers.</li>
            </ol>
            <p className="mt-6 border-t border-neutral-800 pt-4 text-xs leading-relaxed text-neutral-500">Use even lighting and avoid reflections. You can also drag photos into the viewfinder.</p>
          </aside>
        </div>

        <footer className="shrink-0 border-t border-neutral-800 bg-neutral-900 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-5">
          <div className="mx-auto max-w-3xl">
            <div className="flex gap-1 rounded-xl bg-neutral-950 p-1" role="group" aria-label="Photo angle">
              {angles.map((entry) => <button key={entry.type} type="button" onClick={() => setAngle(entry.type)} disabled={saving} aria-pressed={angle === entry.type}
                className={`min-h-10 flex-1 rounded-lg text-sm font-medium focus-visible:outline-2 focus-visible:outline-white ${angle === entry.type ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}>{entry.label}</button>)}
            </div>
            <p className="mt-2 text-center text-xs leading-5 text-neutral-400">{selectedAngle.hint}</p>
            <div className="mt-2 grid grid-cols-3 items-center justify-items-center">
              <button type="button" onClick={() => setFacingMode((previous) => previous === "environment" ? "user" : "environment")} disabled={!cameraActive || saving} aria-label="Switch camera" className={`${buttonStyle} flex-col gap-1 px-4 text-neutral-300 hover:bg-neutral-800`}><SwitchCamera className="size-5" /><span className="text-[11px]">Switch</span></button>
              <button type="button" onClick={() => void capture()} disabled={!cameraActive || saving} aria-label={`Capture ${selectedAngle.label.toLowerCase()} photo`} className="flex size-16 items-center justify-center rounded-full border-[3px] border-white p-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:opacity-30 active:scale-95 motion-reduce:transform-none">
                <span className="flex h-full w-full items-center justify-center rounded-full bg-white">{capturing && <Loader2 className="size-5 animate-spin text-neutral-900" />}</span>
              </button>
              <button type="button" disabled={saving} onClick={() => { pickerAngle.current = angle; fileInputRef.current?.click(); }} className={`${buttonStyle} flex-col gap-1 px-4 text-neutral-300 hover:bg-neutral-800`}><Images className="size-5" /><span className="text-[11px]">Photos</span></button>
              <input type="file" ref={fileInputRef} accept="image/*" multiple aria-label="Choose display photos" className="hidden" onChange={(event) => { processFiles(Array.from(event.target.files || []), pickerAngle.current); event.target.value = ""; }} />
            </div>
            {photos.length > 0 && <div className="mt-3 flex items-center gap-3 border-t border-neutral-800 pt-3">
              <div aria-label="Captured photos" className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
                {photos.map((photo, index) => <div key={photo.id} className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-neutral-700">
                  <img src={photo.previewUrl} alt={`${angles.find((entry) => entry.type === photo.imageType)?.label} angle ${index + 1}`} className="size-full object-cover" />
                  <span className="absolute top-0 left-0 rounded-br bg-black/80 px-1 text-[10px] text-white">{angles.find((entry) => entry.type === photo.imageType)?.label}</span>
                  {photo.status === "uploading" && <span aria-label="Saving photo" className="absolute inset-0 flex items-center justify-center bg-black/60"><Loader2 className="size-4 animate-spin" /></span>}
                  {photo.status === "saved" && <span aria-label="Photo saved" className="absolute bottom-0 right-0 rounded-tl bg-emerald-700 p-1"><Check className="size-3" /></span>}
                  {photo.status === "error" && <button type="button" aria-label={`Retry photo ${index + 1}`} title={photo.error} onClick={() => void uploadPhoto(photo)} className="absolute inset-0 flex items-center justify-center bg-red-950/90"><RotateCcw className="size-5" /></button>}
                </div>)}
              </div>
              <button type="button" onClick={nextDisplay} disabled={!canAdvance} className={`${buttonStyle} shrink-0 bg-white text-neutral-950 hover:bg-neutral-200`}>Next display <ArrowRight className="size-4" /></button>
            </div>}
            <div role="status" aria-live="polite" className="mt-2 text-center text-xs text-neutral-400">
              {saving ? "Saving photos — keep this page open." : failed ? <span className="text-red-300">Upload failed. Tap a failed photo to retry before continuing.</span> : photos.length > 0 ? `${photos.length} ${photos.length === 1 ? "photo" : "photos"} saved. Add another angle or continue.` : "Capture a photo or choose one from your device."}
            </div>
            {intakeError && <p role="alert" className="mt-2 flex items-center justify-center gap-2 text-xs text-red-300"><AlertCircle className="size-4" />{intakeError}</p>}
          </div>
        </footer>
      </>}
    </section>
  );
}
