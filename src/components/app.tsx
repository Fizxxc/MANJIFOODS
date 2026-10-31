"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  House,
  ShoppingBasket,
  ReceiptText,
  UserRound,
  Settings,
  Package,
  CalendarClock,
  Tags,
  ChartNoAxesCombined,
  CreditCard,
  ArrowLeft,
  WifiOff,
  RefreshCw,
  X,
} from "lucide-react";
import { browserClient } from "@/lib/supabase/browser";
import type { Command, Data, Profile } from "@/lib/domain";
import { StudentScreens } from "./student-screens";
import { AdminScreens } from "./admin-screens";
import { AdminSound } from "./notifications";
import { WibClock, SessionTiming } from "./clock";
import { openSession } from "@/lib/domain";
import { serverClock } from "@/hooks/use-server-clock";
import { formatWibTime } from "@/lib/time";
import { parseDataResponse } from "@/lib/order-response";
import { orderLookup, orderNumberPattern, orderPath } from "@/lib/order-links";
import { subscribeOrderRefresh } from "@/lib/order-realtime";
export type AppContext = {
  data: Data;
  busy: boolean;
  run: (c: Command, message?: string) => Promise<unknown>;
  refresh: () => Promise<void>;
  upload: (file: File, kind: string, order?: string) => Promise<string>;
  page: number;
  setPage: (p: number) => void;
  queueTab: string;
  setQueueTab: (s: string) => void;
};
const studentNav = [
  { href: "/menu", label: "Menu", Icon: House },
  { href: "/cart", label: "Keranjang", Icon: ShoppingBasket },
  { href: "/orders", label: "Pesanan", Icon: ReceiptText },
  { href: "/profile", label: "Akun", Icon: UserRound },
];
const adminNav = [
  { href: "/admin", label: "Antrean", Icon: ReceiptText },
  { href: "/admin/products", label: "Menu", Icon: Package },
  { href: "/admin/categories", label: "Kategori", Icon: Tags },
  { href: "/admin/payments", label: "Pembayaran", Icon: CreditCard },
  { href: "/admin/sessions", label: "Sesi ambil", Icon: CalendarClock },
  { href: "/admin/reports", label: "Laporan", Icon: ChartNoAxesCombined },
  { href: "/admin/settings", label: "Pengaturan", Icon: Settings },
];
export function App({ initialProfile }: { initialProfile: Profile }) {
  const [queueTab, setQueueTab] = useState("pending");
  const path = usePathname(),
    router = useRouter(),
    admin = path.startsWith("/admin");
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true),
    [live, setLive] = useState(false),
    [page, setPage] = useState(0),
    [lastSync, setLastSync] = useState("");
  const lock = useRef(false),
    generation = useRef(0);
  const refresh = useCallback(async () => {
    const serial = ++generation.current;
    const orderId = orderLookup(path);
    const params = new URLSearchParams({ page: String(page) });
    if (orderId)
      params.set(
        orderNumberPattern.test(orderId) ? "number" : "order",
        orderId,
      );
    if (path === "/admin") {
      params.set("active", "1");
      params.set("group", queueTab);
    }
    try {
      const res = await fetch("/api/data?" + params, { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }
      const json: unknown = await res.json().catch(() => {
        throw new Error("Respons server tidak valid. Coba muat ulang.");
      });
      if (!res.ok)
        throw new Error(
          json &&
            typeof json === "object" &&
            "error" in json &&
            typeof json.error === "string"
            ? json.error
            : "Data belum dapat dimuat. Coba lagi.",
        );
      if (serial === generation.current) {
        setData(parseDataResponse(json));
        setError("");
        const syncedAt = serverClock.getNow();
        if (syncedAt !== null) setLastSync(formatWibTime(syncedAt) + " WIB");
      }
    } catch (e) {
      if (serial === generation.current)
        setError(
          e instanceof Error ? e.message : "Koneksi terputus. Coba lagi.",
        );
    }
  }, [path, page, router, queueTab]);
  /* eslint-disable react-hooks/set-state-in-effect -- Fetches canonical server data and installs reconnect/polling listeners. */
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20000);
    const reconnect = () => {
      setOnline(true);
      void refresh();
    };
    const offline = () => setOnline(false);
    const visibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    return subscribeOrderRefresh(
      browserClient(),
      initialProfile.id,
      () => void refresh(),
      setLive,
    );
  }, [initialProfile.id, refresh]);
  useEffect(() => {
    const identifier = orderLookup(path);
    if (!identifier || orderNumberPattern.test(identifier)) return;
    const order = data?.orders.find((order) => order.id === identifier);
    if (order) router.replace(orderPath(order, admin));
  }, [data, path, router, admin]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(id);
  }, [notice]);
  const run = async (c: Command, message = "Perubahan tersimpan.") => {
    if (lock.current) throw new Error("Tunggu proses sebelumnya selesai.");
    lock.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setNotice(message);
      await refresh();
      return j.data;
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Permintaan gagal. Coba lagi.",
      );
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const upload = async (file: File, kind: string, order?: string) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      if (order) form.set("order", order);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await refresh();
      setNotice("Gambar tersimpan.");
      return json.path as string;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unggah gagal.");
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const nav = admin ? adminNav : studentNav,
    cartCount = data?.cart.reduce((n, i) => n + i.quantity, 0) || 0;
  const currentSession = data?.sessions.find(openSession);
  return (
    <div className={admin ? "app-shell admin-shell" : "app-shell"}>
      <header className="topbar">
        <div>
          <Link
            href={admin ? "/admin" : "/menu"}
            aria-label="MANJI FOOD beranda"
            className="wordmark"
          >
            manji<span>.</span> food
            <small>PESAN • AMBIL • NIKMATI</small>
          </Link>
          <WibClock />
          {currentSession && !orderLookup(path) && (
            <SessionTiming session={currentSession} compact />
          )}
        </div>
        <div className="row">
          <span className="desktop-only muted">{initialProfile.full_name}</span>
          {initialProfile.role === "admin" && (
            <Link className="text-link" href={admin ? "/menu" : "/admin"}>
              {admin ? "Tampilan siswa" : "Admin"}
            </Link>
          )}
          <Link
            href="/notifications"
            className="icon-button notification-link"
            aria-label="Notifikasi"
          >
            <Bell size={21} />
            {!!data?.notifications.some((n) => !n.read_at) && <i />}
          </Link>
        </div>
      </header>
      <nav
        className={admin ? "admin-nav" : "bottom-nav"}
        aria-label={admin ? "Navigasi admin" : "Navigasi utama"}
      >
        {nav.map(({ href, label, Icon }) => {
          const active =
            href === "/admin"
              ? path === href
              : path.startsWith(href) ||
                (href === "/profile" &&
                  ["/about", "/notifications"].includes(path));
          return (
            <Link
              key={href}
              href={href}
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={21} />
              <span>{label}</span>
              {href === "/cart" && cartCount > 0 && (
                <b className="count">{cartCount}</b>
              )}
            </Link>
          );
        })}
      </nav>
      <main id="main" className="main-content">
        {admin && (
          <div className="row between admin-meta">
            <span className="eyebrow">Operasional kantin</span>
            <span className="sync-status">
              {live ? "Terhubung realtime" : "Pembaruan berkala"}
              {lastSync ? " · " + lastSync : ""}
            </span>
          </div>
        )}
        {!online && (
          <div className="message error" role="status">
            <WifiOff size={18} />
            Kamu sedang offline. Perubahan memerlukan koneksi.
          </div>
        )}
        {error && (
          <div className="message error" role="alert">
            <span>{error}</span>
            <button
              className="secondary compact"
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} />
              Coba lagi
            </button>
          </div>
        )}
        {!data && !error && (
          <div aria-busy="true">
            <p role="status">Memuat data kantin…</p>
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}
        {data &&
          (admin ? (
            <>
              <AdminSound data={data} run={run} />
              <AdminScreens
                context={{
                  data,
                  busy,
                  run,
                  refresh,
                  upload,
                  page,
                  setPage,
                  queueTab,
                  setQueueTab: (s) => {
                    setQueueTab(s);
                    setPage(0);
                  },
                }}
                path={path}
              />
            </>
          ) : (
            <StudentScreens
              context={{
                data,
                busy,
                run,
                refresh,
                upload,
                page,
                setPage,
                queueTab,
                setQueueTab,
              }}
              path={path}
            />
          ))}
      </main>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Tutup pesan"
            onClick={() => setNotice("")}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
export function Back({
  href = "/menu",
  children,
}: {
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <Link className="icon-button" href={href} aria-label="Kembali">
        <ArrowLeft size={21} />
      </Link>
      <h1>{children}</h1>
    </div>
  );
}
