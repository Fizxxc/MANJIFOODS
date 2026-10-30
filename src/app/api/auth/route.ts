import { NextResponse } from "next/server";
import { z } from "zod";
import { serverClient, identity } from "@/lib/supabase/server";
import {
  assertOrigin,
  apiError,
  authThrottle,
  boundedBody,
  readJson,
} from "@/lib/security";
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("login"),
    email: z.email(),
    password: z.string().min(1).max(128),
  }),
  z.object({
    action: z.literal("register"),
    email: z.email(),
    password: z.string().min(10).max(128),
    name: z.string().trim().min(1).max(120),
    class_name: z.string().trim().max(40),
  }),
  z.object({ action: z.literal("forgot"), email: z.email() }),
  z.object({
    action: z.literal("reset"),
    password: z.string().min(10).max(128),
  }),
  z.object({ action: z.literal("logout") }),
]);
export async function POST(request: Request) {
  const isForm =
    request.headers.get("content-type")?.split(";")[0].trim() ===
    "application/x-www-form-urlencoded";
  let formPage = "/login";
  try {
    assertOrigin(request);
    authThrottle(
      request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local",
    );
    const body = isForm
      ? Object.fromEntries(
          new URLSearchParams(
            new TextDecoder().decode(await boundedBody(request, 16384)),
          ),
        )
      : await readJson(request);
    if (isForm) {
      const pages = new Map([
        ["login", "/login"],
        ["register", "/register"],
        ["forgot", "/forgot-password"],
        ["reset", "/reset-password"],
      ]);
      formPage = pages.get(body.action) || "/login";
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new Error("Periksa isian. Gunakan kata sandi minimal 10 karakter.");
    const input = parsed.data,
      db = await serverClient();
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL!).origin;
    let destination = "/menu";
    if (input.action === "logout") {
      const { error } = await db.auth.signOut();
      if (error) throw new Error("Keluar gagal. Coba lagi.");
    }
    if (input.action === "login") {
      const { error } = await db.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error)
        throw new Error(
          "Email atau kata sandi salah, atau email belum diverifikasi.",
        );
      const { profile } = await identity();
      if (profile.role === "admin") destination = "/admin";
    }
    if (input.action === "register") {
      const { error } = await db.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: { full_name: input.name, class_name: input.class_name },
          emailRedirectTo: origin + "/auth/callback",
        },
      });
      if (error)
        throw new Error(
          "Pendaftaran belum berhasil. Coba lagi atau gunakan pemulihan akun.",
        );
    }
    if (input.action === "forgot") {
      await db.auth.resetPasswordForEmail(input.email, {
        redirectTo: origin + "/auth/callback?next=/reset-password",
      });
    }
    if (input.action === "reset") {
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user)
        throw new Error("Tautan pemulihan tidak valid atau kedaluwarsa.");
      const { error } = await db.auth.updateUser({ password: input.password });
      if (error) throw new Error("Kata sandi belum dapat diperbarui.");
      await db.auth.signOut({ scope: "global" });
    }
    if (isForm) {
      // POST/Redirect/GET: credentials stay in the request body even without JS.
      const target =
        input.action === "login" || input.action === "logout"
          ? input.action === "logout"
            ? "/login"
            : destination
          : `${input.action === "reset" ? "/login" : formPage}?success=auth`;
      const response = NextResponse.redirect(new URL(target, origin), 303);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    return NextResponse.json(
      { ok: true, destination },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const response = apiError(error);
    if (isForm && response.status !== 403) {
      // Never echo submitted fields or provider messages into a redirect URL.
      const redirect = NextResponse.redirect(
        new URL(`${formPage}?error=auth`, request.url),
        303,
      );
      redirect.headers.set("Cache-Control", "no-store");
      return redirect;
    }
    return response;
  }
}
