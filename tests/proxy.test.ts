import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));
import { proxy } from "../src/proxy";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("actual proxy response headers", () => {
  it("overwrites attacker CSP headers, forwards its nonce and emits one enforced policy", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/login", {
        headers: {
          "content-security-policy": "script-src 'unsafe-eval'",
          "x-nonce": "attacker",
        },
      }),
    );
    const policy = response.headers.get("content-security-policy");
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).not.toMatch(/unsafe-eval|attacker|blob:/);
    expect(
      response.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(policy);
    const nonce = response.headers.get("x-middleware-request-x-nonce");
    expect(nonce).toBeTruthy();
    expect(policy).toContain(`'nonce-${nonce}'`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const second = await proxy(new NextRequest("http://localhost:3000/login"));
    expect(second.headers.get("x-middleware-request-x-nonce")).not.toBe(nonce);
  });

  it("keeps CSP and forwarded cookies when Supabase replaces the response during refresh", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://backend.example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
    mocks.createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        getUser: async () =>
          options.cookies.setAll([
            {
              name: "test-session",
              value: "refreshed",
              options: { httpOnly: true, path: "/" },
            },
          ]),
      },
    }));
    const response = await proxy(new NextRequest("http://localhost:3000/menu"));
    const policy = response.headers.get("content-security-policy");
    expect(policy).toContain("'nonce-");
    expect(
      response.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(policy);
    expect(response.cookies.get("test-session")?.value).toBe("refreshed");
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "test-session=refreshed",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("redirects legacy credential URLs before auth calls or page rendering", async () => {
    const response = await proxy(
      new NextRequest(
        "http://localhost:3000/login?email=a&password=b&error=link",
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=link",
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src",
    );
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("adds eval only for development response headers", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await proxy(
      new NextRequest("http://localhost:3000/login"),
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "'unsafe-eval'",
    );
  });

  it("covers static assets with CSP without disabling their cache or refreshing auth", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://backend.example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
    const response = await proxy(
      new NextRequest("http://localhost:3000/sw.js"),
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "worker-src 'self'",
    );
    expect(response.headers.has("cache-control")).toBe(false);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
  it("time synchronization retains CSP/no-store and never refreshes an auth session", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://backend.example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
    const response = await proxy(
      new NextRequest("http://localhost:3000/api/time"),
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "'nonce-",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
});
