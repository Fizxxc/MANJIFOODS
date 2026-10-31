import { NextResponse } from "next/server";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
  }
}
// Read endpoints never echo unknown exception messages, SQL details or payloads.
export function readApiError(error: unknown) {
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message, code: error.code },
      {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  if (
    error instanceof Error &&
    ["AUTH_REQUIRED", "ADMIN_REQUIRED"].includes(error.message)
  )
    return apiError(error);
  return NextResponse.json(
    {
      error:
        "Data belum dapat dimuat. Coba lagi; jika berlanjut, hubungi kantin.",
      code: "DATA_UNAVAILABLE",
    },
    {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.NEXT_PUBLIC_APP_URL;
  if (!expected || origin !== new URL(expected).origin)
    throw new Error("ORIGIN_REJECTED");
}
export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Permintaan gagal.";
  const status =
    message === "AUTH_REQUIRED"
      ? 401
      : message === "ADMIN_REQUIRED" || message === "ORIGIN_REJECTED"
        ? 403
        : message.includes("belum dikonfigurasi")
          ? 503
          : 400;
  const safe =
    message === "AUTH_REQUIRED"
      ? "Silakan masuk kembali."
      : message === "ADMIN_REQUIRED"
        ? "Akses admin diperlukan."
        : message === "ORIGIN_REJECTED"
          ? "Asal permintaan tidak diizinkan."
          : message;
  return NextResponse.json(
    { error: safe },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export async function readJson(request: Request) {
  const text = new TextDecoder().decode(await boundedBody(request, 16384));
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Format permintaan tidak valid.");
  }
}
export async function boundedBody(request: Request, maximum: number) {
  if (Number(request.headers.get("content-length")) > maximum)
    throw new Error("Permintaan terlalu besar.");
  const reader = request.body?.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("Permintaan terlalu besar.");
      }
      chunks.push(value);
    }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
const attempts = new Map<string, { count: number; until: number }>();
// Supplementary single-instance auth throttle; Supabase Auth provides deployment-wide auth limits.
export function authThrottle(ip: string) {
  const now = Date.now();
  for (const [key, value] of attempts)
    if (value.until < now) attempts.delete(key);
  const entry = attempts.get(ip) ?? { count: 0, until: now + 60000 };
  entry.count++;
  attempts.set(ip, entry);
  if (entry.count > 12)
    throw new Error("Terlalu banyak percobaan. Tunggu satu menit.");
}
