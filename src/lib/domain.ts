import { z } from "zod";
import { formatWibTime } from "./time";

export const orderLabels: Record<string, string> = {
  pending: "Menunggu konfirmasi",
  confirmed: "Dikonfirmasi",
  preparing: "Sedang disiapkan",
  ready: "Siap diambil",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  rejected: "Ditolak",
};
export const paymentLabels: Record<string, string> = {
  unpaid: "Belum dibayar",
  pending_verification: "Menunggu pembayaran dicek",
  paid: "Lunas",
  rejected: "Pembayaran ditolak",
  refunded: "Dana dikembalikan",
};
export const terminal = ["completed", "cancelled", "rejected"];
export const eventLabels: Record<string, string> = {
  order_created: "Pesanan dibuat",
  claim_payment: "Pemeriksaan pembayaran diminta",
  cancel: "Pesanan dibatalkan",
  acknowledge: "Pesanan ditinjau pengelola",
  verify_payment: "QRIS diverifikasi pengelola",
  collect_cash: "Tunai diterima pengelola",
  reject_payment: "Klaim pembayaran ditolak",
  refund: "Pengembalian dana dicatat",
  reject: "Pesanan ditolak",
  confirmed: "Pesanan dikonfirmasi",
  preparing: "Persiapan dimulai",
  ready: "Pesanan siap diambil",
  completed: "Pesanan diserahkan",
};
export const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
});
export const dateTime = (s: string) =>
  `${dateFormatter.format(new Date(s))} ${formatWibTime(s)} WIB`;
