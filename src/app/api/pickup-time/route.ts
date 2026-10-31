import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/server";
import { pickupPreviewSchema } from "@/lib/domain";
import { apiError, assertOrigin, readJson } from "@/lib/security";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const parsed = pickupPreviewSchema.safeParse(await readJson(request));
    if (!parsed.success)
      throw new Error("Pilih jam pengambilan dalam format HH:mm.");
    const { db } = await identity();
    const { error: rate } = await db.rpc("consume_rate_limit");
    if (rate) throw new Error(rate.message);
    const { data, error } = await db.rpc("pickup_time_preview", {
      p_time: parsed.data.time,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
