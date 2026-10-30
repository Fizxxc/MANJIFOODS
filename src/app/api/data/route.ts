import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/server";
import { apiError } from "@/lib/security";
import { uuid } from "@/lib/domain";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { db, user, profile } = await identity();
    const url = new URL(request.url);
    const page = Math.max(
      0,
      Math.min(10000, Math.floor(Number(url.searchParams.get("page")) || 0)),
    );
    const order = url.searchParams.get("order");
    if (order && !uuid.safeParse(order).success)
      throw new Error("ID pesanan tidak valid.");
    let oq = db
      .from("orders")
      .select(
        "id,order_number,student_id,pickup_slot_id,status,payment_method,total_idr,created_at,updated_at,customer_note,acknowledged_at,order_items(*),payments(*)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });
    if (order) oq = oq.eq("id", order);
    else if (url.searchParams.get("active") === "1") {
      const group = url.searchParams.get("group");
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
        .select("*")
        .gte("ends_at", new Date(Date.now() - 86400000).toISOString())
        .order("starts_at"),
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
      slots,
      cart,
      orders,
      notifications,
      settings,
    ] = results;
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
              "id,order_number,student_id,pickup_slot_id,status,payment_method,total_idr,created_at,updated_at,customer_note,acknowledged_at,order_items(*),payments(*)",
            )
            .is("acknowledged_at", null)
            .not("status", "in", "(completed,cancelled,rejected)")
            .order("created_at")
            .limit(50)
        : { data: [], error: null };
    if (unacknowledged.error)
      throw new Error("Pengingat antrean belum dapat dimuat.");
    const slotIds = [
      ...new Set((orders.data ?? []).map((o) => o.pickup_slot_id)),
    ].filter((id) => !slots.data?.some((s) => s.id === id));
    if (slotIds.length) {
      const history = await db
        .from("pickup_slots")
        .select("*")
        .in("id", slotIds);
      if (history.error) throw new Error("Sesi pesanan belum dapat dimuat.");
      slots.data?.push(...history.data);
    }
    const ids = (orders.data ?? []).map((o) => o.id);
    const [tickets, events, proofs] = ids.length
      ? await Promise.all([
          db.from("pickup_tickets").select("order_id,code").in("order_id", ids),
          db
            .from("order_events")
            .select("*")
            .in("order_id", ids)
            .order("created_at"),
          db
            .from("payment_proofs")
            .select("id,payment_id,storage_path")
            .in(
              "payment_id",
              (orders.data ?? []).flatMap((o) => o.payments.map((p) => p.id)),
            ),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (tickets.error || events.error || proofs.error)
      throw new Error("Detail pesanan belum dapat dimuat.");
    return NextResponse.json(
      {
        profile,
        queueCounts: queue.data,
        unacknowledgedOrders: unacknowledged.data,
        email: user.email,
        categories: categories.data,
        products: products.data,
        variants: variants.data,
        slots: slots.data,
        cart: cart.data,
        orders: orders.data,
        notifications: notifications.data,
        settings: settings.data?.value,
        tickets: tickets.data,
        events: events.data,
        proofs: proofs.data,
        orderCount: orders.count ?? 0,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
