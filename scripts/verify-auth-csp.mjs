import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import http from "node:http";
import next from "next";

// Real compiled Next HTTP routes + real Supabase SSR SDK, with an isolated
// provider fixture. No credentials or requests are sent to a hosted provider.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://fixture.example.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "fixture-public-key";
const providerOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
const configuredOrigin = new URL(
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
).origin;
const transportFetch = globalThis.fetch;
const users = new Map();
const tokenUsers = new Map();
const calls = [];
let localOrigin;
let paymentShape = "object";
let dataFailure = false;
const orderId = "77777777-7777-4777-8777-777777777777";
const paymentFixture = {
  id: "66666666-6666-4666-8666-666666666666",
  method: "qris_static",
  status: "pending_verification",
  amount_idr: 12000,
  merchant_reference: null,
  admin_note: null,
  verified_at: null,
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (url.origin === localOrigin) return transportFetch(input, init);
  assert.equal(
    url.origin,
    providerOrigin,
    "Unexpected outbound network request blocked",
  );
  calls.push(url.pathname);
  const headers = new Headers(
    init?.headers || (input instanceof Request ? input.headers : undefined),
  );
  if (url.pathname === "/auth/v1/token") {
    const body = JSON.parse(init.body);
    if (body.password !== "verification-only-password") {
      return json(
        { code: "invalid_credentials", message: "Invalid credentials" },
        400,
      );
    }
    assert.ok(
      ["student@example.invalid", "admin@example.invalid"].includes(body.email),
    );
    const role = body.email.startsWith("admin") ? "admin" : "student";
    const user = {
      id:
        role === "admin"
          ? "22222222-2222-4222-8222-222222222222"
          : "11111111-1111-4111-8111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: body.email,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
    };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const encode = (value) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: expires, role: "authenticated" })}.fixture-signature`;
    users.set(user.id, { user, role });
    tokenUsers.set(token, user);
    return json({
      access_token: token,
      refresh_token: "verification-only-refresh",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: expires,
      user,
    });
  }
  const token = headers.get("authorization")?.replace(/^Bearer /, "");
  const user = tokenUsers.get(token);
  if (url.pathname === "/auth/v1/user") {
    return user ? json(user) : json({ message: "Unauthorized" }, 401);
  }
  if (url.pathname === "/auth/v1/logout") return json({});
  if (url.pathname === "/rest/v1/profiles" && user) {
    return json({
      id: user.id,
      role: users.get(user.id).role,
      full_name: "Verification fixture",
      class_name: "XI",
      notifications_enabled: false,
    });
  }
  if (
    url.pathname.startsWith("/rest/v1/") &&
    user &&
    [
      "categories",
      "products",
      "product_variants",
      "pickup_slots",
      "cart_items",
      "orders",
      "notifications",
      "app_settings",
      "pickup_tickets",
      "order_events",
      "payment_proofs",
    ].includes(url.pathname.split("/").at(-1))
  ) {
    const table = url.pathname.split("/").at(-1);
    if (dataFailure && table === "orders")
      return json({ message: "private SQL connection detail" }, 500);
    if (table === "orders") {
      if (users.get(user.id).role === "student")
        assert.equal(url.searchParams.get("student_id"), "eq." + user.id);
      const order = {
        id: orderId,
        order_number: "MF-HTTP-TEST",
        student_id: "11111111-1111-4111-8111-111111111111",
        pickup_slot_id: "55555555-5555-4555-8555-555555555555",
        pickup_at: "2030-01-01T17:05:00Z",
        status: "pending",
        payment_method: "qris_static",
        total_idr: 12000,
        created_at: "2030-01-01T16:55:00Z",
        updated_at: "2030-01-01T16:55:00Z",
        customer_note: null,
        acknowledged_at: null,
        order_items: [],
        payments:
          paymentShape === "null"
            ? null
            : paymentShape === "array"
              ? [paymentFixture]
              : paymentShape === "invalid"
                ? "bad"
                : paymentFixture,
      };
      return json(
        url.searchParams.get("id") &&
          url.searchParams.get("id") !== "eq." + orderId
          ? []
          : [order],
      );
    }
    if (table === "app_settings")
      return json({
        value: {
          open: true,
          pickup_location: "HTTP test only",
          hours: "",
          qris_payload: "",
        },
      });
    if (table === "pickup_slots")
      return json([
        {
          id: "55555555-5555-4555-8555-555555555555",
          title: "HTTP test session",
          starts_at: "2030-01-01T16:00:00Z",
          ends_at: null,
          session_mode: "manual",
          active: true,
          reserved_count: 1,
        },
      ]);
    if (table === "payment_proofs")
      assert.equal(
        url.searchParams.get("payment_id"),
        "in.(" + paymentFixture.id + ")",
      );
    return json([]);
  }
  if (url.pathname === "/rest/v1/rpc/admin_queue_counts" && user) {
    assert.equal(users.get(user.id).role, "admin");
    return json({ pending: 1 });
  }
  if (url.pathname === "/rest/v1/rpc/consume_rate_limit" && user)
    return json(null);
  if (url.pathname === "/rest/v1/rpc/pickup_time_preview" && user) {
    assert.deepEqual(JSON.parse(init.body), { p_time: "00:05" });
    return json({
      session_id: "55555555-5555-4555-8555-555555555555",
      pickup_at: "2030-01-01T17:05:00Z",
      server_now: "2030-01-01T16:55:00Z",
    });
  }
  if (url.pathname === "/rest/v1/rpc/session_start" && user) {
    assert.equal(users.get(user.id).role, "admin");
    assert.deepEqual(Object.keys(JSON.parse(init.body)), ["p_key"]);
    return json("55555555-5555-4555-8555-555555555555");
  }
  if (url.pathname === "/rest/v1/rpc/session_end" && user) {
    assert.equal(users.get(user.id).role, "admin");
    assert.deepEqual(JSON.parse(init.body), {
      p_session: "55555555-5555-4555-8555-555555555555",
    });
    return json("55555555-5555-4555-8555-555555555555");
  }
  throw new Error(`Unexpected provider fixture path: ${url.pathname}`);
};

const app = next({ dev: false, hostname: "127.0.0.1" });
let server;
let passed = 0;
let failure;
try {
  await app.prepare();
  server = http.createServer(app.getRequestHandler());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  localOrigin = `http://127.0.0.1:${server.address().port}`;
  const send = (path, init) =>
    transportFetch(localOrigin + path, { redirect: "manual", ...init });
  const beforeTime = Date.now();
  const timeResponse = await send("/api/time");
  assert.equal(timeResponse.status, 200);
  assert.match(timeResponse.headers.get("cache-control"), /no-store/);
  const { serverTime } = await timeResponse.json();
  assert.ok(
    Number.isSafeInteger(serverTime) &&
      serverTime >= beforeTime &&
      serverTime <= Date.now(),
  );
  assert.equal(calls.length, 0, "Public clock must not call Supabase");
  passed++;
  let previousNonce;
  for (const path of [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/unknown-route",
  ]) {
    const response = await send(path);
    assert.ok([200, 404].includes(response.status));
    const csp = response.headers.get("content-security-policy");
    assert.ok(csp, "Enforced CSP header missing");
    assert.doesNotMatch(csp, /unsafe-eval|blob:|,/);
    assert.match(csp, /worker-src 'self'(?:;|$)/);
    const scripts = csp
      .split("; ")
      .find((directive) => directive.startsWith("script-src "));
    assert.doesNotMatch(scripts, /unsafe-inline/);
    const nonce = /'nonce-([^']+)'/.exec(scripts)?.[1];
    assert.ok(nonce);
    assert.notEqual(nonce, previousNonce);
    previousNonce = nonce;
    const html = await response.text();
    const tags = [...html.matchAll(/<script\b[^>]*>/g)].map(
      (match) => match[0],
    );
    assert.ok(tags.length > 0);
    for (const tag of tags)
      assert.ok(
        tag.includes(`nonce="${nonce}"`),
        "Hydration script nonce does not match response CSP",
      );
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    if (path !== "/unknown-route") {
      const form = /<form\b[^>]*>/.exec(html)?.[0] || "";
      assert.match(form, /method="post"/);
      assert.match(form, /action="\/api\/auth"/);
      assert.match(html, /name="action"/);
    }
    passed++;
  }
  const clean = await send(
    "/login?email=legacy%40example.invalid&password=verification-only-secret&error=link",
  );
  assert.equal(clean.status, 303);
  assert.equal(
    new URL(clean.headers.get("location"), localOrigin).search,
    "?error=link",
  );
  passed++;

  for (const path of ["/sw.js", "/icons/icon.svg", "/icons/missing-icon"]) {
    const response = await send(path);
    assert.ok(
      response.headers.get("content-security-policy"),
      "CSP missing on asset or asset-prefix error response",
    );
    if (path === "/icons/icon.svg")
      assert.doesNotMatch(
        response.headers.get("cache-control") || "",
        /private, no-store/,
      );
    passed++;
  }

  const callsBeforeCsrf = calls.length;
  const csrf = await send("/api/auth", {
    method: "POST",
    headers: {
      origin: "https://evil.invalid",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "login",
      email: "student@example.invalid",
      password: "verification-only-password",
    }),
  });
  assert.equal(csrf.status, 403);
  assert.equal(calls.length, callsBeforeCsrf);
  passed++;

  for (const role of ["student", "admin"]) {
    for (const native of [false, true]) {
      const body = {
        action: "login",
        email: `${role}@example.invalid`,
        password: "verification-only-password",
      };
      const response = await send("/api/auth", {
        method: "POST",
        headers: {
          origin: configuredOrigin,
          "content-type": native
            ? "application/x-www-form-urlencoded"
            : "application/json",
        },
        body: native ? new URLSearchParams(body) : JSON.stringify(body),
      });
      const destination = role === "admin" ? "/admin" : "/menu";
      if (native) {
        assert.equal(response.status, 303);
        assert.equal(
          new URL(response.headers.get("location"), localOrigin).pathname,
          destination,
        );
        assert.equal(
          new URL(response.headers.get("location"), localOrigin).search,
          "",
        );
      } else {
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { ok: true, destination });
      }
      const cookies = response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; ");
      assert.match(cookies, /auth-token/);
      const landing = await send(destination, { headers: { cookie: cookies } });
      assert.equal(landing.status, 200);
      const landingHtml = await landing.text();
      assert.match(landingHtml, /Verification fixture/);
      assert.match(landingHtml, /--:--:--/);
      assert.match(landingHtml, /aria-label="Waktu WIB"/);
      if (!native) {
        for (const shape of ["object", "array", "null"]) {
          paymentShape = shape;
          const detail = await send(`/api/data?page=0&order=${orderId}`, {
            headers: { cookie: cookies },
          });
          assert.equal(detail.status, 200);
          assert.match(detail.headers.get("cache-control"), /no-store/);
          const data = await detail.json();
          assert.deepEqual(
            data.orders[0].payments,
            shape === "null" ? [] : [paymentFixture],
          );
          if (role === "admin")
            assert.deepEqual(
              data.unacknowledgedOrders[0].payments,
              data.orders[0].payments,
            );
          passed++;
        }
        for (const query of [
          "page=-1",
          "order=invalid",
          "page=0&page=1",
          "active=9",
        ]) {
          const invalidData = await send("/api/data?" + query, {
            headers: { cookie: cookies },
          });
          assert.equal(invalidData.status, 400);
          assert.equal((await invalidData.json()).code, "INVALID_QUERY");
          passed++;
        }
        const absent = await send(
          "/api/data?order=88888888-8888-4888-8888-888888888888",
          { headers: { cookie: cookies } },
        );
        assert.equal(absent.status, 404);
        passed++;
        for (const fail of ["provider", "shape"]) {
          dataFailure = fail === "provider";
          paymentShape = "invalid";
          const unavailable = await send("/api/data?page=0", {
            headers: { cookie: cookies },
          });
          assert.equal(unavailable.status, 503);
          const error = await unavailable.text();
          assert.doesNotMatch(error, /SQL|payments|\.map|Zod/);
          passed++;
        }
        dataFailure = false;
        paymentShape = "object";
        const report = await send("/api/reports?day=2030-01-01", {
          headers: { cookie: cookies },
        });
        assert.equal(report.status, role === "admin" ? 200 : 403);
        if (role === "admin")
          assert.match(await report.text(), /pending_verification/);
        passed++;
        const post = (path, body) =>
          send(path, {
            method: "POST",
            headers: {
              origin: configuredOrigin,
              cookie: cookies,
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          });
        const pickup = await post("/api/pickup-time", {
          time: "00:05",
          date: "2099-01-01",
        });
        assert.equal(pickup.status, 200);
        assert.equal((await pickup.json()).pickup_at, "2030-01-01T17:05:00Z");
        assert.match(pickup.headers.get("cache-control"), /no-store/);
        passed++;
        const invalid = await post("/api/pickup-time", {
          time: "2030-01-01T00:05",
        });
        assert.equal(invalid.status, 400);
        passed++;
        for (const type of ["session_start", "session_end"]) {
          const lifecycle = await post("/api/command", {
            type,
            key: crypto.randomUUID(),
            session: "55555555-5555-4555-8555-555555555555",
            starts_at: "2099-01-01T00:00:00Z",
          });
          assert.equal(lifecycle.status, role === "admin" ? 200 : 403);
          passed++;
        }
      }
      const logout = await send("/api/auth", {
        method: "POST",
        headers: {
          origin: configuredOrigin,
          cookie: cookies,
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "logout" }),
      });
      assert.equal(logout.status, 200);
      assert.ok(
        logout.headers
          .getSetCookie()
          .some((cookie) => /Max-Age=0/i.test(cookie)),
      );
      passed++;
    }
  }
  for (const native of [false, true]) {
    const body = {
      action: "login",
      email: "student@example.invalid",
      password: "verification-only-invalid",
    };
    const response = await send("/api/auth", {
      method: "POST",
      headers: {
        origin: configuredOrigin,
        "content-type": native
          ? "application/x-www-form-urlencoded"
          : "application/json",
      },
      body: native ? new URLSearchParams(body) : JSON.stringify(body),
    });
    assert.equal(response.status, native ? 303 : 400);
    if (native)
      assert.equal(
        new URL(response.headers.get("location"), localOrigin).search,
        "?error=auth",
      );
    else assert.match((await response.json()).error, /Email atau kata sandi/);
    assert.equal(response.headers.getSetCookie().length, 0);
    passed++;
  }
  assert.ok(
    calls.includes("/auth/v1/token") &&
      calls.includes("/auth/v1/user") &&
      calls.includes("/rest/v1/profiles"),
  );
  console.log(
    `Production auth/CSP/orders HTTP: ${passed} scenarios passed (real Next + SSR SDK; provider fixture, no hosted auth).`,
  );
} catch (error) {
  failure = error;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await app.close();
  globalThis.fetch = transportFetch;
}
if (failure) {
  console.error(
    `Production auth/CSP check failed: ${failure.message.slice(0, 1000)}`,
  );
  console.error(failure.stack?.split("\n").slice(1, 7).join("\n"));
  process.exitCode = 1;
}
