"use client";
import { useEffect, useState } from "react";
import { generateStaticQris } from "@/lib/qris";
import { validStaticQris } from "@/lib/domain";

export function StaticQris({ payload }: { payload: string }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    payload: string;
    attempt: number;
    url?: string;
    error?: string;
  } | null>(null);
  const current =
    result?.payload === payload && result.attempt === attempt ? result : null;
  useEffect(() => {
    let active = true;
    void generateStaticQris(payload)
      .then((url) => {
        if (active) setResult({ payload, attempt, url });
      })
      .catch(() => {
        if (active)
          setResult({
            payload,
            attempt,
            error: validStaticQris(payload)
              ? "QRIS belum dapat ditampilkan. Coba lagi atau hubungi kantin; jangan membayar ke QR lain."
              : "QRIS merchant belum tersedia atau tidak valid. Hubungi kantin; jangan membayar ke QR lain.",
          });
      });
    return () => {
      active = false;
    };
  }, [payload, attempt]);
  if (current?.url && !current.error)
    return (
      <img
        className="qris-image"
        src={current.url}
        alt="QRIS statis merchant MANJI FOOD"
        onError={() =>
          setResult({
            payload,
            attempt,
            error: "Gambar QRIS gagal dimuat. Coba lagi atau hubungi kantin.",
          })
        }
      />
    );
  return (
    <div aria-live="polite">
      <p className="message" role={current?.error ? "alert" : "status"}>
        {current?.error || "Menyiapkan QRIS merchant…"}
      </p>
      {current?.error && (
        <button
          type="button"
          className="secondary compact"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Coba tampilkan QRIS lagi
        </button>
      )}
    </div>
  );
}
