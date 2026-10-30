import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/csp";
import { cleanCredentialUrl } from "@/lib/auth-url";
export async function proxy(request: NextRequest) {
  const assetRequest =
    /^\/(?:_next\/(?:static|image)(?:\/|$)|icons\/|sw\.js$|manifest\.webmanifest$|favicon\.ico$)/.test(
      request.nextUrl.pathname,
    );
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy({
    nonce,
    development: process.env.NODE_ENV === "development",
    requestUrl: request.url,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const requestHeaders = new Headers(request.headers);
  // Overwrite incoming values; neither a client nonce nor CSP is trusted.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const secure = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", policy);
    if (!assetRequest)
      response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  const cleanUrl = cleanCredentialUrl(request.url);
  if (cleanUrl) {
    const redirect = secure(NextResponse.redirect(cleanUrl, 303));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  const next = () =>
    secure(NextResponse.next({ request: { headers: requestHeaders } }));
  let response = next();
  // Assets retain Next's cache policy and do not trigger session refreshes.
  // They still receive CSP, including any not-found HTML under these prefixes.
  if (assetRequest) return response;
  // Public time synchronization never needs a Supabase session refresh.
  if (request.nextUrl.pathname === "/api/time") return response;
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return response;
  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          // Forward refreshed cookies together with the original CSP nonce.
          requestHeaders.set("cookie", request.cookies.toString());
          response = next();
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  await db.auth.getUser();
  return response;
}
export const config = {
  matcher: ["/:path*"],
};
