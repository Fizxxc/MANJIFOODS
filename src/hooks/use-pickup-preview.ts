"use client";
import { useEffect, useState } from "react";
import { pickupTimeSchema, type PickupPreview } from "@/lib/domain";

export function usePickupPreview(time: string, sessionId?: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data: PickupPreview;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const valid = pickupTimeSchema.safeParse(time).success;
  const key = `${sessionId || ""}|${time}|${attempt}`;
  useEffect(() => {
    if (!valid || !sessionId) return;
    const controller = new AbortController();
    let disposed = false;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async () => {
      requestTimeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch("/api/pickup-time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ time }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Waktu pengambilan belum dapat diperiksa.",
          );
        if (
          data.session_id !== sessionId ||
          !Number.isFinite(Date.parse(data.pickup_at))
        )
          throw new Error(
            "Sesi diperbarui. Muat ulang data lalu pilih jam pengambilan.",
          );
        if (!controller.signal.aborted) setResult({ key, data });
      } catch (error) {
        if (!disposed)
          setFailure({
            key,
            message: controller.signal.aborted
              ? "Pemeriksaan waktu terlalu lama. Coba lagi."
              : error instanceof Error
                ? error.message
                : "Koneksi terputus. Coba lagi.",
          });
      } finally {
        clearTimeout(requestTimeout);
      }
    }, 250);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(requestTimeout);
      controller.abort();
    };
  }, [time, sessionId, key, valid]);
  const preview = result?.key === key ? result.data : null;
  const error = failure?.key === key ? failure.message : "";
  return {
    preview,
    error,
    pending: valid && !!sessionId && !preview && !error,
    retry: () => setAttempt((n) => n + 1),
  };
}
