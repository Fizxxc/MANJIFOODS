import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/server";
import { HttpError, readApiError } from "@/lib/security";
import {
  normalizeOrders,
  parseDataQuery,
  parseDataResponse,
} from "@/lib/order-response";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { db, user, profile } = await identity();
    const url = new URL(request.url);
    let query;
    try {
      query = parseDataQuery(url.searchParams);
    } catch (error) {
      throw new HttpError(400, (error as Error).message, "INVALID_QUERY");
    }
    const { page, order, active, group } = query;
    let oq = db
      .from("orders")
      .select(
        "id,order_number,student_id,pickup_slot_id,pickup_at,status,payment_method,total_idr,created_at,updated_at,customer_note,acknowledged_at,order_items(*),payments(*)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });
    // The SSR client carries the user's JWT, never a service-role key. Keep
    // an explicit owner filter in addition to orders/payments/proofs RLS.
    if (profile.role !== "admin") oq = oq.eq("student_id", user.id);
    if (order) oq = oq.eq("id", order);
    else if (active === "1") {
      const states =
        group === "ready"
          ? ["ready"]
          : group === "preparing"
            ? ["confirmed", "preparing"]
            : ["pending"];
      oq = oq.in("status", states).range(page * 50, page * 50 + 49);
    } else oq = oq.range(page * 50, page * 50 + 49);
    const results = await Promise.all([
      db.from("categories").select("*").order("sort_order"),
      db.from("products").select("*").order("name"),
      db.from("product_variants").select("*"),
      db
        .from("pickup_slots")
        .select("id,title,starts_at,ends_at,session_mode,active,reserved_count")
        .eq("session_mode", "manual")
        .order("starts_at", { ascending: false })
        .limit(50),
      db
        .from("cart_items")
        .select("id,product_id,variant_id,quantity,carts!inner(student_id)")
        .eq("carts.student_id", user.id),
      oq,
      db
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      db.from("app_settings").select("value").eq("key", "store").single(),
    ]);
    for (const result of results)
      if (result.error)
        throw new Error(
          "Data belum dapat dimuat. Periksa koneksi dan migrasi database.",
        );
    const [
      categories,
      products,
      variants,
      sessions,
      cart,
      orders,
      notifications,
      settings,
    ] = results;
    const orderRows = normalizeOrders(orders.data);
    if (order && orderRows.length === 0)
      throw new HttpError(
        404,
        "Pesanan tidak ditemukan atau tidak dapat diakses.",
        "ORDER_NOT_FOUND",
      );
    const queue =
      profile.role === "admin"
        ? await db.rpc("admin_queue_counts")
        : { data: {}, error: null };
    if (queue.error) throw new Error("Antrean belum dapat dimuat.");
    const unacknowledged =
      profile.role === "admin"
        ? await db
            .from("orders")
            .select(
              "id,order_number,student_id,pickup_slot_id,pickup_at,status,payment_method,total_idr,created_at,updated_at,customer_note,acknowledged_at,order_items(*),payments(*)",
            )
            .is("acknowledged_at", null)
            .not("status", "in", "(completed,cancelled,rejected)")
            .order("created_at")
            .limit(50)
        : { data: [], error: null };
    if (unacknowledged.error)
      throw new Error("Pengingat antrean belum dapat dimuat.");
    const reminderRows = normalizeOrders(unacknowledged.data);
    const slotIds = [...new Set(orderRows.map((o) => o.pickup_slot_id))].filter(
      (id) => !sessions.data?.some((s) => s.id === id),
    );
    if (slotIds.length) {
      const history = await db
        .from("pickup_slots")
        .select("id,title,starts_at,ends_at,session_mode,active,reserved_count")
        .in("id", slotIds);
      if (history.error) throw new Error("Sesi pesanan belum dapat dimuat.");
      sessions.data?.push(...history.data);
    }
    const ids = orderRows.map((o) => o.id);
    const paymentIds = orderRows.flatMap((o) => o.payments.map((p) => p.id));
    const [tickets, events, proofs] = ids.length
      ? await Promise.all([
          db.from("pickup_tickets").select("order_id,code").in("order_id", ids),
          db
            .from("order_events")
            .select("*")
            .in("order_id", ids)
            .order("created_at"),
          paymentIds.length
            ? db
                .from("payment_proofs")
                .select("id,payment_id,storage_path")
                .in("payment_id", paymentIds)
            : Promise.resolve({ data: [], error: null }),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (tickets.error || events.error || proofs.error)
      throw new Error("Detail pesanan belum dapat dimuat.");
    return NextResponse.json(
      parseDataResponse({
        profile,
        queueCounts: queue.data,
        unacknowledgedOrders: reminderRows,
        email: user.email,
        categories: categories.data,
        products: products.data,
        variants: variants.data,
        sessions: sessions.data,
        cart: cart.data,
        orders: orderRows,
        notifications: notifications.data,
        settings: settings.data?.value,
        tickets: tickets.data,
        events: events.data,
        proofs: proofs.data,
        orderCount: orders.count ?? 0,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return readApiError(error);
  }
}
