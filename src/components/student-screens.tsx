"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Minus,
  Image as ImageIcon,
  ShoppingBasket,
  ReceiptText,
  ChevronRight,
  LogOut,
  UserRound,
  Bell,
  Info,
  Check,
  Copy,
  QrCode,
  Banknote,
  MapPin,
  Upload,
  Mail,
  MessageCircle,
} from "lucide-react";
import {
  eventLabels,
  availableSlot,
  dateTime,
  lineTotal,
  money,
  orderLabels,
  paymentLabels,
  terminal,
  unitPrice,
  type Order,
  type Product,
  type Data,
} from "@/lib/domain";
import { Back, type AppContext } from "./app";
import { PushPreferences } from "./notifications";
import { useServerClock } from "@/hooks/use-server-clock";
import { formatWibTime } from "@/lib/time";
import { SessionTiming } from "./clock";
export function ProductPhoto({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  if (!product.image_path || failed)
    return (
      <div
        className="product-photo placeholder"
        role="img"
        aria-label="Foto menu belum tersedia"
      >
        <ImageIcon size={30} strokeWidth={1.2} />
      </div>
    );
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return (
    <img
      className="product-photo"
      src={`${base}/storage/v1/object/public/product-images/${product.image_path}`}
      alt={product.name}
      onError={() => setFailed(true)}
    />
  );
}
export function Empty({
  Icon = ReceiptText,
  title,
  body,
  href,
  label,
}: {
  Icon?: typeof ReceiptText;
  title: string;
  body: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty">
      <Icon size={36} strokeWidth={1.2} />
      <h2>{title}</h2>
      <p>{body}</p>
      {href && (
        <Link className="button secondary" href={href}>
          {label}
        </Link>
      )}
    </div>
  );
}
export function OrderCard({ o, admin = false }: { o: Order; admin?: boolean }) {
  const pay = o.payments[0];
  return (
    <Link
      href={(admin ? "/admin" : "") + "/orders/" + o.id}
      className="order-card"
    >
      <div className="row between">
        <strong title={o.order_number}>{o.order_number}</strong>
        <span className={"badge status-" + o.status}>
          {orderLabels[o.status]}
        </span>
      </div>
      <p className="muted small">{dateTime(o.created_at)}</p>
      <p>
        {o.order_items
          .map((i) => `${i.product_name_snapshot} ×${i.quantity}`)
          .join(", ")}
      </p>
      <div className="row between">
        <span className="small">
          {o.payment_method === "cash" ? "Tunai" : "QRIS"} ·{" "}
          {paymentLabels[pay?.status || "unpaid"]}
        </span>
        <strong>
          {money(o.total_idr)} <ChevronRight size={16} />
        </strong>
      </div>
    </Link>
  );
}
export function StudentScreens({
  context,
  path,
}: {
  context: AppContext;
  path: string;
}) {
  if (path === "/menu") return <Catalog context={context} />;
  if (path.startsWith("/menu/"))
    return (
      <ProductDetail
        key={path}
        context={context}
        slug={decodeURIComponent(path.split("/")[2])}
      />
    );
  if (path === "/cart") return <Cart context={context} />;
  if (path === "/checkout") return <Checkout context={context} />;
  if (path === "/orders") return <History context={context} />;
  if (path.startsWith("/orders/") || path.startsWith("/pay/"))
    return <Ticket context={context} id={path.split("/")[2]} />;
  if (path === "/profile/edit") return <ProfileEdit context={context} />;
  if (path === "/profile") return <Profile context={context} />;
  if (path === "/notifications") return <Notifications context={context} />;
  return <About />;
}
function PickupSummary({ data }: { data: Data }) {
  const { now } = useServerClock();
  const next = data.slots.find((s) => availableSlot(s, now));
  return (
    <section className="store-strip">
      <div>
        <span className="eyebrow">Ambil saat istirahat</span>
        <strong>
          {next?.title ||
            (now === null ? "Menyinkronkan waktu…" : "Belum ada sesi tersedia")}
        </strong>
        <span className="small muted">
          {next
            ? `${dateTime(next.starts_at)} – ${formatWibTime(next.ends_at)} WIB`
            : "Jadwal pengambilan akan diatur kantin."}
        </span>
        {next && <SessionTiming slot={next} />}
      </div>
      <span className={"badge " + (data.settings.open ? "open" : "")}>
        {data.settings.open ? "Kantin buka" : "Kantin tutup"}
      </span>
    </section>
  );
}
function Catalog({ context: { data } }: { context: AppContext }) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("");
  const list = data.products.filter(
    (p) =>
      p.active &&
      (!p.category_id ||
        data.categories.some((c) => c.id === p.category_id && c.active)) &&
      (!category || p.category_id === category) &&
      p.name.toLocaleLowerCase("id").includes(query.toLocaleLowerCase("id")),
  );
  return (
    <>
      <PickupSummary data={data} />
      <div className="section-title">
        <div>
          <span className="eyebrow">Pilihan dari kantin</span>
          <h1>Menu hari ini</h1>
        </div>
        <p className="desktop-only muted">Pilih menu untuk jeda istirahatmu.</p>
      </div>
      <label className="search">
        <Search size={20} />
        <span className="sr-only">Cari menu</span>
        <input
          type="search"
          placeholder="Cari menu favoritmu"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="filters" aria-label="Kategori menu">
        <button
          className={!category ? "selected" : ""}
          onClick={() => setCategory("")}
        >
          Semua
        </button>
        {data.categories
          .filter((c) => c.active)
          .map((c) => (
            <button
              className={category === c.id ? "selected" : ""}
              key={c.id}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
      </div>
      {!data.settings.open && (
        <p className="message">
          Kantin sedang tutup. Kamu tetap bisa melihat menu dan menyiapkan
          keranjang.
        </p>
      )}
      <div className="catalog-grid">
        {list.map((p) => (
          <article
            key={p.id}
            className={"product-card " + (p.stock === 0 ? "sold-out" : "")}
          >
            <Link href={"/menu/" + p.slug} className="photo-link">
              <ProductPhoto product={p} />
            </Link>
            <div className="product-copy">
              <span className="eyebrow">
                {data.categories.find((c) => c.id === p.category_id)?.name ||
                  "Menu kantin"}
              </span>
              <Link href={"/menu/" + p.slug}>
                <h2>{p.name}</h2>
              </Link>
              <p className="muted description">
                {p.description || "Pilihan menu kantin."}
              </p>
              <div className="row between">
                <strong>{money(p.price_idr)}</strong>
                {p.stock > 0 ? (
                  <Link
                    className="icon-button add-button"
                    aria-label={"Pilih " + p.name}
                    href={"/menu/" + p.slug}
                  >
                    <Plus size={20} />
                  </Link>
                ) : (
                  <span className="badge">Habis</span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {list.length === 0 && (
        <Empty
          Icon={Search}
          title={query ? "Menu tidak ditemukan" : "Menu belum tersedia"}
          body={
            query
              ? "Coba kata kunci atau kategori lain."
              : "Kantin belum menerbitkan menu untuk dipesan."
          }
        />
      )}
      <p className="pickup-foot">
        <MapPin size={16} />
        {data.settings.pickup_location}
        {data.settings.hours ? " · " + data.settings.hours : ""}
      </p>
    </>
  );
}
function Quantity({
  value,
  onChange,
  max = 99,
  disabled = false,
}: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <div className="quantity">
      <button
        className="icon-button"
        aria-label="Kurangi jumlah"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={16} />
      </button>
      <output aria-label="Jumlah">{value}</output>
      <button
        className="icon-button"
        aria-label="Tambah jumlah"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
function ProductDetail({
  context: { data, busy, run },
  slug,
}: {
  context: AppContext;
  slug: string;
}) {
  const p = data.products.find((p) => p.slug === slug),
    [variant, setVariant] = useState(""),
    [qty, setQty] = useState(1),
    [added, setAdded] = useState(false);
  if (!p)
    return (
      <>
        <Back>Detail menu</Back>
        <Empty
          title="Menu tidak tersedia"
          body="Menu mungkin sudah dinonaktifkan."
          href="/menu"
          label="Lihat menu"
        />
      </>
    );
  const variants = data.variants.filter(
      (v) => v.product_id === p.id && v.active,
    ),
    v = variants.find((v) => v.id === variant);
  const existing = data.cart.find(
    (i) => i.product_id === p.id && i.variant_id === (variant || null),
  );
  const add = async () => {
    try {
      await run(
        {
          type: "cart",
          product: p.id,
          variant: variant || null,
          quantity: Math.min(99, (existing?.quantity || 0) + qty),
        },
        "Menu ditambahkan ke keranjang.",
      );
      setAdded(true);
    } catch {}
  };
  return (
    <>
      <Back>Detail menu</Back>
      <div className="product-detail">
        <ProductPhoto product={p} />
        <section>
          <span className="eyebrow">
            {data.categories.find((c) => c.id === p.category_id)?.name ||
              "Menu kantin"}
          </span>
          <h1>{p.name}</h1>
          <p className="muted">{p.description}</p>
          <h2>{money(unitPrice(p.price_idr, v?.price_delta_idr))}</h2>
          <p className="small muted">
            {p.stock > 0 ? `Tersedia ${p.stock} porsi` : "Stok habis"}
          </p>
          {variants.length > 0 && (
            <label>
              Varian
              <select
                value={variant}
                onChange={(e) => {
                  setVariant(e.target.value);
                  setAdded(false);
                }}
              >
                <option value="">Standar</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.price_delta_idr >= 0 ? "+" : ""}
                    {money(v.price_delta_idr)})
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="row between space-top">
            <span>Jumlah</span>
            <Quantity
              value={qty}
              onChange={setQty}
              max={Math.min(99, p.stock)}
            />
          </div>
          <button
            className="full space-top"
            disabled={
              busy ||
              p.stock === 0 ||
              !p.active ||
              unitPrice(p.price_idr, v?.price_delta_idr) < 0
            }
            onClick={() => void add()}
          >
            <ShoppingBasket size={20} />
            Tambah ·{" "}
            {money(lineTotal(p.price_idr, v?.price_delta_idr || 0, qty))}
          </button>
          {added && (
            <Link className="button secondary full space-top" href="/cart">
              Lihat keranjang
              <ChevronRight size={18} />
            </Link>
          )}
        </section>
      </div>
    </>
  );
}
function Cart({ context }: { context: AppContext }) {
  const { data, busy, run } = context;
  const total = data.cart.reduce((sum, i) => {
    const p = data.products.find((p) => p.id === i.product_id),
      v = data.variants.find((v) => v.id === i.variant_id);
    return (
      sum +
      (p ? lineTotal(p.price_idr, v?.price_delta_idr || 0, i.quantity) : 0)
    );
  }, 0);
  return (
    <>
      <h1>Keranjangmu</h1>
      <p className="muted">
        Harga dan stok akan diperiksa kembali saat checkout.
      </p>
      {data.cart.length === 0 ? (
        <Empty
          Icon={ShoppingBasket}
          title="Keranjangmu kosong"
          body="Pilih menu untuk istirahat nanti."
          href="/menu"
          label="Lihat menu"
        />
      ) : (
        <>
          <div className="cart-list">
            {data.cart.map((i) => {
              const p = data.products.find((p) => p.id === i.product_id),
                v = data.variants.find((v) => v.id === i.variant_id);
              if (!p)
                return (
                  <div className="panel" key={i.id}>
                    <p>Menu tidak lagi tersedia.</p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run({ type: "remove_cart", item: i.id }).catch(
                          () => {},
                        )
                      }
                    >
                      Hapus menu
                    </button>
                  </div>
                );
              const sum = lineTotal(
                p.price_idr,
                v?.price_delta_idr || 0,
                i.quantity,
              );
              return (
                <article className="cart-row" key={i.id}>
                  <ProductPhoto product={p} />
                  <div>
                    <h2>{p.name}</h2>
                    {v && <p className="small muted">{v.name}</p>}
                    <strong>{money(sum)}</strong>
                    <div className="row between space-top">
                      <Quantity
                        value={i.quantity}
                        disabled={busy}
                        max={Math.min(99, p.stock)}
                        onChange={(n) =>
                          void run({
                            type: "cart",
                            product: p.id,
                            variant: i.variant_id,
                            quantity: n,
                          }).catch(() => {})
                        }
                      />
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void run({ type: "remove_cart", item: i.id }).catch(
                            () => {},
                          )
                        }
                      >
                        Hapus
                      </button>
                    </div>
                    {p.stock < i.quantity && (
                      <p className="error-text small">
                        Stok saat ini tidak cukup.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="summary">
            <div className="row between">
              <span>Perkiraan total</span>
              <strong>{money(total)}</strong>
            </div>
            <Link className="button full space-top" href="/checkout">
              Pilih sesi pengambilan
              <ChevronRight size={18} />
            </Link>
          </div>
        </>
      )}
    </>
  );
}
function Checkout({ context: { data, busy, run } }: { context: AppContext }) {
  const router = useRouter();
  const { now, getNow } = useServerClock();
  const [slot, setSlot] = useState(""),
    [method, setMethod] = useState<"cash" | "qris_static">("cash"),
    [note, setNote] = useState(""),
    [key, setKey] = useState(""),
    [error, setError] = useState("");
  const slots = data.slots.filter((s) => availableSlot(s, now));
  const selected = slots.find((s) => s.id === slot);
  /* eslint-disable react-hooks/set-state-in-effect -- Restore the durable checkout key from browser session storage after hydration. */
  useEffect(() => {
    let k = crypto.randomUUID();
    try {
      k = sessionStorage.getItem("manji-checkout-key") || k;
      sessionStorage.setItem("manji-checkout-key", k);
    } catch {
      /* Private browsing may disable storage; DB idempotency and persistent tickets still apply. */
    }
    setKey(k);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const total = data.cart.reduce((sum, i) => {
    const p = data.products.find((p) => p.id === i.product_id),
      v = data.variants.find((v) => v.id === i.variant_id);
    return (
      sum +
      (p ? lineTotal(p.price_idr, v?.price_delta_idr || 0, i.quantity) : 0)
    );
  }, 0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      // Re-read the current instant, not the last rendered second. SQL still
      // rechecks cutoff/capacity after taking the authoritative database lock.
      const current = getNow();
      const candidate = data.slots.find((s) => s.id === slot);
      if (current === null)
        throw new Error(
          "Waktu belum tersinkron. Tunggu sebentar lalu coba lagi.",
        );
      if (!candidate || !availableSlot(candidate, current))
        throw new Error(
          "Sesi penuh atau batas pesan sudah lewat. Pilih sesi lain.",
        );
      const id = await run(
        { type: "checkout", slot, method, key, note },
        "Pesanan tersimpan.",
      );
      try {
        sessionStorage.removeItem("manji-checkout-key");
      } catch {}
      router.push("/orders/" + id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout belum berhasil.");
    }
  };
  return (
    <>
      <Back href="/cart">Konfirmasi pesanan</Back>
      {data.cart.length === 0 ? (
        <Empty
          title="Keranjangmu kosong"
          body="Jika checkout sebelumnya berhasil, tiket ada di riwayat pesanan."
          href="/orders"
          label="Lihat pesanan"
        />
      ) : (
        <form onSubmit={(e) => void submit(e)} className="checkout-grid">
          <section className="form-stack">
            <div className="panel">
              <h2>Ambil saat istirahat</h2>
              <p className="small muted">
                <MapPin size={16} />
                {data.settings.pickup_location}
              </p>
              <label>
                Pilih sesi pengambilan
                <select
                  required
                  value={selected?.id || ""}
                  disabled={now === null}
                  onChange={(e) => setSlot(e.target.value)}
                >
                  <option value="">Pilih sesi</option>
                  {slots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} · {dateTime(s.starts_at)} · sisa{" "}
                      {s.capacity - s.reserved_count}
                    </option>
                  ))}
                </select>
              </label>
              {selected && <SessionTiming slot={selected} />}
              {slot && !selected && now !== null && (
                <p className="message" role="status">
                  Sesi pilihanmu sudah tidak tersedia. Pilih sesi lain.
                </p>
              )}
              {now === null && (
                <p className="message" role="status">
                  Menyinkronkan waktu pengambilan…
                </p>
              )}
              {!slots.length && (
                <p className="message">Belum ada sesi yang bisa dipesan.</p>
              )}
            </div>
            <fieldset className="panel">
              <legend>Pembayaran</legend>
              <label className="choice">
                <input
                  type="radio"
                  name="method"
                  checked={method === "cash"}
                  onChange={() => setMethod("cash")}
                />
                <Banknote size={22} />
                <span>
                  <strong>Tunai saat ambil</strong>
                  <small>Bayar langsung ke petugas kantin.</small>
                </span>
              </label>
              <label className="choice">
                <input
                  type="radio"
                  name="method"
                  disabled={!data.settings.qris_payload}
                  checked={method === "qris_static"}
                  onChange={() => setMethod("qris_static")}
                />
                <QrCode size={22} />
                <span>
                  <strong>QRIS statis</strong>
                  <small>
                    {data.settings.qris_payload
                      ? "Masukkan nominal sendiri. Diverifikasi manual."
                      : "Belum tersedia dari pengelola."}
                  </small>
                </span>
              </label>
            </fieldset>
            <label>
              Catatan untuk kantin (opsional)
              <textarea
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: sambal dipisah"
              />
            </label>
          </section>
          <aside className="panel checkout-summary">
            <h2>Ringkasan</h2>
            {data.cart.map((i) => (
              <div className="row between" key={i.id}>
                <span>
                  {data.products.find((p) => p.id === i.product_id)?.name ||
                    "Menu tidak tersedia"}{" "}
                  ×{i.quantity}
                </span>
              </div>
            ))}
            <hr />
            <div className="row between">
              <strong>Perkiraan total</strong>
              <strong>{money(total)}</strong>
            </div>
            <p className="small muted">
              Total akhir ditentukan server. Bila harga berubah, total pada
              tiket menjadi acuan pembayaran.
            </p>
            {!data.settings.open && (
              <p className="message">Kantin sedang tutup.</p>
            )}
            {error && (
              <p className="message error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="full"
              disabled={
                busy || !key || !selected || now === null || !data.settings.open
              }
            >
              {busy ? "Menyimpan pesanan…" : "Pesan sekarang"}
            </button>
            <p className="small muted">
              Pesanan dan nomor tiket tersimpan setelah checkout berhasil.
            </p>
          </aside>
        </form>
      )}
    </>
  );
}
function History({
  context: { data, page, setPage },
}: {
  context: AppContext;
}) {
  const [filter, setFilter] = useState("active");
  const list = data.orders.filter((o) =>
    filter === "active"
      ? !terminal.includes(o.status)
      : filter === "completed"
        ? o.status === "completed"
        : ["cancelled", "rejected"].includes(o.status),
  );
  return (
    <>
      <h1>Pesananmu</h1>
      <p className="muted">Tiket tersimpan untuk setiap pesanan.</p>
      <div className="filters">
        {[
          ["active", "Aktif"],
          ["completed", "Selesai"],
          ["cancelled", "Dibatalkan"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={filter === v ? "selected" : ""}
            onClick={() => setFilter(v)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="order-list">
        {list.map((o) => (
          <OrderCard key={o.id} o={o} />
        ))}
      </div>
      {!list.length && (
        <Empty
          title="Belum ada pesanan"
          body="Pesanan pada halaman ini akan tampil sesuai statusnya."
          href="/menu"
          label="Lihat menu"
        />
      )}
      <Pagination page={page} setPage={setPage} count={data.orderCount} />
    </>
  );
}
export function Pagination({
  page,
  setPage,
  count,
}: {
  page: number;
  setPage: (p: number) => void;
  count: number;
}) {
  if (count <= 50 && page === 0) return null;
  return (
    <div className="row between space-top">
      <button
        className="secondary"
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
      >
        Sebelumnya
      </button>
      <span className="small">Halaman {page + 1}</span>
      <button
        className="secondary"
        disabled={(page + 1) * 50 >= count}
        onClick={() => setPage(page + 1)}
      >
        Berikutnya
      </button>
    </div>
  );
}
export function Ticket({
  context,
  id,
  admin = false,
}: {
  context: AppContext;
  id: string;
  admin?: boolean;
}) {
  const router = useRouter();
  const { data, busy, run, upload } = context,
    o = data.orders.find((o) => o.id === id),
    [reason, setReason] = useState(""),
    [qr, setQr] = useState(""),
    [copied, setCopied] = useState(false),
    [reorderError, setReorderError] = useState("");
  const payload = data.settings.qris_payload;
  useEffect(() => {
    if (!payload) return;
    let active = true;
    void import("qrcode")
      .then((q) =>
        q.toDataURL(payload, {
          width: 320,
          margin: 4,
          errorCorrectionLevel: "M",
        }),
      )
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [payload]);
  if (!o)
    return (
      <>
        <Back href={admin ? "/admin" : "/orders"}>Detail pesanan</Back>
        <Empty
          title="Pesanan tidak ditemukan"
          body="Pesanan tidak ada atau akunmu tidak memiliki akses."
        />
      </>
    );
  const pay = o.payments[0],
    slot = data.slots.find((s) => s.id === o.pickup_slot_id),
    code = data.tickets.find((t) => t.order_id === id)?.code,
    events = data.events.filter((e) => e.order_id === id),
    proofs = data.proofs.filter((p) => p.payment_id === pay?.id);
  const reorder = async () => {
    setReorderError("");
    try {
      await run(
        { type: "reorder", order: o.id },
        "Menu dimasukkan dengan harga saat ini.",
      );
      router.push("/cart");
    } catch (e) {
      setReorderError(e instanceof Error ? e.message : "Pesan ulang gagal.");
    }
  };
  return (
    <>
      <Back href={admin ? "/admin" : "/orders"}>Tiket pesanan</Back>
      <div className="ticket-grid">
        <section className="ticket panel">
          <div className="row between">
            <span className="eyebrow">MANJI FOOD</span>
            <span className={"badge status-" + o.status}>
              {orderLabels[o.status]}
            </span>
          </div>
          <h1 className="ticket-number" title={o.order_number}>
            {o.order_number}
          </h1>
          <p className="small muted">{dateTime(o.created_at)}</p>
          <div className="ticket-code">
            <span className="eyebrow">
              {admin
                ? "Kode diverifikasi saat pengambilan"
                : "Tunjukkan kode ini ke kantin"}
            </span>
            {!admin && <strong>{code || "Memuat kode…"}</strong>}
            <p>
              {slot?.title || "Sesi pengambilan"} ·{" "}
              {slot ? dateTime(slot.starts_at) : ""}
            </p>
            {slot && <SessionTiming slot={slot} />}
            <span className="small muted">
              <MapPin size={15} />
              {data.settings.pickup_location}
            </span>
          </div>
          <div className="line-items">
            {o.order_items.map((i) => (
              <div key={i.id} className="row between">
                <div>
                  {i.product_name_snapshot} ×{i.quantity}
                  {i.variant_name_snapshot && (
                    <small className="muted block">
                      {i.variant_name_snapshot}
                    </small>
                  )}
                </div>
                <strong>{money(i.line_total_idr)}</strong>
              </div>
            ))}
          </div>
          {o.customer_note && (
            <p className="small">Catatan: {o.customer_note}</p>
          )}
          <hr />
          <div className="row between">
            <strong>Total pesanan</strong>
            <strong>{money(o.total_idr)}</strong>
          </div>
          <p className="payment-state">
            {o.payment_method === "cash" ? "Tunai saat ambil" : "QRIS statis"} ·{" "}
            <strong>{paymentLabels[pay?.status || "unpaid"]}</strong>
          </p>
          {pay?.admin_note && (
            <p className="message small">
              Catatan pembayaran: {pay.admin_note}
            </p>
          )}
        </section>
        <section className="form-stack">
          {!admin &&
            o.payment_method === "qris_static" &&
            !terminal.includes(o.status) &&
            pay?.status !== "paid" && (
              <div className="panel">
                <h2>Bayar dengan QRIS</h2>
                <p className="muted small">
                  Pindai QRIS merchant melalui aplikasi pembayaran. Masukkan
                  nominal persis seperti total tiket.
                </p>
                {qr ? (
                  <img
                    className="qris-image"
                    src={qr}
                    alt="QRIS statis merchant MANJI FOOD"
                  />
                ) : (
                  <p className="message">
                    QRIS belum dapat ditampilkan. Hubungi kantin; jangan
                    membayar ke QR lain.
                  </p>
                )}
                <div className="row between">
                  <strong>{money(o.total_idr)}</strong>
                  <button
                    className="secondary compact"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(String(o.total_idr))
                        .then(() => setCopied(true))
                        .catch(() => setCopied(false))
                    }
                  >
                    <Copy size={16} />
                    {copied ? "Tersalin" : "Salin nominal"}
                  </button>
                </div>
                <p className="message small">
                  QRIS ini statis. Bukti gambar tidak membuktikan dana masuk.
                  Admin memeriksa mutasi merchant sebelum menandai lunas.
                </p>
                <label className="upload-label">
                  <Upload size={18} />
                  Bukti bayar (opsional)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy || proofs.length >= 3}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void upload(file, "proof", o.id).catch(() => {});
                      e.target.value = "";
                    }}
                  />
                </label>
                <p className="small muted">
                  JPG, PNG, WebP · maksimal 4 MB · 3 gambar
                </p>
                <button
                  className="full"
                  disabled={busy || pay?.status === "pending_verification"}
                  onClick={() =>
                    void run(
                      { type: "order", order: id, action: "claim_payment" },
                      "Permintaan pemeriksaan terkirim.",
                    ).catch(() => {})
                  }
                >
                  {pay?.status === "pending_verification"
                    ? "Menunggu pembayaran dicek"
                    : "Sudah bayar · minta diperiksa"}
                </button>
              </div>
            )}
          {!admin && o.payment_method === "cash" && pay?.status !== "paid" && (
            <div className="panel">
              <Banknote size={25} />
              <h2>Tunai saat ambil</h2>
              <p>
                Siapkan {money(o.total_idr)} dan tunjukkan kode tiket kepada
                petugas.
              </p>
            </div>
          )}
          {proofs.length > 0 && (
            <div className="panel">
              <h2>Bukti pembayaran</h2>
              {proofs.map((p, i) => (
                <a
                  key={p.id}
                  className="text-link block"
                  href={"/api/upload?proof=" + p.id}
                  target="_blank"
                  rel="noreferrer"
                >
                  Lihat bukti {i + 1}
                  <ChevronRight size={16} />
                </a>
              ))}
              <p className="small muted">
                Tautan akses sementara, khusus pemilik pesanan dan admin.
              </p>
            </div>
          )}
          <div className="panel">
            <h2>Perjalanan pesanan</h2>
            <ol className="timeline">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="timeline-dot">
                    <Check size={12} />
                  </span>
                  <strong>
                    {eventLabels[e.event_type] ||
                      orderLabels[e.to_state] ||
                      "Status diperbarui"}
                  </strong>
                  <time>{dateTime(e.created_at)}</time>
                  {e.note && <p>{e.note}</p>}
                </li>
              ))}
            </ol>
          </div>
          {!admin &&
            ["pending", "confirmed"].includes(o.status) &&
            !["paid", "pending_verification"].includes(pay?.status) && (
              <details className="panel">
                <summary>Batalkan pesanan</summary>
                <label className="space-top">
                  Alasan pembatalan
                  <input
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  className="secondary space-top"
                  disabled={busy || reason.trim().length < 3}
                  onClick={() =>
                    void run({
                      type: "order",
                      order: id,
                      action: "cancel",
                      note: reason,
                    }).catch(() => {})
                  }
                >
                  Batalkan pesanan
                </button>
              </details>
            )}
          {!admin && terminal.includes(o.status) && (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void reorder()}
              >
                Pesan ulang dengan harga saat ini
              </button>
              {reorderError && (
                <p className="message error" role="alert">
                  {reorderError}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
function Profile({ context: { data, run } }: { context: AppContext }) {
  const logout = async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const sub = await registration?.pushManager?.getSubscription();
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
          "",
        );
        await sub.unsubscribe();
      }
    } catch {
      // Optional push cleanup must not block secure session logout.
    }
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (res.ok) {
        sessionStorage.removeItem("manji-checkout-key");
        location.replace("/login");
      } else window.alert("Keluar belum berhasil. Coba lagi.");
    } catch {
      window.alert("Keluar belum berhasil. Periksa koneksi lalu coba lagi.");
    }
  };
  return (
    <>
      <h1>Akunmu</h1>
      <section className="profile-card panel">
        <div className="avatar">
          <UserRound size={32} />
        </div>
        <div>
          <h2>{data.profile.full_name || "Siswa"}</h2>
          <p className="muted">
            {data.profile.class_name || "Kelas belum diisi"}
          </p>
          <span className="small break-word">{data.email}</span>
        </div>
      </section>
      <div className="link-list">
        {[
          { href: "/profile/edit", label: "Edit profil", Icon: UserRound },
          { href: "/notifications", label: "Notifikasi", Icon: Bell },
          {
            href: "/forgot-password",
            label: "Atur ulang kata sandi",
            Icon: Mail,
          },
          { href: "/about", label: "Tentang aplikasi", Icon: Info },
        ].map(({ href, label, Icon }) => (
          <Link key={href} href={href}>
            <Icon size={20} />
            <span>{label}</span>
            <ChevronRight size={18} />
          </Link>
        ))}
        {data.profile.role === "admin" && (
          <Link href="/admin">
            <ReceiptText size={20} />
            <span>Kelola kantin</span>
            <ChevronRight size={18} />
          </Link>
        )}
        <button className="text-button" onClick={() => void logout()}>
          <LogOut size={20} />
          Keluar dari akun
        </button>
      </div>
    </>
  );
}
function ProfileEdit({
  context: { data, busy, run },
}: {
  context: AppContext;
}) {
  const [name, setName] = useState(data.profile.full_name),
    [className, setClassName] = useState(data.profile.class_name || "");
  return (
    <>
      <Back href="/profile">Edit profil</Back>
      <form
        className="panel form-stack narrow"
        onSubmit={(e) => {
          e.preventDefault();
          void run({
            type: "profile",
            name,
            class_name: className,
            notifications: data.profile.notifications_enabled,
          }).catch(() => {});
        }}
      >
        <label>
          Nama lengkap
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label>
          Kelas
          <input
            maxLength={40}
            value={className}
            onChange={(e) => setClassName(e.target.value)}
          />
        </label>
        <label>
          Email
          <input value={data.email} disabled />
        </label>
        <button type="submit" disabled={busy}>
          Simpan profil
        </button>
      </form>
    </>
  );
}
function Notifications({ context }: { context: AppContext }) {
  const { data, busy, run } = context;
  return (
    <>
      <Back href="/profile">Notifikasi</Back>
      <PushPreferences context={context} />
      <div className="row between space-top">
        <h2>Kabar pesanan</h2>
        <button
          className="text-button"
          disabled={busy}
          onClick={() =>
            void run({ type: "read_notifications" }).catch(() => {})
          }
        >
          Tandai dibaca
        </button>
      </div>
      {data.notifications.length === 0 ? (
        <Empty
          Icon={Bell}
          title="Belum ada kabar"
          body="Perubahan status pesanan akan tampil di sini."
        />
      ) : (
        <div className="notice-list">
          {data.notifications.map((n) => (
            <Link
              key={n.id}
              href={
                n.order_id
                  ? (data.profile.role === "admin" ? "/admin" : "") +
                    "/orders/" +
                    n.order_id
                  : "/profile"
              }
              className={"notice-item " + (!n.read_at ? "unread" : "")}
            >
              <Bell size={20} />
              <div>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <time className="small muted">{dateTime(n.created_at)}</time>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
function About() {
  return (
    <>
      <Back href="/profile">Tentang MANJI FOOD</Back>
      <section className="panel narrow">
        <div className="wordmark">
          manji<span>.</span> food
        </div>
        <h2>Pesan untuk istirahat</h2>
        <p>
          Aplikasi pemesanan satu kantin sekolah dengan satu lokasi pengambilan.
          Status pembayaran diperiksa oleh pengelola kantin.
        </p>
        <hr />
        <span className="eyebrow">Pengembang</span>
        <h2>Kographh by Fizzxverss</h2>
        <a
          className="text-link block"
          href="https://wa.me/6288991114939"
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={19} />
          088991114939
        </a>
        <a
          className="text-link block break-word"
          href="mailto:fizzxverss@luujaaa.my.id"
        >
          <Mail size={19} />
          fizzxverss@luujaaa.my.id
        </a>
      </section>
    </>
  );
}
