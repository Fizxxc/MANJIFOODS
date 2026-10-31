import { identity } from "@/lib/supabase/server";
import { HttpError, readApiError } from "@/lib/security";
import { csvCell } from "@/lib/domain";
import { normalizeOrders } from "@/lib/order-response";
export async function GET(request: Request) {
  try {
    const { db } = await identity(true),
      day = new URL(request.url).searchParams.get("day");
    if (
      !day ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      Number.isNaN(Date.parse(day + "T00:00:00+07:00"))
    )
      throw new HttpError(400, "Tanggal tidak valid.", "INVALID_QUERY");
    const start = new Date(day + "T00:00:00+07:00"),
      end = new Date(start.getTime() + 86400000);
    const rows: unknown[][] = [
      [
        "Nomor",
        "Dibuat (UTC)",
        "Status pesanan",
        "Metode",
        "Status pembayaran",
        "Total IDR",
        "Pendapatan lunas IDR",
        "Referensi",
      ],
    ];
    let offset = 0;
    for (;;) {
      const { data, error } = await db
        .from("orders")
        .select(
          "id,order_number,student_id,pickup_slot_id,pickup_at,status,payment_method,total_idr,created_at,updated_at,customer_note,acknowledged_at,order_items(*),payments(*)",
        )
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error("Laporan belum dapat dimuat.");
      const orders = normalizeOrders(data);
      for (const o of orders) {
        const p = o.payments[0];
        rows.push([
          o.order_number,
          o.created_at,
          o.status,
          o.payment_method,
          p?.status,
          o.total_idr,
          p?.status === "paid" ? o.total_idr : 0,
          p?.merchant_reference,
        ]);
      }
      if (orders.length < 500) break;
      offset += 500;
    }
    return new Response(
      "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="manji-${day}.csv"`,
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return readApiError(error);
  }
}
