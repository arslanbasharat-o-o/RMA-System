"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Camera,
  RotateCcw,
  FlipHorizontal,
  Upload,
  Plus,
  Check,
  AlertCircle,
  Image as ImageIcon,
  ChevronRight,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";

interface CapturedPhoto {
  id: string; // local temporary id
  blob: Blob;
  previewUrl: string;
  imageType: "primary" | "front" | "back" | "stamp_closeup" | "sticker_closeup";
  uploading: boolean;
  uploaded: boolean;
  error?: string;
  serverImageId?: string;
}

interface CurrentDisplayDraft {
  itemNumber: number;
  serverItemId?: string;
  photos: CapturedPhoto[];
}

export function CameraScanner({
  rmaId,
  rmaNumber,
  customerName,
  onComplete,
}: {
  rmaId: string;
  rmaNumber: string;
  customerName: string;
  onComplete?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Display counters and queue
  const [displayNumber, setDisplayNumber] = useState(1);
  const [currentPhotos, setCurrentPhotos] = useState<CapturedPhoto[]>([]);
  const [currentServerItemId, setCurrentServerItemId] = useState<string | null>(
    null
  );
  const [totalDisplaysCompleted, setTotalDisplaysCompleted] = useState(0);
  const [isCreatingItem, setIsCreatingItem] = useState(false);

  // Stop all active camera tracks reliably
  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
  }, []);

  // Initialize camera
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      stopTracks();

      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("Camera API not supported on this browser/insecure context.");
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraActive(true);
    } catch (err: unknown) {
      console.warn("Camera access failed:", err);
      stopTracks();
      setCameraError(
        "Camera access denied or unavailable. You can use gallery upload or drag-and-drop images below."
      );
      setCameraActive(false);
    }
  }, [facingMode, stopTracks]);

  useEffect(() => {
    startCamera();
    return () => {
      stopTracks();
    };
  }, [facingMode, startCamera, stopTracks]);

  // Flip front / back camera
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const pendingItemPromise = useRef<Promise<string> | null>(null);
  const currentServerItemIdRef = useRef<string | null>(null);

  // Ensure an RMA Item exists on backend for current display
  const ensureServerItem = async (): Promise<string> => {
    if (currentServerItemIdRef.current) return currentServerItemIdRef.current;
    if (pendingItemPromise.current) return await pendingItemPromise.current;

    setIsCreatingItem(true);
    const promise = (async () => {
      try {
        const res = await fetch(`/api/rmas/${rmaId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create display line item");

        currentServerItemIdRef.current = data.item.id;
        setCurrentServerItemId(data.item.id);
        setDisplayNumber(data.item.itemNumber);
        return data.item.id as string;
      } finally {
        setIsCreatingItem(false);
        pendingItemPromise.current = null;
      }
    })();

    pendingItemPromise.current = promise;
    return await promise;
  };

  // Fast background upload of an individual photo to server item
  const uploadPhotoInBackground = async (
    serverItemId: string,
    photoId: string,
    blob: Blob,
    imageType: string
  ) => {
    const formData = new FormData();
    formData.append("file", blob, `display_${displayNumber}_${photoId}.jpg`);
    formData.append("imageType", imageType);

    try {
      const res = await fetch(`/api/rma-items/${serverItemId}/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      setCurrentPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? {
                ...p,
                uploading: false,
                uploaded: res.ok,
                serverImageId: data.image?.id,
                error: res.ok ? undefined : data.error,
              }
            : p
        )
      );
    } catch {
      setCurrentPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? { ...p, uploading: false, uploaded: false, error: "Network error" }
            : p
        )
      );
    }
  };

  // Process a list of files (from file input or desktop drag-and-drop)
  const processFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const photoId = Math.random().toString(36).substring(2, 9);
      const previewUrl = URL.createObjectURL(file);
      const imageType =
        i === 0 && currentPhotos.length === 0 ? "primary" : "stamp_closeup";

      const newPhoto: CapturedPhoto = {
        id: photoId,
        blob: file,
        previewUrl,
        imageType,
        uploading: true,
        uploaded: false,
      };

      setCurrentPhotos((prev) => [...prev, newPhoto]);

      try {
        const itemId = await ensureServerItem();
        uploadPhotoInBackground(itemId, photoId, file, imageType);
      } catch (err) {
        console.error("Item creation error:", err);
      }
    }
  };

  // Drag and drop handlers for desktop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files.length > 0) {
        await processFiles(files);
      }
    }
  };

  // Capture photo from video stream with debouncing and shutter acknowledgment
  const capturePhoto = async (
    imageType: CapturedPhoto["imageType"] = "primary"
  ) => {
    if (!videoRef.current || !canvasRef.current || isCapturing || !cameraActive || isCreatingItem) {
      return;
    }

    setIsCapturing(true);
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 120);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setIsCapturing(false);
            return;
          }

          const photoId = Math.random().toString(36).substring(2, 9);
          const previewUrl = URL.createObjectURL(blob);

          const newPhoto: CapturedPhoto = {
            id: photoId,
            blob,
            previewUrl,
            imageType,
            uploading: true,
            uploaded: false,
          };

          // 1. Immediately show local preview thumbnail
          setCurrentPhotos((prev) => [...prev, newPhoto]);

          // 2. Immediate shutter unlock so operator can rapidly capture back/stickers
          setIsCapturing(false);

          // 3. Ensure item exists and trigger non-blocking async upload
          (async () => {
            try {
              const itemId = await ensureServerItem();
              uploadPhotoInBackground(itemId, photoId, blob, imageType);
            } catch (err) {
              console.error("Item creation error:", err);
            }
          })();
        },
        "image/jpeg",
        0.9
      );
    } catch (err) {
      console.error("Capture failed:", err);
      setIsCapturing(false);
    }
  };

  // Handle file input / gallery upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Finish current display line item and move to next display
  const finishCurrentDisplay = () => {
    if (currentPhotos.length === 0) return;

    setTotalDisplaysCompleted((prev) => prev + 1);
    setCurrentPhotos([]);
    currentServerItemIdRef.current = null;
    setCurrentServerItemId(null);
    setDisplayNumber((prev) => prev + 1);
  };

  const removePhoto = (photoId: string) => {
    setCurrentPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto bg-neutral-950 rounded-xl overflow-hidden shadow-2xl border border-neutral-800 text-white">
      {/* Top Scanner Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-900 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm font-mono">{rmaNumber}</span>
            <Badge variant="outline" className="text-neutral-300 border-neutral-700">
              {customerName}
            </Badge>
          </div>
          <div className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1.5 font-mono">
            <span>Display #<AnimatedNumber value={displayNumber} /></span>
            <span>·</span>
            <span>Captured: <AnimatedNumber value={totalDisplaysCompleted} /> screens</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onComplete && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onComplete}
              className="bg-neutral-800 text-neutral-200 hover:bg-neutral-700 h-9 font-medium"
            >
              Finish Intake (<AnimatedNumber value={totalDisplaysCompleted} />)
            </Button>
          )}
        </div>
      </div>

      {/* Viewport Area with Drag & Drop */}
      <div
        className={`relative flex-1 bg-black flex items-center justify-center overflow-hidden transition-colors ${
          isDragging ? "ring-4 ring-cyan-500 ring-inset bg-cyan-950/20" : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {cameraActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm">
            <Camera className="h-12 w-12 text-neutral-600 mb-3" />
            <p className="text-sm text-neutral-400 mb-4">
              {cameraError || "Camera inactive. Enable permissions or upload files."}
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={startCamera}>
                Retry Camera
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="bg-neutral-800 hover:bg-neutral-700 text-white"
              >
                Choose Files
              </Button>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        {/* Shutter feedback border flash */}
        <AnimatePresence>
          {isFlashing && (
            <motion.div
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute inset-0 bg-white/20 pointer-events-none z-30 ring-4 ring-white"
            />
          )}
        </AnimatePresence>

        {/* Drag and Drop Visual Feedback Overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-cyan-950/80 backdrop-blur-xs flex flex-col items-center justify-center pointer-events-none z-30">
            <Upload className="h-12 w-12 text-cyan-400 animate-bounce mb-2" />
            <span className="text-base font-bold text-white">Drop images to upload</span>
            <span className="text-xs text-cyan-300">Adding photos to Display #{displayNumber}</span>
          </div>
        )}

        {/* Framing guide overlay */}
        <div className="absolute inset-8 pointer-events-none border border-white/20 rounded-lg flex items-center justify-center">
          <div className="w-16 h-16 border-t-2 border-l-2 border-white/60 absolute top-0 left-0" />
          <div className="w-16 h-16 border-t-2 border-r-2 border-white/60 absolute top-0 right-0" />
          <div className="w-16 h-16 border-b-2 border-l-2 border-white/60 absolute bottom-0 left-0" />
          <div className="w-16 h-16 border-b-2 border-r-2 border-white/60 absolute bottom-0 right-0" />
        </div>

        {/* Current display photo strip overlay */}
        {currentPhotos.length > 0 && (
          <div className="absolute top-3 left-3 right-3 flex items-center gap-2 overflow-x-auto p-2 bg-neutral-950/80 backdrop-blur-md rounded-lg border border-neutral-800 z-20">
            <span className="text-xs font-mono text-neutral-400 pl-1 shrink-0">
              #{displayNumber} photos:
            </span>
            <div className="flex items-center gap-2">
              {currentPhotos.map((photo, idx) => (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.16 }}
                  className="relative group shrink-0 w-12 h-12 rounded border border-neutral-700 overflow-hidden bg-neutral-900 shadow-sm"
                >
                  <img
                    src={photo.previewUrl}
                    alt={`Angle ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {photo.uploading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  )}
                  {photo.uploaded && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className="absolute bottom-0 right-0 p-0.5 bg-emerald-500 rounded-tl"
                    >
                      <Check className="h-2.5 w-2.5 text-white" />
                    </motion.div>
                  )}
                  {photo.error && (
                    <div className="absolute bottom-0 right-0 p-0.5 bg-rose-500 rounded-tl" title={photo.error}>
                      <AlertCircle className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    className="absolute top-0 right-0 p-1 bg-rose-600/90 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-bl cursor-pointer"
                    title="Remove this photo"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="bg-neutral-900 p-4 border-t border-neutral-800 shrink-0">
        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
          {/* Flip camera */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFacingMode}
            className="text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full h-11 w-11 min-h-[44px] min-w-[44px]"
            title="Switch Camera"
            aria-label="Switch Camera Facing Mode"
          >
            <FlipHorizontal className="h-5 w-5" />
          </Button>

          {/* Primary Big Shutter Button */}
          <button
            type="button"
            onClick={() => capturePhoto(currentPhotos.length === 0 ? "primary" : "stamp_closeup")}
            disabled={!cameraActive || isCapturing}
            className="h-16 w-16 rounded-full border-4 border-white/80 flex items-center justify-center bg-white/20 active:scale-92 transition-transform disabled:opacity-40 min-h-[44px] min-w-[44px] cursor-pointer"
            title="Capture Photo"
            aria-label="Capture Photo"
          >
            <div
              className={`h-12 w-12 rounded-full bg-white shadow-lg transition-all duration-100 ${
                isCapturing ? "scale-90 opacity-70" : ""
              }`}
            />
          </button>

          {/* Gallery file upload */}
          <label className="cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <div
              className="h-11 w-11 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              title="Upload Photos from Device"
              aria-label="Upload Photos from Device"
            >
              <Upload className="h-5 w-5" />
            </div>
          </label>
        </div>

        {/* Step progression actions */}
        <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center justify-between text-xs">
          <div className="text-neutral-400">
            {currentPhotos.length === 0 ? (
              <span>Take front photo of screen #{displayNumber}</span>
            ) : (
              <span>
                {currentPhotos.length} photo(s) captured for Screen #{displayNumber}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentPhotos.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={finishCurrentDisplay}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-9 px-3"
              >
                <span>Save & Next Screen</span>
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
