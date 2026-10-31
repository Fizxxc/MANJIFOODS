import type { Data } from "../../src/lib/domain";
const uid = "11111111-1111-4111-8111-111111111111",
  pid = "44444444-4444-4444-8444-444444444444",
  sid = "55555555-5555-4555-8555-555555555555",
  oid = "77777777-7777-4777-8777-777777777777";
// Explicit test fixtures only; never imported by application routes or APIs.
export function fixture(admin = false): Data {
  const result: Data = {
    queueCounts: { pending: 1, preparing: 0, ready: 0, unacknowledged: 1 },
    unacknowledgedOrders: [],
    profile: {
      id: uid,
      full_name: "Siswa pengujian antarmuka",
      class_name: "XI Tes",
      role: admin ? "admin" : "student",
      notifications_enabled: true,
    },
    email: "ui-test@example.invalid",
    categories: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        name: "Makanan",
        sort_order: 1,
        active: true,
      },
    ],
    products: [
      {
        id: pid,
        name: "Menu pengujian antarmuka",
        slug: "menu-pengujian",
        description: "Data khusus pengujian tampilan, bukan katalog produksi.",
        category_id: "88888888-8888-4888-8888-888888888888",
        price_idr: 12000,
        stock: 10,
        image_path: null,
        active: true,
      },
      {
        id: "99999999-9999-4999-8999-999999999999",
        name: "Menu stok habis",
        slug: "menu-habis",
        description: "Keadaan stok habis.",
        category_id: "",
        price_idr: 4000,
        stock: 0,
        image_path: null,
        active: true,
      },
    ],
    variants: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        product_id: pid,
        name: "Tambahan pengujian",
        price_delta_idr: 2000,
        active: true,
      },
    ],
    sessions: [
      {
        id: sid,
        title: "Istirahat pengujian",
        starts_at: new Date(Date.now() - 3600000).toISOString(),
        ends_at: null,
        session_mode: "manual",
        reserved_count: 1,
        active: true,
      },
    ],
    cart: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        product_id: pid,
        variant_id: null,
        quantity: 1,
      },
    ],
    orders: [
      {
        id: oid,
        order_number: "MF-20261030-000001",
        student_id: uid,
        pickup_slot_id: sid,
        pickup_at: new Date(Date.now() + 7200000).toISOString(),
        status: "pending",
        payment_method: "cash",
        total_idr: 12000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        customer_note: "Catatan pengujian",
        acknowledged_at: null,
        order_items: [
          {
            id: "item",
            product_id: pid,
            variant_id: null,
            product_name_snapshot: "Menu pengujian antarmuka",
            variant_name_snapshot: null,
            quantity: 1,
            unit_price_idr: 12000,
            line_total_idr: 12000,
          },
        ],
        payments: [
          {
            id: "payment",
            status: "unpaid",
            method: "cash",
            amount_idr: 12000,
            merchant_reference: null,
            admin_note: null,
            verified_at: null,
          },
        ],
      },
    ],
    tickets: [{ order_id: oid, code: "ABCDEF1234" }],
    notifications: [
      {
        id: "notice",
        order_id: oid,
        type: "new_order",
        title: "Pesanan pengujian",
        body: "Kabar khusus pengujian antarmuka.",
        read_at: null,
        created_at: new Date().toISOString(),
      },
    ],
    events: [
      {
        id: 1,
        order_id: oid,
        event_type: "order_created",
        from_state: "",
        to_state: "pending",
        note: null,
        created_at: new Date().toISOString(),
      },
    ],
    proofs: [],
    settings: {
      open: true,
      pickup_location: "Lokasi khusus pengujian",
      hours: "",
      qris_payload: "",
    },
    orderCount: 1,
  };
  result.unacknowledgedOrders = admin ? result.orders : [];
  return result;
}
