"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Volume2, VolumeX, X } from "lucide-react";
import type { Command, Data } from "@/lib/domain";
import type { AppContext } from "./app";
import { useServerClock } from "@/hooks/use-server-clock";
import { formatWibTime } from "@/lib/time";
function vapidBytes(base64: string) {
  const binary = atob(
    base64
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(base64.length / 4) * 4, "="),
  );
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
export function PushPreferences({
  context: { data, busy, run },
}: {
  context: AppContext;
}) {
  const [status, setStatus] = useState(""),
    [supported, setSupported] = useState(false),
    [working, setWorking] = useState(false),
    [subscribed, setSubscribed] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect -- Browser capability detection and service-worker state hydrate after mount. */
  useEffect(() => {
    setSupported(
      "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window,
    );
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((r) => r.pushManager?.getSubscription())
        .then((s) => setSubscribed(!!s))
        .catch(() =>
          setStatus(
            "Service worker belum tersedia. Notifikasi tetap ada di aplikasi.",
          ),
        );
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const toggle = async () => {
    setWorking(true);
    setStatus("");
    let sub: PushSubscription | null = null;
    try {
      if (!supported)
        throw new Error(
          "Browser ini belum mendukung Web Push. Gunakan notifikasi di aplikasi.",
        );
      const reg = await navigator.serviceWorker.ready;
      sub = await reg.pushManager.getSubscription();
      if (sub) {
        const json = sub.toJSON();
        await run(
          {
            type: "push",
            endpoint: sub.endpoint,
            p256dh: json.keys?.p256dh || "",
            auth: json.keys?.auth || "",
            remove: true,
          },
          "Langganan perangkat dihapus.",
        );
        await sub.unsubscribe();
        setSubscribed(false);
        return;
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Web Push belum dikonfigurasi oleh pengelola.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Izin notifikasi belum diberikan. Kamu bisa mengaturnya di browser.",
        );
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidBytes(key),
      });
      const json = sub.toJSON();
      try {
        await run(
          {
            type: "push",
            endpoint: sub.endpoint,
            p256dh: json.keys?.p256dh || "",
            auth: json.keys?.auth || "",
            remove: false,
          },
          "Perangkat terdaftar untuk notifikasi.",
        );
      } catch (e) {
        await sub.unsubscribe();
        throw e;
      }
      setSubscribed(true);
      setStatus(
        "Notifikasi perangkat aktif. Pengiriman bergantung koneksi, browser, dan pengaturan perangkat.",
      );
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Pendaftaran notifikasi gagal.",
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="panel">
      <h2>Preferensi notifikasi</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={data.profile.notifications_enabled}
          disabled={busy}
          onChange={(e) => {
            const enabled = e.target.checked;
            void run({
              type: "profile",
              name: data.profile.full_name || "Siswa",
              class_name: data.profile.class_name || "",
              notifications: enabled,
            })
              .then(async () => {
                if (!enabled) {
                  const reg = await navigator.serviceWorker?.getRegistration();
                  const sub = await reg?.pushManager?.getSubscription();
                  await sub?.unsubscribe();
                  setSubscribed(false);
                }
              })
              .catch(() => {});
          }}
        />
        Izinkan pengiriman notifikasi perangkat
      </label>
      <p className="small muted">
        Riwayat kabar tetap tersimpan di aplikasi. Web Push bersifat opsional
        dan tidak selalu terkirim. Pada iPhone/iPad, mungkin perlu menambahkan
        aplikasi ke layar utama.
      </p>
      <button
        className="secondary"
        disabled={
          busy ||
          working ||
          !supported ||
          (!subscribed && !data.profile.notifications_enabled)
        }
        onClick={() => void toggle()}
      >
        <Bell size={18} />
        {working
          ? "Memproses…"
          : subscribed
            ? "Nonaktifkan perangkat ini"
            : "Aktifkan perangkat ini"}
      </button>
      {!supported && (
        <p className="small muted">Web Push tidak tersedia pada browser ini.</p>
      )}
      {status && (
        <p className="message" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
export function AdminSound({
  data,
  run,
}: {
  data: Data;
  run: (c: Command, message?: string) => Promise<unknown>;
}) {
  const [enabled, setEnabled] = useState(false),
    [volume, setVolume] = useState(0.25),
    [snooze, setSnooze] = useState(0),
    [popup, setPopup] = useState(true),
    [quiet, setQuiet] = useState(false);
  const { now, getNow } = useServerClock();
  const audio = useRef<AudioContext | null>(null),
    last = useRef(0),
    seen = useRef<Set<string>>(new Set());
  const unresolved = useMemo(
      () =>
        data.unacknowledgedOrders.filter(
          (o) =>
            !o.acknowledged_at &&
            !["completed", "cancelled", "rejected"].includes(o.status),
        ),
      [data.unacknowledgedOrders],
    ),
    count = data.queueCounts.unacknowledged ?? unresolved.length;
  /* eslint-disable react-hooks/set-state-in-effect -- Restore explicit browser-local audio preferences; enabling playback still requires a gesture. */
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("manji-sound") || "{}");
      if (typeof v.volume === "number")
        setVolume(Math.min(1, Math.max(0, v.volume)));
      if (typeof v.quiet === "boolean") setQuiet(v.quiet);
    } catch {}
    return () => {
      void audio.current?.close();
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const play = useCallback(() => {
    const a = audio.current;
    const current = getNow();
    if (
      !a ||
      a.state !== "running" ||
      !enabled ||
      quiet ||
      current === null ||
      current < snooze ||
      document.visibilityState !== "visible"
    )
      return;
    last.current = current;
    [523.25, 659.25, 783.99].forEach((frequency, i) => {
      const osc = a.createOscillator(),
        gain = a.createGain(),
        t = a.currentTime + i * 0.17;
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume * 0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(a.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }, [enabled, quiet, snooze, volume, getNow]);
  // Periodic reconciliation handles batched arrivals, snooze expiry and acknowledged orders.
  const state = useRef({ count: 0, play: () => {} });
  useEffect(() => {
    state.current = { count, play };
  }, [count, play]);
  useEffect(() => {
    if (now !== null && state.current.count > 0 && now - last.current >= 20000)
      state.current.play();
  }, [now]);
  useEffect(() => {
    const ids = new Set(unresolved.map((o) => o.id));
    if ([...ids].some((id) => !seen.current.has(id))) {
      setPopup(true);
      const current = getNow();
      if (current !== null && current - last.current >= 3000)
        state.current.play();
    }
    seen.current = ids;
  }, [unresolved, getNow]);
  const unlock = async () => {
    if (enabled) {
      setEnabled(false);
      return;
    }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setEnabled(true);
    } catch {
      setQuiet(true);
    }
  };
  const save = (v: number, q: boolean) => {
    try {
      localStorage.setItem(
        "manji-sound",
        JSON.stringify({ volume: v, quiet: q }),
      );
    } catch {}
  };
  return (
    <section className="sound-controls" aria-label="Pengingat antrean">
      <div className="row wrap">
        <button className="secondary compact" onClick={() => void unlock()}>
          {enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}Suara{" "}
          {enabled ? "aktif" : "nonaktif"}
        </button>
        <label className="volume-control">
          Volume
          <input
            type="range"
            aria-label="Volume pengingat"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              save(v, quiet);
            }}
          />
        </label>
        <button
          className="text-button"
          disabled={now === null}
          onClick={() => {
            const current = getNow();
            if (current !== null) setSnooze(current + 300000);
          }}
        >
          Tunda 5 menit
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={quiet}
            onChange={(e) => {
              setQuiet(e.target.checked);
              save(volume, e.target.checked);
            }}
          />
          Mode senyap
        </label>
      </div>
      {now !== null && snooze > now && (
        <p className="small muted">
          Pengingat ditunda sampai {formatWibTime(snooze)} WIB.
        </p>
      )}
      {count > 0 && unresolved.length > 0 && popup && (
        <div className="queue-alert" role="status">
          <div>
            <strong>{count} pesanan belum ditinjau</strong>
            <p className="small">
              {unresolved[0].order_number} ·{" "}
              {
                data.sessions.find((s) => s.id === unresolved[0].pickup_slot_id)
                  ?.title
              }{" "}
              ·{" "}
              {unresolved[0].order_items
                .map((i) => i.product_name_snapshot + " ×" + i.quantity)
                .join(", ")}
            </p>
          </div>
          <Link
            className="button secondary compact"
            href={"/admin/orders/" + unresolved[0].id}
          >
            Buka tiket
          </Link>
          <button
            className="text-button"
            onClick={() =>
              void run({
                type: "order",
                order: unresolved[0].id,
                action: "acknowledge",
              }).catch(() => {})
            }
          >
            Sudah ditinjau
          </button>
          <button
            className="icon-button"
            aria-label="Tutup pengingat"
            onClick={() => setPopup(false)}
          >
            <X size={18} />
          </button>
        </div>
      )}
      <p className="small muted">
        Suara perlu diaktifkan dengan tombol dan hanya diputar saat tab aktif.
        Pengingat berulang tiap 20 detik selama belum ditinjau.
      </p>
    </section>
  );
}
