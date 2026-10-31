"use client";
import { useState } from "react";
import {
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ImageOff,
} from "lucide-react";
import type { Proof } from "@/lib/domain";
import { Dialog } from "./dialog";

function ProofImage({
  proof,
  thumbnail = false,
}: {
  proof: Proof;
  thumbnail?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed)
    return (
      <span className="proof-image-error">
        <ImageOff size={24} />
        <span>Gambar belum dapat dimuat.</span>
        {!thumbnail && (
          <button
            type="button"
            className="secondary compact"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            Muat ulang gambar
          </button>
        )}
      </span>
    );
  return (
    <img
      src={`/api/upload?proof=${encodeURIComponent(proof.id)}&attempt=${attempt}`}
      alt={
        thumbnail
          ? "Pratinjau bukti transfer"
          : "Bukti transfer yang diunggah siswa"
      }
      loading={thumbnail ? "lazy" : "eager"}
      onError={() => setFailed(true)}
    />
  );
}
export function PaymentProofs({ proofs }: { proofs: Proof[] }) {
  const [selected, setSelected] = useState<Proof | null>(null);
  const [zoom, setZoom] = useState(1);
  if (!proofs.length) return null;
  return (
    <section className="panel">
      <h2>Bukti pembayaran</h2>
      <p className="small muted">
        Buka gambar untuk memperbesar. Bukti transfer bukan konfirmasi dana
        masuk.
      </p>
      <div className="proof-thumbnails">
        {proofs.map((proof, index) => (
          <div className="proof-thumbnail" key={proof.id}>
            <button
              type="button"
              className="proof-open secondary"
              onClick={() => {
                setZoom(1);
                setSelected(proof);
              }}
            >
              <ProofImage proof={proof} thumbnail />
              <span>Buka bukti {index + 1}</span>
            </button>
          </div>
        ))}
      </div>
      {selected && (
        <Dialog title="Bukti transfer" wide onClose={() => setSelected(null)}>
          <p className="small muted">
            Periksa penerimaan dana di mutasi merchant sebelum memverifikasi
            pembayaran.
          </p>
          <div className="proof-toolbar">
            <button
              type="button"
              className="secondary compact"
              aria-label="Perkecil gambar"
              disabled={zoom <= 1}
              onClick={() => setZoom((n) => Math.max(1, n - 0.5))}
            >
              <ZoomOut size={20} />
            </button>
            <output aria-live="polite">{zoom * 100}%</output>
            <button
              type="button"
              className="secondary compact"
              aria-label="Perbesar gambar"
              disabled={zoom >= 4}
              onClick={() => setZoom((n) => Math.min(4, n + 0.5))}
            >
              <ZoomIn size={20} />
            </button>
            <button
              type="button"
              className="secondary compact"
              aria-label="Atur ulang ukuran gambar"
              onClick={() => setZoom(1)}
            >
              <RotateCcw size={18} />
            </button>
            <a
              className="button secondary compact"
              href={`/api/upload?proof=${encodeURIComponent(selected.id)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={17} />
              Ukuran penuh
            </a>
          </div>
          <div
            className="proof-viewport"
            tabIndex={0}
            aria-label="Gambar bukti transfer; gulir saat diperbesar"
          >
            <div style={{ width: `${zoom * 100}%` }}>
              <ProofImage key={selected.id} proof={selected} />
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
