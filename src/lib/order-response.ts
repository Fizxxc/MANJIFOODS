import { z } from "zod";
import type { Data, Order, Payment } from "./domain";

const id = z.string().min(1);
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });
const method = z.enum(["cash", "qris_static"]);
const state = z.enum([
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
  "rejected",
]);
const text = z
  .string()
  .nullable()
  .transform((v) => v ?? "");
export const paymentSchema = z.object({
  id,
  method,
  status: z.enum([
    "unpaid",
    "pending_verification",
    "paid",
    "rejected",
    "refunded",
  ]),
  amount_idr: amount,
  merchant_reference: z.string().nullable(),
  admin_note: z.string().nullable(),
  verified_at: timestamp.nullable(),
});
// PostgREST's reverse UNIQUE foreign key is to-one (object|null). Older
// transports/fixtures may use arrays. Publish only Payment[], never raw embeds.
export const paymentsSchema = z.preprocess(
  (value) =>
    value === null || value === undefined
      ? []
      : Array.isArray(value)
        ? value
        : [value],
  z.array(paymentSchema).max(1),
);
export function normalizePayments(value: unknown): Payment[] {
  return paymentsSchema.parse(value);
}
export const orderSchema = z
  .object({
    id,
    order_number: id,
    student_id: id,
    pickup_slot_id: id,
    pickup_at: timestamp.nullable(),
    status: state,
    payment_method: method,
    total_idr: amount,
    created_at: timestamp,
    updated_at: timestamp,
    customer_note: text,
    acknowledged_at: timestamp.nullable(),
    order_items: z.array(
      z.object({
        id,
        product_id: id,
        variant_id: id.nullable(),
        product_name_snapshot: z.string(),
        variant_name_snapshot: z.string().nullable(),
        quantity: z.number().int().positive(),
        unit_price_idr: amount,
        line_total_idr: amount,
      }),
    ),
    payments: paymentsSchema,
  })
  .superRefine((order, ctx) => {
    const payment = order.payments[0];
    if (
      payment &&
      (payment.amount_idr !== order.total_idr ||
        payment.method !== order.payment_method)
    )
      ctx.addIssue({
        code: "custom",
        path: ["payments"],
        message: "Payment does not match order",
      });
  });
export function normalizeOrders(value: unknown): Order[] {
  return z.array(orderSchema).parse(value);
}

// Validate the HTTP read model again before React can iterate any collections.
// Invalid data fails visibly; it is never converted into an invented payment.
const dataSchema = z.object({
  profile: z.object({
    id,
    full_name: z.string(),
    class_name: text,
    role: z.enum(["student", "admin"]),
    notifications_enabled: z.boolean(),
  }),
  email: z.string(),
  queueCounts: z.record(z.string(), amount),
  orders: z.array(orderSchema),
  unacknowledgedOrders: z.array(orderSchema),
  categories: z.array(
    z.object({
      id,
      name: z.string(),
      sort_order: z.number().int(),
      active: z.boolean(),
    }),
  ),
  products: z.array(
    z.object({
      id,
      name: z.string(),
      slug: z.string(),
      description: text,
      category_id: text,
      price_idr: amount,
      stock: amount,
      image_path: z.string().nullable(),
      active: z.boolean(),
    }),
  ),
  variants: z.array(
    z.object({
      id,
      product_id: id,
      name: z.string(),
      price_delta_idr: z.number().int(),
      active: z.boolean(),
    }),
  ),
  sessions: z.array(
    z.object({
      id,
      title: z.string(),
      starts_at: timestamp,
      ends_at: timestamp.nullable(),
      session_mode: z.enum(["manual", "scheduled"]),
      reserved_count: amount,
      active: z.boolean(),
    }),
  ),
  cart: z.array(
    z.object({
      id,
      product_id: id,
      variant_id: id.nullable(),
      quantity: z.number().int().positive(),
    }),
  ),
  tickets: z.array(z.object({ order_id: id, code: z.string() })),
  notifications: z.array(
    z.object({
      id,
      order_id: id.nullable(),
      type: z.string(),
      title: z.string(),
      body: z.string(),
      read_at: timestamp.nullable(),
      created_at: timestamp,
    }),
  ),
  events: z.array(
    z.object({
      id: z.number().int(),
      order_id: id,
      event_type: z.string(),
      from_state: text,
      to_state: text,
      note: z.string().nullable(),
      created_at: timestamp,
    }),
  ),
  proofs: z.array(z.object({ id, payment_id: id, storage_path: z.string() })),
  settings: z.object({
    open: z.boolean(),
    pickup_location: z.string(),
    hours: z.string(),
    qris_payload: z.string(),
  }),
  orderCount: amount,
});
export function parseDataResponse(value: unknown): Data {
  const result = dataSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Format data pesanan tidak valid. Muat ulang atau hubungi kantin.",
    );
  return result.data;
}

export function parseDataQuery(params: URLSearchParams) {
  for (const key of ["page", "order", "active", "group"])
    if (params.getAll(key).length > 1)
      throw new Error("Parameter berulang tidak diizinkan.");
  const parsed = z
    .object({
      page: z
        .string()
        .regex(/^(0|[1-9]\d{0,4})$/)
        .transform(Number)
        .refine((n) => n <= 10000)
        .default(0),
      order: z.uuid().optional(),
      active: z.enum(["0", "1"]).optional(),
      group: z.enum(["pending", "preparing", "ready"]).optional(),
    })
    .safeParse(Object.fromEntries(params));
  if (!parsed.success)
    throw new Error(
      "Parameter tidak valid: page 0–10000, order UUID, active 0/1, group pending/preparing/ready.",
    );
  return parsed.data;
}
