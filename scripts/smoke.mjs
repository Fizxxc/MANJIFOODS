import assert from "node:assert/strict";
import http from "node:http";
import next from "next";
// Exercises a real production build in its honest unconfigured state, without a hosted backend.
if (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
  throw new Error(
    "Run this setup smoke check without Supabase env. Use staging for configured E2E.",
  );
const app = next({ dev: false, hostname: "127.0.0.1" });
await app.prepare();
const server = http.createServer(app.getRequestHandler());
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
process.env.NEXT_PUBLIC_APP_URL = origin;
let passed = 0;
try {
  for (const route of [
    "/menu",
    "/login",
    "/register",
    "/cart",
    "/checkout",
    "/orders",
    "/profile",
    "/admin",
    "/admin/settings",
  ]) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, route);
    assert.match(await response.text(), /Siapkan kantinmu/);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    passed++;
  }
  const missing = await fetch(origin + "/unknown-route");
  // App Router may already have streamed the loading shell when notFound() runs.
  assert.ok([200, 404].includes(missing.status));
  const missingHtml = await missing.text();
  assert.match(missingHtml, /Halaman tidak ditemukan/);
  assert.match(missingHtml, /name="robots" content="noindex"/);
  passed++;
  for (const route of [
    "/manifest.webmanifest",
    "/icons/icon.svg",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/sw.js",
  ]) {
    assert.equal((await fetch(origin + route)).status, 200, route);
    passed++;
  }
  const data = await fetch(origin + "/api/data");
  assert.equal(data.status, 503);
  assert.match((await data.json()).error, /belum dikonfigurasi/);
  passed++;
  const csrf = await fetch(origin + "/api/command", {
    method: "POST",
    headers: {
      origin: "https://evil.invalid",
      "content-type": "application/json",
    },
    body: '{"type":"read_notifications"}',
  });
  assert.equal(csrf.status, 403);
  passed++;
  console.log(
    `Production HTTP smoke: ${passed} checks passed. Hosted flows were not exercised.`,
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
  await app.close();
}
