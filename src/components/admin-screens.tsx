"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Check,
  ArrowRight,
  Download,
  Upload,
  Search,
} from "lucide-react";
import {
  dateTime,
  money,
  terminal,
  type Category,
  type Product,
  openSession,
  type Variant,
} from "@/lib/domain";
import { type AppContext } from "./app";
import { Empty, OrderCard, Pagination, Ticket } from "./student-screens";
import { SessionTiming } from "./clock";
import { wibDate } from "@/lib/time";
import { useWibToday } from "@/hooks/use-server-clock";
export function AdminScreens({
  context,
  path,
}: {
  context: AppContext;
  path: string;
}) {
  if (path === "/admin") return <Board context={context} />;
  if (path.startsWith("/admin/orders/"))
    return (
      <>
        <Ticket context={context} id={path.split("/")[3]} admin />
        <OrderActions context={context} id={path.split("/")[3]} />
      </>
    );
  if (path === "/admin/products") return <Products context={context} />;
  if (path === "/admin/categories") return <Categories context={context} />;
  if (path === "/admin/sessions") return <Sessions context={context} />;
  if (path === "/admin/payments") return <Payments context={context} />;
  if (path === "/admin/reports") return <Reports context={context} />;
  return <StoreSettings context={context} />;
}
function Board({
  context: {
    data,
    busy,
    run,
    queueTab: tab,
    setQueueTab: setTab,
    page,
    setPage,
  },
}: {
  context: AppContext;
}) {
  const [query, setQuery] = useState("");
  const groups = [
    { key: "pending", label: "Baru", states: ["pending"] },
    { key: "preparing", label: "Diproses", states: ["confirmed", "preparing"] },
    { key: "ready", label: "Siap diambil", states: ["ready"] },
  ];
  const list = data.orders.filter(
    (o) =>
      groups.find((g) => g.key === tab)?.states.includes(o.status) &&
      o.order_number.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="section-title">
        <div>
          <h1>Antrean pesanan</h1>
          <p className="muted">
            Periksa, siapkan, lalu serahkan saat istirahat.
          </p>
        </div>
        <Link className="button secondary" href="/admin/payments">
          Periksa pembayaran
        </Link>
      </div>
      <div className="filters queue-tabs">
        {groups.map((g) => (
          <button
            key={g.key}
            onClick={() => setTab(g.key)}
            className={tab === g.key ? "selected" : ""}
          >
            {g.label}
            <span className="tab-count">{data.queueCounts[g.key] ?? 0}</span>
          </button>
        ))}
        <Link className="button secondary" href="/admin/reports">
          Selesai & laporan
        </Link>
      </div>
      <label className="search">
        <Search size={20} />
        <span className="sr-only">Cari nomor tiket</span>
        <input
          type="search"
          placeholder="Cari nomor tiket"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="queue-grid">
        {list.map((o) => {
          const next =
            o.status === "pending"
              ? "confirmed"
              : o.status === "confirmed"
                ? "preparing"
                : o.status === "preparing"
                  ? "ready"
                  : null;
          return (
            <article className="queue-ticket" key={o.id}>
              <OrderCard o={o} admin />
              <div className="queue-slot">
                <span>
                  {data.sessions.find((s) => s.id === o.pickup_slot_id)?.title}
                </span>
                {!o.acknowledged_at && (
                  <span className="badge">Belum ditinjau</span>
                )}
              </div>
              {next ? (
                <button
                  className="full"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      type: "order",
                      order: o.id,
                      action: next as "confirmed" | "preparing" | "ready",
                    }).catch(() => {})
                  }
                >
                  {next === "confirmed"
                    ? "Terima pesanan"
                    : next === "preparing"
                      ? "Mulai siapkan"
                      : "Tandai siap diambil"}
                  <ArrowRight size={18} />
                </button>
              ) : (
                <Link className="button full" href={"/admin/orders/" + o.id}>
                  Verifikasi pengambilan
                  <Check size={18} />
                </Link>
              )}
            </article>
          );
        })}
      </div>
      {!list.length && (
        <Empty
          title="Antrean kosong"
          body="Pesanan pada tahap ini akan muncul di sini."
        />
      )}
      <Pagination page={page} setPage={setPage} count={data.orderCount} />
    </>
  );
}
function OrderActions({
  context: { data, busy, run },
  id,
}: {
  context: AppContext;
  id: string;
}) {
  const o = data.orders.find((o) => o.id === id),
    [note, setNote] = useState(""),
    [code, setCode] = useState(""),
    [ref, setRef] = useState(""),
    [settlement, setSettlement] = useState(false);
  if (!o) return null;
  const pay = o.payments[0];
  if (!pay)
    return (
      <section className="panel space-top">
        <h2>Tindakan pengelola</h2>
        <p className="message error" role="alert">
          Data pembayaran belum tersedia. Muat ulang dan periksa catatan
          transaksi sebelum melakukan tindakan. Status transaksi tidak diubah.
        </p>
      </section>
    );
  const action = (
    a:
      | "verify_payment"
      | "collect_cash"
      | "reject_payment"
      | "refund"
      | "reject"
      | "cancel"
      | "completed"
      | "acknowledge",
  ) =>
    void run({
      type: "order",
      order: id,
      action: a,
      note,
      code,
      reference: ref,
    })
      .then(() => {
        setSettlement(false);
        setCode("");
      })
      .catch(() => {});
  return (
    <section className="panel space-top">
      <h2>Tindakan pengelola</h2>
      <p className="small muted">
        Setiap tindakan dicatat. Bukti transfer hanya pendukung; cocokkan
        jumlah, waktu, dan referensi pada mutasi merchant.
      </p>
      <div className="form-grid">
        <label>
          Referensi mutasi / pengembalian
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            maxLength={120}
          />
        </label>
        <label>
          Catatan / alasan
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </label>
      </div>
      {pay?.status !== "paid" && pay?.status !== "refunded" && (
        <>
          <label className="check space-top">
            <input
              type="checkbox"
              checked={settlement}
              onChange={(e) => setSettlement(e.target.checked)}
            />
            {o.payment_method === "cash"
              ? "Saya sudah menerima uang tunai sesuai total."
              : "Saya sudah mencocokkan dana masuk nyata di mutasi merchant."}
          </label>
          <div className="row wrap space-top">
            <button
              disabled={
                busy ||
                !settlement ||
                (o.payment_method === "qris_static" && ref.trim().length < 3) ||
                (terminal.includes(o.status) && note.trim().length < 10)
              }
              onClick={() =>
                action(
                  o.payment_method === "cash"
                    ? "collect_cash"
                    : "verify_payment",
                )
              }
            >
              {o.payment_method === "cash"
                ? "Catat uang tunai diterima"
                : "Verifikasi pembayaran QRIS"}
            </button>
            {o.payment_method === "qris_static" && (
              <button
                className="secondary"
                disabled={busy || note.trim().length < 3}
                onClick={() => action("reject_payment")}
              >
                Tolak klaim pembayaran
              </button>
            )}
          </div>
        </>
      )}
      {o.status === "ready" && (
        <div className="pickup-action">
          <label>
            Kode pengambilan dari siswa
            <input
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={10}
              placeholder="10 karakter pada tiket"
            />
          </label>
          <button
            disabled={busy || pay?.status !== "paid" || code.length !== 10}
            onClick={() => action("completed")}
          >
            Verifikasi & selesaikan
          </button>
          <p className="small muted">
            Pembayaran lunas dan kode yang cocok wajib sebelum pesanan selesai.
          </p>
        </div>
      )}
      <div className="row wrap space-top">
        {!o.acknowledged_at && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => action("acknowledge")}
          >
            Sudah ditinjau
          </button>
        )}
        {["pending", "confirmed"].includes(o.status) &&
          !["paid", "pending_verification"].includes(pay?.status) && (
            <>
              <button
                className="secondary"
                disabled={busy || note.trim().length < 3}
                onClick={() => action("reject")}
              >
                Tolak pesanan
              </button>
              <button
                className="secondary"
                disabled={busy || note.trim().length < 3}
                onClick={() => action("cancel")}
              >
                Batalkan pesanan
              </button>
            </>
          )}
      </div>
      {pay?.status === "paid" && o.status !== "completed" && (
        <details className="space-top">
          <summary>Rekonsiliasi / pengembalian dana</summary>
          <p className="message">
            Lakukan pengembalian dana nyata di luar aplikasi terlebih dahulu.
            Isi referensi pengembalian dan catatan minimal 10 karakter di atas.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={settlement}
              onChange={(e) => setSettlement(e.target.checked)}
            />
            Dana sudah benar-benar dikembalikan ke pembayar.
          </label>
          <button
            className="secondary space-top"
            disabled={
              busy ||
              !settlement ||
              note.trim().length < 10 ||
              ref.trim().length < 3
            }
            onClick={() => action("refund")}
          >
            Catat dana dikembalikan
          </button>
        </details>
      )}
    </section>
  );
}
function EditorShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="panel editor" aria-label={title}>
      <div className="row between">
        <h2>{title}</h2>
        <button className="text-button" onClick={onClose}>
          Tutup editor
        </button>
      </div>
      {children}
    </section>
  );
}
function Products({ context }: { context: AppContext }) {
  const { data } = context,
    [edit, setEdit] = useState<Product | null | undefined>(undefined),
    [variant, setVariant] = useState<{ p: Product; v: Variant | null } | null>(
      null,
    ),
    [query, setQuery] = useState("");
  return (
    <>
      <div className="section-title">
        <div>
          <h1>Menu kantin</h1>
          <p className="muted">Atur harga, stok, foto, dan pilihan menu.</p>
        </div>
        <button onClick={() => setEdit(null)}>
          <Plus size={18} />
          Tambah menu
        </button>
      </div>
      {edit !== undefined && (
        <EditorShell
          title={edit ? "Edit menu" : "Menu baru"}
          onClose={() => setEdit(undefined)}
        >
          <ProductEditor
            key={edit?.id || "new"}
            context={context}
            product={edit}
            done={() => setEdit(undefined)}
          />
        </EditorShell>
      )}
      {variant && (
        <EditorShell
          title={"Varian · " + variant.p.name}
          onClose={() => setVariant(null)}
        >
          <VariantEditor
            key={variant.v?.id || "new"}
            context={context}
            product={variant.p}
            variant={variant.v}
            done={() => setVariant(null)}
          />
        </EditorShell>
      )}
      <label className="search">
        <Search size={20} />
        <span className="sr-only">Cari menu admin</span>
        <input
          placeholder="Cari menu"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="management-list">
        {data.products
          .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
          .map((p) => (
            <article className="panel" key={p.id}>
              <div className="row between">
                <div>
                  <h2>{p.name}</h2>
                  <p className="small muted">
                    {money(p.price_idr)} · Stok {p.stock} ·{" "}
                    {p.active ? "Aktif" : "Nonaktif"}
                  </p>
                </div>
                <button className="secondary" onClick={() => setEdit(p)}>
                  Edit
                </button>
              </div>
              <div className="row wrap">
                {data.variants
                  .filter((v) => v.product_id === p.id)
                  .map((v) => (
                    <button
                      className="secondary compact"
                      key={v.id}
                      onClick={() => setVariant({ p, v })}
                    >
                      {v.name} · {v.active ? "Aktif" : "Nonaktif"}
                    </button>
                  ))}
                <button
                  className="text-button"
                  onClick={() => setVariant({ p, v: null })}
                >
                  <Plus size={16} />
                  Varian
                </button>
              </div>
            </article>
          ))}
      </div>
      {!data.products.length && (
        <Empty
          title="Belum ada menu"
          body="Tambahkan menu asli kantin untuk mulai menerima pesanan."
        />
      )}
    </>
  );
}
function ProductEditor({
  context: { data, busy, run, upload },
  product,
  done,
}: {
  context: AppContext;
  product: Product | null;
  done: () => void;
}) {
  const [photo, setPhoto] = useState(product?.image_path || "");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await run({
        type: "product",
        id: product?.id || null,
        data: {
          name: String(f.get("name")),
          slug: String(f.get("slug")),
          description: String(f.get("description")),
          category_id: String(f.get("category_id")),
          price_idr: Number(f.get("price")),
          stock: Number(f.get("stock")),
          image_path: photo,
          active: f.get("active") === "on",
        },
      });
      done();
    } catch {}
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="form-stack">
      <div className="form-grid">
        <label>
          Nama menu
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={product?.name}
          />
        </label>
        <label>
          Slug (huruf kecil dan tanda hubung)
          <input
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={140}
            defaultValue={product?.slug}
          />
        </label>
        <label>
          Kategori
          <select name="category_id" defaultValue={product?.category_id || ""}>
            <option value="">Tanpa kategori</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Harga (Rp)
          <input
            type="number"
            name="price"
            required
            min={0}
            max={10000000}
            step={1}
            defaultValue={product?.price_idr ?? 0}
          />
        </label>
        <label>
          Stok tersedia (di luar stok dipesan)
          <input
            type="number"
            name="stock"
            required
            min={0}
            max={1000000}
            step={1}
            defaultValue={product?.stock ?? 0}
          />
        </label>
        <label className="upload-label">
          <Upload size={18} />
          Foto menu
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void upload(file, "product")
                  .then(setPhoto)
                  .catch(() => {});
            }}
          />
        </label>
      </div>
      {photo && (
        <p className="small">
          Foto terpilih: {photo}
          <button
            className="text-button"
            type="button"
            onClick={() => setPhoto("")}
          >
            Hapus foto dari menu
          </button>
        </p>
      )}
      <label>
        Deskripsi
        <textarea
          name="description"
          maxLength={1500}
          defaultValue={product?.description || ""}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          name="active"
          defaultChecked={product?.active ?? true}
        />
        Menu aktif
      </label>
      <button type="submit" disabled={busy}>
        Simpan menu
      </button>
    </form>
  );
}
function VariantEditor({
  context: { busy, run },
  product,
  variant,
  done,
}: {
  context: AppContext;
  product: Product;
  variant: Variant | null;
  done: () => void;
}) {
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run({
          type: "variant",
          id: variant?.id || null,
          data: {
            product_id: product.id,
            name: String(f.get("name")),
            price_delta_idr: Number(f.get("delta")),
            active: f.get("active") === "on",
          },
        })
          .then(done)
          .catch(() => {});
      }}
    >
      <label>
        Nama varian
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={variant?.name}
        />
      </label>
      <label>
        Selisih harga (Rp)
        <input
          type="number"
          name="delta"
          required
          min={-product.price_idr}
          max={10000000}
          defaultValue={variant?.price_delta_idr ?? 0}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          name="active"
          defaultChecked={variant?.active ?? true}
        />
        Varian aktif
      </label>
      <button disabled={busy} type="submit">
        Simpan varian
      </button>
    </form>
  );
}
function Categories({ context: { data, busy, run } }: { context: AppContext }) {
  const [edit, setEdit] = useState<Category | null | undefined>(undefined);
  return (
    <>
      <div className="section-title">
        <h1>Kategori menu</h1>
        <button onClick={() => setEdit(null)}>
          <Plus size={18} />
          Tambah kategori
        </button>
      </div>
      {edit !== undefined && (
        <EditorShell title="Editor kategori" onClose={() => setEdit(undefined)}>
          <form
            key={edit?.id || "new"}
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run({
                type: "category",
                id: edit?.id || null,
                data: {
                  name: String(f.get("name")),
                  sort_order: Number(f.get("sort")),
                  active: f.get("active") === "on",
                },
              })
                .then(() => setEdit(undefined))
                .catch(() => {});
            }}
          >
            <label>
              Nama kategori
              <input
                required
                maxLength={80}
                name="name"
                defaultValue={edit?.name}
              />
            </label>
            <label>
              Urutan
              <input
                required
                type="number"
                min={0}
                max={1000}
                name="sort"
                defaultValue={edit?.sort_order ?? 0}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="active"
                defaultChecked={edit?.active ?? true}
              />
              Kategori aktif
            </label>
            <button type="submit" disabled={busy}>
              Simpan kategori
            </button>
          </form>
        </EditorShell>
      )}
      <div className="management-list">
        {data.categories.map((c) => (
          <div className="panel row between" key={c.id}>
            <div>
              <strong>{c.name}</strong>
              <p className="small muted">
                Urutan {c.sort_order} · {c.active ? "Aktif" : "Nonaktif"}
              </p>
            </div>
            <button className="secondary" onClick={() => setEdit(c)}>
              Edit
            </button>
          </div>
        ))}
      </div>
      {!data.categories.length && (
        <Empty
          title="Belum ada kategori"
          body="Kelompokkan menu agar lebih mudah dicari."
        />
      )}
    </>
  );
}
function Sessions({ context: { data, busy, run } }: { context: AppContext }) {
  const startKey = useRef<string | null>(null);
  const current = data.sessions.find(openSession);
  return (
    <>
      <div className="section-title">
        <div>
          <h1>Sesi kantin</h1>
          <p className="muted">
            Sesi tetap terbuka sampai diakhiri admin, termasuk setelah tengah
            malam.
          </p>
        </div>
      </div>
      <section className="panel form-stack">
        <h2>{current ? "Sesi aktif" : "Belum ada sesi terbuka"}</h2>
        {current ? (
          <>
            <p>Dimulai {dateTime(current.starts_at)}</p>
            <SessionTiming session={current} />
            <p className="small muted">
              {current.reserved_count} pesanan pada sesi ini. Mengakhiri sesi
              tidak membatalkan pesanan yang sudah masuk.
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void run(
                  { type: "session_end", session: current.id },
                  "Sesi diakhiri. Pesanan yang sudah masuk tetap diproses.",
                ).catch(() => {})
              }
            >
              Akhiri sesi
            </button>
          </>
        ) : (
          <>
            <p className="small muted">
              Mulai sesi untuk menerima pesanan. Waktu mulai dan selesai dicatat
              otomatis oleh server.
            </p>
            <button
              disabled={busy}
              onClick={() => {
                startKey.current ||= crypto.randomUUID();
                void run(
                  { type: "session_start", key: startKey.current },
                  "Sesi dimulai.",
                )
                  .then(() => {
                    startKey.current = null;
                  })
                  .catch(() => {});
              }}
            >
              Mulai sesi
            </button>
          </>
        )}
      </section>
      <h2 className="space-top">Riwayat sesi</h2>
      <div className="management-list">
        {data.sessions
          .filter((s) => s.ends_at !== null)
          .map((session) => (
            <article className="panel" key={session.id}>
              <h3>{session.title}</h3>
              <p className="small muted">
                Mulai {dateTime(session.starts_at)}
                <br />
                Selesai {dateTime(session.ends_at!)}
              </p>
              <SessionTiming session={session} />
            </article>
          ))}
      </div>
      {!data.sessions.some((s) => s.ends_at !== null) && (
        <p className="muted">Belum ada sesi yang diakhiri.</p>
      )}
    </>
  );
}
function Payments({
  context: { data, page, setPage },
}: {
  context: AppContext;
}) {
  const [filter, setFilter] = useState("pending_verification");
  return (
    <>
      <h1>Pembayaran</h1>
      <p className="muted">
        Periksa mutasi merchant sebelum verifikasi. Bukti gambar bukan dana
        masuk.
      </p>
      <div className="filters">
        {[
          ["pending_verification", "Perlu dicek"],
          ["unpaid", "Belum dibayar"],
          ["paid", "Lunas"],
          ["all", "Semua"],
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
        {data.orders
          .filter((o) => filter === "all" || o.payments[0]?.status === filter)
          .map((o) => (
            <OrderCard o={o} key={o.id} admin />
          ))}
      </div>
      {!data.orders.some(
        (o) => filter === "all" || o.payments[0]?.status === filter,
      ) && (
        <Empty
          title="Tidak ada pembayaran pada halaman ini"
          body="Gunakan filter atau halaman berikutnya untuk melihat pesanan lain."
        />
      )}
      <Pagination page={page} setPage={setPage} count={data.orderCount} />
    </>
  );
}
function Reports({
  context: { data, page, setPage },
}: {
  context: AppContext;
}) {
  const today = useWibToday();
  const [chosenDay, setDay] = useState<string | null>(null);
  const day = chosenDay ?? today;
  const list = data.orders.filter((o) => wibDate(o.created_at) === day),
    paid = list
      .filter((o) => o.payments[0]?.status === "paid")
      .reduce((s, o) => s + o.total_idr, 0),
    refund = list
      .filter((o) => o.payments[0]?.status === "refunded")
      .reduce((s, o) => s + o.total_idr, 0);
  return (
    <>
      <h1>Laporan harian</h1>
      <p className="muted">
        Ringkasan halaman pesanan ini. Ekspor CSV mencakup seluruh pesanan pada
        tanggal terpilih (WIB).
      </p>
      <div className="row wrap">
        <label>
          Tanggal
          <input
            type="date"
            required
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <a
          className="button secondary"
          aria-disabled={!day}
          href={day ? "/api/reports?day=" + day : undefined}
        >
          <Download size={18} />
          Ekspor laporan lengkap
        </a>
      </div>
      <div className="report-summary panel space-top">
        <div>
          <span className="eyebrow">Tercatat lunas</span>
          <h2>{money(paid)}</h2>
        </div>
        <div>
          <span className="eyebrow">Dikembalikan</span>
          <h2>{money(refund)}</h2>
        </div>
        <div>
          <span className="eyebrow">Pesanan pada halaman</span>
          <h2>{list.length}</h2>
        </div>
      </div>
      <div className="order-list">
        {list.map((o) => (
          <OrderCard key={o.id} o={o} admin />
        ))}
      </div>
      <Pagination page={page} setPage={setPage} count={data.orderCount} />
    </>
  );
}
function StoreSettings({
  context: { data, busy, run },
}: {
  context: AppContext;
}) {
  return (
    <>
      <h1>Pengaturan kantin</h1>
      <p className="muted">Satu kantin, satu titik pengambilan.</p>
      <form
        className="panel form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run({
            type: "store",
            open: f.get("open") === "on",
            location: String(f.get("location")),
            hours: String(f.get("hours")),
            qris: String(f.get("qris")),
          }).catch(() => {});
        }}
      >
        <label className="check">
          <input
            type="checkbox"
            name="open"
            defaultChecked={data.settings.open}
          />
          Terima pesanan baru
        </label>
        <label>
          Lokasi pengambilan
          <input
            name="location"
            required
            maxLength={160}
            defaultValue={data.settings.pickup_location}
          />
        </label>
        <label>
          Keterangan jam kantin
          <input
            name="hours"
            maxLength={250}
            defaultValue={data.settings.hours}
          />
        </label>
        <label>
          Payload QRIS statis merchant
          <textarea
            className="code-input"
            name="qris"
            maxLength={2048}
            rows={6}
            defaultValue={data.settings.qris_payload}
            placeholder="Isi string asli dari merchant; kosongkan untuk menonaktifkan QRIS."
          />
        </label>
        <p className="message">
          Gunakan payload asli QRIS statis dari merchant. Aplikasi memvalidasi
          struktur dan checksum, lalu menampilkannya tanpa menyisipkan nominal.
          Cocokkan nama merchant menggunakan aplikasi pembayaran sebelum membuka
          layanan.
        </p>
        <button disabled={busy} type="submit">
          Simpan pengaturan
        </button>
      </form>
      <section className="panel space-top">
        <h2>Prosedur operasional</h2>
        <ol className="operational-list">
          <li>Pastikan stok dan sesi tersedia sebelum membuka kantin.</li>
          <li>
            Periksa nominal, waktu, dan referensi unik pada mutasi merchant
            untuk setiap klaim QRIS.
          </li>
          <li>Catat tunai yang diterima sebelum menyelesaikan pengambilan.</li>
          <li>
            Untuk pembayaran terlambat, temukan tiket dari laporan lalu catat
            rekonsiliasi atau pengembalian dana nyata.
          </li>
          <li>
            Notifikasi tetap tersimpan di aplikasi. Web Push memerlukan VAPID
            dan penjadwal pengiriman; suara memerlukan izin interaksi browser.
          </li>
        </ol>
      </section>
    </>
  );
}
