import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixture } from "./ui/fixture";
const mocks = vi.hoisted(() => ({ identity: vi.fn() }));
vi.mock("../src/lib/supabase/server", () => ({ identity: mocks.identity }));
import { GET } from "../src/app/api/data/route";
import { GET as reports } from "../src/app/api/reports/route";
import {
  normalizeOrders,
  normalizePayments,
  parseDataResponse,
  parseDataQuery,
} from "../src/lib/order-response";
import type { Payment } from "../src/lib/domain";

const calls: { table: string; method: string; args: unknown[] }[] = [];
let source: Record<string, unknown>;
let failure: string | undefined;
function transport(table: string) {
  const query: Record<string, unknown> = {};
  for (const method of [
    "select",
    "eq",
    "order",
    "range",
    "in",
    "is",
    "not",
    "limit",
    "single",
    "gte",
    "lt",
  ])
    query[method] = (...args: unknown[]) => {
      calls.push({ table, method, args });
      return query;
    };
  query.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({
      data: source[table],
      error:
        failure === table
          ? { message: "secret SQL provider diagnostic" }
          : null,
      count: table === "orders" ? 1 : undefined,
    }).then(resolve);
  return query;
}
beforeEach(() => {
  calls.length = 0;
  failure = undefined;
  const data = fixture();
  // Real PostgREST shape: UNIQUE(payments.order_id) embeds an OBJECT.
  source = {
    categories: data.categories,
    products: data.products,
    product_variants: data.variants,
    pickup_slots: data.sessions,
    cart_items: data.cart,
    orders: data.orders.map((o) => ({ ...o, payments: o.payments[0] })),
    notifications: data.notifications,
    app_settings: { value: data.settings },
    pickup_tickets: data.tickets,
    order_events: data.events,
    payment_proofs: [],
  };
  mocks.identity.mockResolvedValue({
    db: {
      from: transport,
      rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
    user: { id: data.profile.id, email: data.email },
    profile: data.profile,
  });
});
describe("production order response regression", () => {
  it("finds a unique MF order number without changing ownership, ID or payment", async () => {
    const number = fixture().orders[0].order_number;
    const res = await GET(
      new Request("http://localhost/api/data?page=3&number=" + number),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.orders[0].id).toBe(fixture().orders[0].id);
    expect(data.tickets).toEqual([]);
    expect(calls).toContainEqual({
      table: "orders",
      method: "eq",
      args: ["order_number", number],
    });
    expect(
      calls.some((c) => c.table === "orders" && c.method === "range"),
    ).toBe(false);
    expect(calls.some((c) => c.table === "pickup_tickets")).toBe(false);
  });
  it.each([
    "number=MF-invalid",
    "number=MF-20261031-000001&number=MF-20261031-000002",
    "order=77777777-7777-4777-8777-777777777777&number=MF-20261031-000001",
  ])("rejects ambiguous/invalid MF lookup %s", async (query) => {
    expect(
      (await GET(new Request("http://localhost/api/data?" + query))).status,
    ).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("loads page=0&order with a PostgREST payment object", async () => {
    const res = await GET(
      new Request(
        "http://localhost/api/data?page=0&order=77777777-7777-4777-8777-777777777777",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orders[0].payments).toEqual([fixture().orders[0].payments[0]]);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(calls).toContainEqual({
      table: "orders",
      method: "eq",
      args: ["student_id", fixture().profile.id],
    });
    expect(calls).toContainEqual({
      table: "payment_proofs",
      method: "in",
      args: ["payment_id", ["payment"]],
    });
  });
  it.each(["object", "array", "null", "missing"])(
    "normalizes %s payment embeds for students and admins",
    async (shape) => {
      const pay = fixture().orders[0].payments[0];
      source.orders = [
        {
          ...fixture().orders[0],
          payments:
            shape === "object"
              ? pay
              : shape === "array"
                ? [pay]
                : shape === "null"
                  ? null
                  : undefined,
        },
      ];
      for (const role of ["student", "admin"]) {
        calls.length = 0;
        const data = fixture(role === "admin");
        mocks.identity.mockResolvedValue({
          db: {
            from: transport,
            rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
          },
          user: { id: data.profile.id, email: data.email },
          profile: data.profile,
        });
        const res = await GET(
          new Request(
            "http://localhost/api/data?page=0&active=1&group=pending",
          ),
        );
        expect(res.status).toBe(200);
        const json = await res.json();
        const expected = shape === "object" || shape === "array" ? [pay] : [];
        expect(json.orders[0].payments).toEqual(expected);
        expect(json.unacknowledgedOrders).toEqual(
          role === "admin" ? json.orders : [],
        );
        expect(calls.some((c) => c.table === "payment_proofs")).toBe(
          expected.length > 0,
        );
        expect(
          calls.some(
            (c) =>
              c.table === "orders" &&
              c.method === "eq" &&
              c.args[0] === "student_id",
          ),
        ).toBe(role === "student");
      }
    },
  );
  it.each([
    {},
    "paid",
    7,
    true,
    [null],
    { ...fixture().orders[0].payments[0], amount_idr: "12000" },
    { ...fixture().orders[0].payments[0], status: "surprise" },
    [fixture().orders[0].payments[0], fixture().orders[0].payments[0]],
  ])(
    "rejects malformed payments without leaking diagnostics: %j",
    async (value) => {
      source.orders = [{ ...fixture().orders[0], payments: value }];
      const res = await GET(new Request("http://localhost/api/data?page=0"));
      expect(res.status).toBe(503);
      const body = await res.text();
      expect(body).toContain("DATA_UNAVAILABLE");
      expect(body).not.toMatch(/Zod|expected|secret|payments|\.map/);
    },
  );
  it.each([
    "page=-1",
    "page=1.5",
    "page=oops",
    "page=Infinity",
    "page=10001",
    "page=",
    "page=0&page=1",
    "order=",
    "order=bad",
    "active=2",
    "group=paid",
  ])("rejects invalid query %s as 400", async (query) => {
    const res = await GET(new Request("http://localhost/api/data?" + query));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_QUERY");
    expect(calls).toHaveLength(0);
  });
  it("parses zero and defaults, and ignores pagination on explicit order detail", async () => {
    expect(parseDataQuery(new URLSearchParams())).toEqual({ page: 0 });
    expect(parseDataQuery(new URLSearchParams("page=10000"))).toEqual({
      page: 10000,
    });
    expect(
      (
        await GET(
          new Request(
            "http://localhost/api/data?page=1&order=77777777-7777-4777-8777-777777777777",
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      calls.some((c) => c.table === "orders" && c.method === "range"),
    ).toBe(false);
  });
  it("returns the same 404 for missing and RLS-hidden orders", async () => {
    source.orders = [];
    const res = await GET(
      new Request(
        "http://localhost/api/data?order=77777777-7777-4777-8777-777777777777",
      ),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("ORDER_NOT_FOUND");
  });
  it("rejects anonymous reads and private provider failures safely", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("AUTH_REQUIRED"));
    expect((await GET(new Request("http://localhost/api/data"))).status).toBe(
      401,
    );
    failure = "orders";
    const res = await GET(new Request("http://localhost/api/data"));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("secret SQL");
    mocks.identity.mockRejectedValueOnce(new Error("secret internal token"));
    expect(
      await (await GET(new Request("http://localhost/api/data"))).text(),
    ).not.toContain("secret");
  });
  it("CSV reads the same normalized payment and retains paid revenue", async () => {
    source.orders = [
      {
        ...fixture().orders[0],
        payments: {
          ...fixture().orders[0].payments[0],
          status: "paid",
          merchant_reference: "REF-TEST",
        },
      },
    ];
    const res = await reports(
      new Request("http://localhost/api/reports?day=2026-10-31"),
    );
    expect(mocks.identity).toHaveBeenCalledWith(true);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"paid","12000","12000","REF-TEST"');
  });
  it("CSV missing payment does not invent unpaid or paid status", async () => {
    source.orders = [{ ...fixture().orders[0], payments: null }];
    const res = await reports(
      new Request("http://localhost/api/reports?day=2026-10-31"),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"cash","","12000","0",""');
    mocks.identity.mockRejectedValueOnce(new Error("ADMIN_REQUIRED"));
    expect(
      (
        await reports(
          new Request("http://localhost/api/reports?day=2026-10-31"),
        )
      ).status,
    ).toBe(403);
  });
});

describe("validated read model protects React and financial state", () => {
  it.each(["unpaid", "pending_verification", "paid", "rejected", "refunded"])(
    "preserves %s verbatim without mutation",
    (status) => {
      const raw = Object.freeze({ ...fixture().orders[0].payments[0], status });
      expect(normalizePayments(raw)).toEqual([raw]);
      expect(normalizePayments([raw])).toEqual([raw]);
      expect(raw.status).toBe(status);
    },
  );
  it("handles missing relationships and nullable SQL fields explicitly", () => {
    const value = {
      ...fixture().orders[0],
      customer_note: null,
      payments: null,
    };
    expect(normalizeOrders([value])[0]).toMatchObject({
      customer_note: "",
      payments: [],
    });
    expect(normalizePayments(undefined)).toEqual([]);
  });
  it("fails closed for amount/method mismatches and malformed root arrays", () => {
    const data = fixture();
    expect(() =>
      normalizeOrders([
        {
          ...data.orders[0],
          payments: { ...data.orders[0].payments[0], amount_idr: 1 },
        },
      ]),
    ).toThrow();
    expect(() =>
      normalizeOrders([
        {
          ...data.orders[0],
          payments: { ...data.orders[0].payments[0], method: "qris_static" },
        },
      ]),
    ).toThrow();
    for (const key of [
      "orders",
      "unacknowledgedOrders",
      "cart",
      "events",
      "proofs",
      "products",
    ])
      expect(() => parseDataResponse({ ...data, [key]: {} })).toThrow(
        "Format data",
      );
    expect(parseDataResponse(data)).toEqual(data);
  });
  it("strips private payment columns from serialized output", () => {
    const pay = fixture().orders[0].payments[0];
    const result: Payment[] = normalizePayments({
      ...pay,
      verified_by: "private-actor",
      extra: "not-in-contract",
    });
    expect(result[0]).toEqual(pay);
  });
});
