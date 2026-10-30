import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
export async function GET(request: Request) {
  const url = new URL(request.url),
    origin = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const next =
    url.searchParams.get("next") === "/reset-password"
      ? "/reset-password"
      : "/menu";
  const db = await serverClient();
  let success = false;
  const code = url.searchParams.get("code"),
    hash = url.searchParams.get("token_hash"),
    type = url.searchParams.get("type");
  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    success = !error;
  } else if (
    hash &&
    type &&
    ["signup", "recovery", "email", "invite"].includes(type)
  ) {
    const { error } = await db.auth.verifyOtp({
      token_hash: hash,
      type: type as EmailOtpType,
    });
    success = !error;
  }
  return NextResponse.redirect(
    new URL(success ? next : "/login?error=link", origin),
  );
}
