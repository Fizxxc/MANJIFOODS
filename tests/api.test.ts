import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  identity: vi.fn(),
  serverClient: vi.fn(),
  signup: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  reset: vi.fn(),
  recover: vi.fn(),
}));
vi.mock("../src/lib/supabase/server", () => ({
  identity: mocks.identity,
  serverClient: mocks.serverClient,
}));
import { POST as command } from "../src/app/api/command/route";
import { POST as auth } from "../src/app/api/auth/route";
import { POST as upload } from "../src/app/api/upload/route";
import { POST as pickupPreview } from "../src/app/api/pickup-time/route";
import {
  assertOrigin,
  authThrottle,
  boundedBody,
  readJson,
} from "../src/lib/security";
const origin = "http://localhost:3000";
function request(body: unknown, from = origin) {
  return new Request(origin + "/api/command", {
    method: "POST",
    headers: { origin: from, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = origin;
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.identity.mockResolvedValue({
    db: { rpc: mocks.rpc },
    user: { id: crypto.randomUUID() },
    profile: { role: "student" },
  });
  mocks.serverClient.mockResolvedValue({
    auth: {
      signUp: mocks.signup,
      signInWithPassword: mocks.login,
      signOut: mocks.logout,
      updateUser: mocks.reset,
      resetPasswordForEmail: mocks.recover,
    },
  });
  mocks.signup.mockResolvedValue({ error: null });
  mocks.login.mockResolvedValue({ error: null });
  mocks.logout.mockResolvedValue({ error: null });
  mocks.recover.mockResolvedValue({ error: null });
  mocks.reset.mockResolvedValue({ error: null });
});
describe("HTTP command/auth boundary (mock transport, real validators)", () => {
  it.each(["session_start", "session_end"])(
    "%s requires admin and accepts no caller timestamps",
    async (type) => {
      const id = crypto.randomUUID();
      const res = await command(
        request({
          type,
          key: id,
          session: id,
          starts_at: "2099-01-01T00:00:00Z",
          ends_at: "2099-01-02T00:00:00Z",
          active: true,
        }),
      );
      expect(res.status).toBe(200);
      expect(mocks.identity).toHaveBeenCalledWith(true);
      expect(mocks.rpc).toHaveBeenLastCalledWith(
        type,
        type === "session_start" ? { p_key: id } : { p_session: id },
      );
      mocks.identity.mockRejectedValueOnce(new Error("ADMIN_REQUIRED"));
      expect(
        (await command(request({ type, key: id, session: id }))).status,
      ).toBe(403);
    },
  );
  it("rejects the obsolete date editor before any RPC", async () => {
    expect(
      (
        await command(
          request({
            type: "slot",
            id: null,
            data: { starts_at: "2030-01-01T00:00:00Z" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("pickup preview forwards only HH:mm and returns the authoritative server timestamp", async () => {
    const preview = {
      session_id: crypto.randomUUID(),
      pickup_at: "2030-01-01T17:05:00Z",
      server_now: "2030-01-01T16:55:00Z",
    };
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: preview, error: null });
    const res = await pickupPreview(
      request({
        time: "00:05",
        date: "2099-01-01",
        server_now: "2099-01-01T00:00:00Z",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(preview);
    expect(mocks.rpc).toHaveBeenLastCalledWith("pickup_time_preview", {
      p_time: "00:05",
    });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it.each(["24:00", "09:60", "09:30:00", "2030-01-01T09:30", "9:30", ""])(
    "rejects malformed pickup time %s before identity",
    async (time) => {
      expect((await pickupPreview(request({ time }))).status).toBe(400);
      expect(mocks.identity).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it("pickup preview rejects cross-origin and anonymous requests", async () => {
    expect(
      (await pickupPreview(request({ time: "09:30" }, "https://evil.invalid")))
        .status,
    ).toBe(403);
    mocks.identity.mockRejectedValueOnce(new Error("AUTH_REQUIRED"));
    expect((await pickupPreview(request({ time: "09:30" }))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  const credentials = {
    action: "login",
    email: "student@example.invalid",
    password: "test-password",
  };
  function formRequest(fields: Record<string, string>, from = origin) {
    return new Request(origin + "/api/auth", {
      method: "POST",
      headers: { origin: from, "x-forwarded-for": crypto.randomUUID() },
      body: new URLSearchParams(fields),
    });
  }
  it("JSON student login reads credentials only from the body and returns a safe destination", async () => {
    const res = await auth(request(credentials));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, destination: "/menu" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.login).toHaveBeenCalledWith({
      email: credentials.email,
      password: credentials.password,
    });
  });
  it.each(["student", "admin"])(
    "native POST login works without hydration for %s",
    async (role) => {
      mocks.identity.mockResolvedValue({ profile: { role } });
      const res = await auth(formRequest(credentials));
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(
        origin + (role === "admin" ? "/admin" : "/menu"),
      );
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(mocks.login).toHaveBeenCalledWith({
        email: credentials.email,
        password: credentials.password,
      });
    },
  );
  it("failed native login redirects with a fixed error code without echoing credentials", async () => {
    mocks.login.mockResolvedValue({ error: { message: "provider detail" } });
    const res = await auth(formRequest(credentials));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(origin + "/login?error=auth");
    expect(mocks.identity).not.toHaveBeenCalled();
  });
  it("native form submission still enforces the same origin boundary", async () => {
    const res = await auth(formRequest(credentials, "https://evil.invalid"));
    expect(res.status).toBe(403);
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it("rejects oversized native submissions before reaching Supabase", async () => {
    const res = await auth(
      formRequest({ ...credentials, password: "x".repeat(17000) }),
    );
    expect(res.status).toBe(303);
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it.each([
    ["register", "/register?success=auth"],
    ["forgot", "/forgot-password?success=auth"],
    ["logout", "/login"],
  ])(
    "keeps %s native submissions functional without putting fields in redirects",
    async (action, destination) => {
      const res = await auth(
        formRequest({
          ...credentials,
          action,
          name: "Student",
          class_name: "XI",
        }),
      );
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(origin + destination);
    },
  );
  it("sends an authenticated admin to the operational board after login", async () => {
    mocks.login.mockResolvedValue({ error: null });
    mocks.identity.mockResolvedValue({ profile: { role: "admin" } });
    const res = await auth(
      request({
        action: "login",
        email: "admin@example.invalid",
        password: "test-password",
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).destination).toBe("/admin");
  });
  it("rejects cross-origin before reading identity or touching database", async () => {
    const result = await command(
      request({ type: "read_notifications" }, "https://evil.invalid"),
    );
    expect(result.status).toBe(403);
    expect(mocks.identity).not.toHaveBeenCalled();
  });
  it("fails closed when app origin is missing or Origin is absent", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(() => assertOrigin(request({}))).toThrow("ORIGIN");
    process.env.NEXT_PUBLIC_APP_URL = origin;
    expect(() => assertOrigin(new Request(origin))).toThrow("ORIGIN");
  });
  it("rejects negative quantities and arbitrary paid status writes before RPC", async () => {
    for (const body of [
      {
        type: "cart",
        product: crypto.randomUUID(),
        variant: null,
        quantity: -1,
      },
      { type: "order", order: crypto.randomUUID(), action: "paid" },
    ])
      expect((await command(request(body))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("forwards IDs and quantity only; forged price is discarded", async () => {
    const product = crypto.randomUUID();
    const result = await command(
      request({
        type: "cart",
        product,
        variant: null,
        quantity: 2,
        price_idr: 1,
        student_id: crypto.randomUUID(),
      }),
    );
    expect(result.status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("set_cart_item", {
      p_product: product,
      p_variant: null,
      p_quantity: 2,
    });
  });
  it("checkout sends no trusted total or student ID and preserves idempotency key", async () => {
    const slot = crypto.randomUUID(),
      key = crypto.randomUUID();
    await command(
      request({
        type: "checkout",
        session: slot,
        pickup_time: "09:30",
        expected_pickup_at: "2030-01-01T02:30:00Z",
        key,
        method: "cash",
        note: "",
        total_idr: 1,
      }),
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith("checkout_session", {
      p_session: slot,
      p_pickup_time: "09:30",
      p_expected_pickup_at: "2030-01-01T02:30:00Z",
      p_method: "cash",
      p_key: key,
      p_note: "",
    });
  });
  it("checks admin identity for all catalog and settings changes", async () => {
    mocks.identity.mockRejectedValue(new Error("ADMIN_REQUIRED"));
    const result = await command(
      request({
        type: "category",
        id: null,
        data: { name: "Category", sort_order: 0, active: true },
      }),
    );
    expect(result.status).toBe(403);
    expect(mocks.identity).toHaveBeenCalledWith(true);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("enforces durable mutation throttle before command RPC", async () => {
    mocks.rpc.mockResolvedValueOnce({
      error: { message: "Terlalu banyak permintaan." },
    });
    const res = await command(request({ type: "read_notifications" }));
    expect(res.status).toBe(400);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not grant signup roles from input metadata", async () => {
    const res = await auth(
      request({
        action: "register",
        email: "test@example.invalid",
        password: "long-enough-secret",
        name: "Student",
        class_name: "XI",
        role: "admin",
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.signup).toHaveBeenCalledWith({
      email: "test@example.invalid",
      password: "long-enough-secret",
      options: {
        data: { full_name: "Student", class_name: "XI" },
        emailRedirectTo: origin + "/auth/callback",
      },
    });
  });
  it("proof upload rejects fake image content without sending it to storage", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(["<svg>not a PNG</svg>"], "fake.png", { type: "image/png" }),
    );
    form.set("order", crypto.randomUUID());
    const result = await upload(
      new Request(origin + "/api/upload", {
        method: "POST",
        headers: { origin },
        body: form,
      }),
    );
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({
      error: "Isi dan jenis berkas gambar tidak sesuai.",
    });
  });
  it("bounds request streams even when Content-Length is missing", async () => {
    await expect(
      boundedBody(
        new Request(origin, { method: "POST", body: "x".repeat(100) }),
        10,
      ),
    ).rejects.toThrow("besar");
    await expect(
      readJson(new Request(origin, { method: "POST", body: "not-json" })),
    ).rejects.toThrow("Format");
  });
  it("throttles repeated auth attempts locally", () => {
    const id = crypto.randomUUID();
    for (let n = 0; n < 12; n++) authThrottle(id);
    expect(() => authThrottle(id)).toThrow("Terlalu");
  });
});