export function unitPrice(base: number, delta = 0) {
  const n = base + delta;
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Harga tidak valid.");
  return n;
}
export function lineTotal(base: number, delta: number, qty: number) {
  if (!Number.isInteger(qty) || qty < 1 || qty > 99)
    throw new Error("Jumlah tidak valid.");
  return unitPrice(base, delta) * qty;
}
export function openSession(session: Session) {
  return (
    session.session_mode === "manual" &&
    session.active &&
    session.ends_at === null
  );
}
export function allowedTransition(from: string, to: string) {
  return (
    (
      {
        pending: "confirmed",
        confirmed: "preparing",
        preparing: "ready",
        ready: "completed",
      } as Record<string, string>
    )[from] === to
  );
}
export function crc16(bytes: Uint8Array) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let j = 0; j < 8; j++)
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
export function validStaticQris(payload: string) {
  const bytes = new TextEncoder().encode(payload),
    decoder = new TextDecoder("utf-8", { fatal: true });
  if (bytes.length < 40 || bytes.length > 2048) return false;
  const tags: Record<string, string> = {};
  let p = 0;
  try {
    while (p < bytes.length) {
      const tag = decoder.decode(bytes.slice(p, p + 2)),
        lenText = decoder.decode(bytes.slice(p + 2, p + 4));
      if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenText) || tag in tags)
        return false;
      const len = Number(lenText);
      if (p + 4 + len > bytes.length) return false;
      tags[tag] = decoder.decode(bytes.slice(p + 4, p + 4 + len));
      p += 4 + len;
      if (tag === "63" && (len !== 4 || p !== bytes.length)) return false;
    }
  } catch {
    return false;
  }
  return (
    tags["00"] === "01" &&
    tags["01"] === "11" &&
    tags["53"] === "360" &&
    tags["58"] === "ID" &&
    !("54" in tags) &&
    !!tags["59"] &&
    !!tags["60"] &&
    crc16(bytes.slice(0, -4)) === tags["63"]?.toUpperCase()
  );
}
export const uuid = z.uuid();
const short = z.string().trim().min(1).max(120);
const productData = z.object({
  name: short,
  slug: z
    .string()
    .max(140)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  description: z.string().max(1500),
  category_id: z.union([uuid, z.literal("")]),
  price_idr: z.number().int().min(0).max(10000000),
  stock: z.number().int().min(0).max(1000000),
  image_path: z.string().max(300),
  active: z.boolean(),
});
const variantData = z.object({
  product_id: uuid,
  name: short,
  price_delta_idr: z.number().int().min(-10000000).max(10000000),
  active: z.boolean(),
});
export const pickupTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const pickupPreviewSchema = z.object({ time: pickupTimeSchema });
const categoryData = z.object({
  name: short,
  sort_order: z.number().int().min(0).max(1000),
  active: z.boolean(),
});
export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cart"),
    product: uuid,
    variant: uuid.nullable(),
    quantity: z.number().int().min(0).max(99),
  }),
  z.object({ type: z.literal("remove_cart"), item: uuid }),
  z.object({ type: z.literal("reorder"), order: uuid }),
  z.object({
    type: z.literal("checkout"),
    session: uuid,
    pickup_time: pickupTimeSchema,
    expected_pickup_at: z.iso.datetime({ offset: true }),
    method: z.enum(["cash", "qris_static"]),
    key: uuid,
    note: z.string().max(300),
  }),
  z.object({
    type: z.literal("order"),
    order: uuid,
    action: z.enum([
      "claim_payment",
      "cancel",
      "acknowledge",
      "verify_payment",
      "collect_cash",
      "reject_payment",
      "refund",
      "reject",
      "confirmed",
      "preparing",
      "ready",
      "completed",
    ]),
    note: z.string().max(500).default(""),
    code: z.string().max(20).default(""),
    reference: z.string().max(120).default(""),
  }),
  z.object({
    type: z.literal("profile"),
    name: short,
    class_name: z.string().max(40),
    notifications: z.boolean(),
  }),
  z.object({
    type: z.literal("category"),
    id: uuid.nullable(),
    data: categoryData,
  }),
  z.object({
    type: z.literal("product"),
    id: uuid.nullable(),
    data: productData,
  }),
  z.object({
    type: z.literal("variant"),
    id: uuid.nullable(),
    data: variantData,
  }),
  z.object({ type: z.literal("session_start"), key: uuid }),
  z.object({ type: z.literal("session_end"), session: uuid }),
  z.object({
    type: z.literal("store"),
    open: z.boolean(),
    location: z.string().trim().min(1).max(160),
    hours: z.string().max(250),
    qris: z
      .string()
      .refine(
        (s) => s === "" || validStaticQris(s),
        "Payload QRIS statis atau CRC tidak valid.",
      ),
  }),
  z.object({ type: z.literal("read_notifications") }),
  z.object({
    type: z.literal("push"),
    endpoint: z.url().max(2048),
    p256dh: z.string().max(200),
    auth: z.string().max(100),
    remove: z.boolean(),
  }),
]);
export type Command = z.input<typeof commandSchema>;
export type Profile = {
  id: string;
  full_name: string;
  class_name: string;
  role: "student" | "admin";
  notifications_enabled: boolean;
};
export type Category = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};
export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category_id: string;
  price_idr: number;
  stock: number;
  image_path: string | null;
  active: boolean;
};
export type Variant = {
  id: string;
  product_id: string;
  name: string;
  price_delta_idr: number;
  active: boolean;
};
export type Session = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  session_mode: "manual" | "scheduled";
  reserved_count: number;
  active: boolean;
};
export type CartItem = {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
};
export type Item = {
  id: string;
  product_id: string;
  variant_id: string | null;
  product_name_snapshot: string;
  variant_name_snapshot: string | null;
  quantity: number;
  unit_price_idr: number;
  line_total_idr: number;
};
export type Payment = {
  id: string;
  status: string;
  method: string;
  amount_idr: number;
  merchant_reference: string | null;
  admin_note: string | null;
  verified_at: string | null;
};
export type Order = {
  id: string;
  order_number: string;
  student_id: string;
  pickup_slot_id: string;
  pickup_at: string | null;
  status: string;
  payment_method: string;
  total_idr: number;
  created_at: string;
  updated_at: string;
  customer_note: string;
  acknowledged_at: string | null;
  order_items: Item[];
  payments: Payment[];
};
export type Notice = {
  id: string;
  order_id: string | null;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};
export type Event = {
  id: number;
  order_id: string;
  event_type: string;
  from_state: string;
  to_state: string;
  note: string | null;
  created_at: string;
};
export type Proof = { id: string; payment_id: string; storage_path: string };
export type Store = {
  open: boolean;
  pickup_location: string;
  hours: string;
  qris_payload: string;
};
export type Data = {
  queueCounts: Record<string, number>;
  unacknowledgedOrders: Order[];
  profile: Profile;
  email: string;
  categories: Category[];
  products: Product[];
  variants: Variant[];
  sessions: Session[];
  cart: CartItem[];
  orders: Order[];
  tickets: { order_id: string; code: string }[];
  notifications: Notice[];
  events: Event[];
  proofs: Proof[];
  settings: Store;
  orderCount: number;
};
export type PickupPreview = {
  session_id: string;
  pickup_at: string;
  server_now: string;
};
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
