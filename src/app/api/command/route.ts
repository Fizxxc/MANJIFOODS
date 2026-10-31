import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/server";
import { commandSchema } from "@/lib/domain";
import { assertOrigin, apiError, readJson } from "@/lib/security";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = commandSchema.safeParse(await readJson(request));
    if (!input.success)
      throw new Error(
        "Isian tidak valid. Periksa jumlah, waktu, dan data yang dipilih.",
      );
    const c = input.data;
    const admin = [
      "product",
      "category",
      "variant",
      "session_start",
      "session_end",
      "store",
    ].includes(c.type);
    const { db } = await identity(
      admin ||
        (c.type === "order" && ["completed", "reject"].includes(c.action)),
    );
    const { error: rate } = await db.rpc("consume_rate_limit");
    if (rate) throw new Error(rate.message);
    let name: string, args: Record<string, unknown>;
    switch (c.type) {
      case "cart":
        name = "set_cart_item";
        args = {
          p_product: c.product,
          p_variant: c.variant,
          p_quantity: c.quantity,
        };
        break;
      case "remove_cart":
        name = "remove_cart_item";
        args = { p_item: c.item };
        break;
      case "reorder":
        name = "reorder_order";
        args = { p_order: c.order };
        break;
      case "checkout":
        name = "checkout_session";
        args = {
          p_session: c.session,
          p_pickup_time: c.pickup_time,
          p_expected_pickup_at: c.expected_pickup_at,
          p_method: c.method,
          p_key: c.key,
          p_note: c.note,
        };
        break;
      case "session_start":
        name = "session_start";
        args = { p_key: c.key };
        break;
      case "session_end":
        name = "session_end";
        args = { p_session: c.session };
        break;
      case "order":
        if (c.action === "reject") {
          name = "reject_order";
          args = { p_order: c.order, p_reason: c.note };
          break;
        }
        if (c.action === "completed") {
          name = "complete_order";
          args = { p_order: c.order, p_note: c.note };
          break;
        }
        name = "order_command";
        args = {
          p_order: c.order,
          p_action: c.action,
          p_note: c.note,
          p_code: c.code,
          p_reference: c.reference,
        };
        break;
      case "profile":
        name = "update_profile";
        args = {
          p_name: c.name,
          p_class: c.class_name,
          p_notifications: c.notifications,
        };
        break;
      case "store":
        name = "save_store";
        args = {
          p_open: c.open,
          p_location: c.location,
          p_hours: c.hours,
          p_qris: c.qris,
        };
        break;
      case "read_notifications":
        name = "read_notifications";
        args = {};
        break;
      case "push":
        name = "save_push";
        args = {
          p_endpoint: c.endpoint,
          p_p256dh: c.p256dh,
          p_auth: c.auth,
          p_remove: c.remove,
        };
        break;
      default:
        name = "admin_save";
        args = { p_kind: c.type, p_id: c.id, p_data: c.data };
    }
    const { data, error } = await db.rpc(name, args);
    if (error)
      throw new Error(
        error.code === "23505"
          ? "Referensi atau data sudah digunakan. Periksa kembali."
          : error.code === "42501"
            ? "Tindakan tidak diizinkan."
            : error.message,
      );
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
