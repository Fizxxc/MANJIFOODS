"use client";
import { useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import type { Command } from "@/lib/domain";
import { terminal } from "@/lib/domain";
import { findOrder } from "@/lib/order-links";
import type { AppContext } from "./app";
import { ConfirmAction } from "./dialog";

export function OrderActions({
  context: { data, busy, run },
  identifier,
}: {
  context: AppContext;
  identifier: string;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [settlement, setSettlement] = useState(false);
  const order = findOrder(data.orders, identifier);
  if (!order) return null;
  const pay = order.payments[0];
  if (!pay)
    return (
      <section className="panel space-top">
        <h2>Tindakan pengelola</h2>
        <p className="message error" role="alert">
          Data pembayaran belum tersedia. Muat ulang dan periksa catatan
          transaksi. Status transaksi tidak diubah.
        </p>
      </section>
    );
  const action = async (
    action: Extract<Command, { type: "order" }>["action"],
    message: string,
    actionNote = note,
  ) => {
    await run(
      {
        type: "order",
        order: order.id,
        action,
        note: actionNote,
        reference: ["verify_payment", "refund"].includes(action)
          ? reference
          : "",
      },
      message,
    );
    setSettlement(false);
  };
  const confirm = (
    a: Extract<Command, { type: "order" }>["action"],
    label: string,
    description: string,
    disabled = false,
    actionNote = note,
    secondary = false,
  ) => (
    <ConfirmAction
      key={a}
      title={label}
      label={label}
      description={`${order.order_number}. ${description}`}
      busy={busy}
      disabled={disabled}
      className={secondary ? "secondary" : undefined}
      onConfirm={() => action(a, `${label} berhasil.`, actionNote)}
    >
      {label}
    </ConfirmAction>
  );
  return (
    <div className="order-action-panels">
      <section className="panel">
        <h2>Konfirmasi pesanan</h2>
        <p className="small muted">
          Konfirmasi hanya menerima pesanan untuk disiapkan. Status pembayaran
          tetap terpisah.
        </p>
        {order.status === "pending" && (
          <div className="row wrap">
            {confirm(
              "confirmed",
              "Konfirmasi pesanan",
              "Terima pesanan ini untuk disiapkan. Tindakan ini tidak menandai pembayaran lunas.",
              false,
              "",
            )}
          </div>
        )}
        {["pending", "confirmed"].includes(order.status) && (
          <details className="space-top">
            <summary>
              <XCircle size={17} />
              Tolak pesanan
            </summary>
            <label className="space-top">
              Alasan penolakan
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="Jelaskan alasan kepada siswa"
              />
            </label>
            {confirm(
              "reject",
              "Tolak pesanan",
              "Pesanan akan ditolak dan stok dikembalikan. Tindakan ini tidak dapat dibatalkan dan tidak mengubah pembayaran. Jika dana telah masuk, rekonsiliasi/pengembalian harus dicatat terpisah.",
              reason.trim().length < 3,
              reason,
              true,
            )}
          </details>
        )}
        {order.status === "confirmed" &&
          confirm(
            "preparing",
            "Mulai siapkan",
            "Mulai menyiapkan pesanan. Status pembayaran tidak berubah.",
            false,
            "",
          )}
        {order.status === "preparing" &&
          confirm(
            "ready",
            "Tandai siap diambil",
            "Beri tahu siswa bahwa pesanan siap diambil.",
            false,
            "",
          )}
        {order.status === "ready" && (
          <>
            <p className="small muted">
              Cocokkan nomor pesanan dengan siswa dan pastikan pesanan sudah
              diserahkan. Pembayaran harus lunas.
            </p>
            {confirm(
              "completed",
              "Selesaikan pesanan",
              "Pastikan pesanan telah diserahkan kepada pemiliknya. Penyelesaian tidak dapat dibatalkan.",
              pay.status !== "paid",
              "",
            )}
          </>
        )}
        {terminal.includes(order.status) && (
          <p className="small muted">
            Pesanan telah ditutup. Riwayat dan pembayaran tetap tersimpan.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>
          {order.payment_method === "qris_static"
            ? "Verifikasi pembayaran QRIS"
            : "Penerimaan tunai"}
        </h2>
        <p className="message small">
          Bukti gambar dan konfirmasi pesanan tidak membuktikan dana masuk.
          Periksa jumlah, waktu, dan penerimaan nyata sebelum menandai lunas.
        </p>
        {!["paid", "refunded"].includes(pay.status) && (
          <>
            {order.payment_method === "qris_static" && (
              <label>
                Referensi mutasi merchant
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={120}
                />
                <span className="small muted">
                  Hanya untuk verifikasi dana masuk; tidak diperlukan untuk
                  konfirmasi pesanan.
                </span>
              </label>
            )}
            <label className="space-top">
              Catatan pembayaran
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
              />
            </label>
            <label className="check space-top">
              <input
                type="checkbox"
                checked={settlement}
                onChange={(e) => setSettlement(e.target.checked)}
              />
              {order.payment_method === "cash"
                ? "Saya telah menerima uang tunai sesuai total."
                : "Saya telah memeriksa dana masuk nyata di mutasi merchant."}
            </label>
            <div className="row wrap space-top">
              {confirm(
                order.payment_method === "cash"
                  ? "collect_cash"
                  : "verify_payment",
                order.payment_method === "cash"
                  ? "Catat tunai diterima"
                  : "Tandai pembayaran lunas",
                "Saya memastikan dana benar-benar telah diterima sesuai total. Konfirmasi ini hanya mengubah pembayaran, bukan konfirmasi pesanan.",
                !settlement ||
                  (order.payment_method === "qris_static" &&
                    reference.trim().length < 3) ||
                  (terminal.includes(order.status) && note.trim().length < 10),
              )}
              {order.payment_method === "qris_static" &&
                confirm(
                  "reject_payment",
                  "Tolak klaim pembayaran",
                  "Klaim pembayaran akan ditolak dengan catatan yang diisi. Status pesanan tidak berubah.",
                  note.trim().length < 3,
                  note,
                  true,
                )}
            </div>
          </>
        )}
        {pay.status === "paid" && (
          <>
            <p className="small">
              <CheckCircle size={18} />
              Penerimaan dana telah dicatat pengelola.
            </p>
            {order.status !== "completed" && (
              <details>
                <summary>Catat pengembalian dana</summary>
                <p className="small muted">
                  Lakukan pengembalian nyata terlebih dahulu. Tidak ada transfer
                  otomatis.
                </p>
                <label>
                  Referensi pengembalian
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    maxLength={120}
                  />
                </label>
                <label>
                  Alasan pengembalian
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settlement}
                    onChange={(e) => setSettlement(e.target.checked)}
                  />
                  Dana benar-benar telah dikembalikan.
                </label>
                {confirm(
                  "refund",
                  "Catat dana dikembalikan",
                  "Catat pengembalian dana yang sudah dilakukan secara nyata. Status pesanan tidak berubah.",
                  !settlement ||
                    note.trim().length < 10 ||
                    reference.trim().length < 3,
                  note,
                  true,
                )}
              </details>
            )}
          </>
        )}
        {pay.status === "refunded" && (
          <p>Dana dikembalikan sesuai catatan pengelola.</p>
        )}
      </section>
    </div>
  );
}
