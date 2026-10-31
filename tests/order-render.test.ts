import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/orders",
}));
import { StudentScreens } from "../src/components/student-screens";
import { AdminScreens } from "../src/components/admin-screens";
import type { AppContext } from "../src/components/app";
import { parseDataResponse } from "../src/lib/order-response";
import { fixture } from "./ui/fixture";
import { orderPath, findOrder, orderLookup } from "../src/lib/order-links";
import { OrderStatus } from "../src/components/order-status";

describe("order and payment screens with validated Supabase relationships", () => {
  it("preserves UUID links, uses MF numbers for new links and removes the redundant ticket/session UI", () => {
    const data = fixture();
    const order = data.orders[0];
    expect(orderPath(order)).toBe("/orders/" + order.order_number);
    expect(orderPath(order, true)).toBe("/admin/orders/" + order.order_number);
    expect(findOrder(data.orders, order.id)).toBe(order);
    expect(findOrder(data.orders, order.order_number)).toBe(order);
    expect(orderLookup(orderPath(order, true))).toBe(order.order_number);
    const context: AppContext = {
      data,
      busy: false,
      run: vi.fn(),
      refresh: vi.fn(),
      upload: vi.fn(),
      page: 0,
      setPage: vi.fn(),
      queueTab: "pending",
      setQueueTab: vi.fn(),
    };
    for (const admin of [false, true]) {
      const html = renderToStaticMarkup(
        createElement(admin ? AdminScreens : StudentScreens, {
          context,
          path: orderPath(order, admin),
        }),
      );
      expect(html).toContain(order.order_number);
      expect(html).toContain("Jam pengambilan");
      expect(html).not.toMatch(
        /Tunjukkan kode|Kode pengambilan|ABCDEF1234|Durasi|Dimulai|Istirahat pengujian/,
      );
      expect(html).not.toContain('class="ticket-code"');
      expect(context.run).not.toHaveBeenCalled();
      if (admin) {
        const decision = html.slice(
          html.indexOf("Konfirmasi pesanan"),
          html.indexOf("Penerimaan tunai"),
        );
        expect(decision).not.toMatch(/Referensi|type="checkbox"/);
        expect(decision).toContain("Tolak pesanan");
      }
    }
    const board = renderToStaticMarkup(
      createElement(AdminScreens, { context, path: "/admin" }),
    );
    expect(board).toContain("Buka pesanan");
    expect(board).not.toContain("Terima pesanan");
  });
  it.each([
    "pending",
    "confirmed",
    "rejected",
    "preparing",
    "ready",
    "completed",
  ])("renders the %s Lucide status state", (status) => {
    const raw = fixture();
    const events = [
      { ...raw.events[0], event_type: "reject", note: "Menu hari ini habis" },
    ];
    const html = renderToStaticMarkup(
      createElement(OrderStatus, { status, events, detail: true }),
    );
    expect(html).toContain("status-" + status);
    expect(html).toContain("lucide-");
    if (status === "rejected") expect(html).toContain("Menu hari ini habis");
  });
  it("renders clickable private proof thumbnails independently of payment verification", () => {
    const data = fixture(true);
    data.proofs = [
      {
        id: "aaaa1111-1111-4111-8111-111111111111",
        payment_id: data.orders[0].payments[0].id,
        storage_path: "private/not-exposed.png",
      },
    ];
    const context: AppContext = {
      data,
      busy: false,
      run: vi.fn(),
      refresh: vi.fn(),
      upload: vi.fn(),
      page: 0,
      setPage: vi.fn(),
      queueTab: "pending",
      setQueueTab: vi.fn(),
    };
    const html = renderToStaticMarkup(
      createElement(AdminScreens, {
        context,
        path: orderPath(data.orders[0], true),
      }),
    );
    expect(html).toContain("Pratinjau bukti transfer");
    expect(html).toContain("/api/upload?proof=");
    expect(html).toContain("Buka bukti 1");
    expect(html).not.toContain("private/not-exposed.png");
    expect(context.run).not.toHaveBeenCalled();
  });
  it.each(["paid", "refunded"])(
    "never prompts a %s QRIS order to pay again",
    (status) => {
      const raw = fixture();
      const data = parseDataResponse({
        ...raw,
        orders: [
          {
            ...raw.orders[0],
            payment_method: "qris_static",
            payments: {
              ...raw.orders[0].payments[0],
              method: "qris_static",
              status,
            },
          },
        ],
      });
      const context: AppContext = {
        data,
        busy: false,
        run: vi.fn(),
        refresh: vi.fn(),
        upload: vi.fn(),
        page: 0,
        setPage: vi.fn(),
        queueTab: "pending",
        setQueueTab: vi.fn(),
      };
      const html = renderToStaticMarkup(
        createElement(StudentScreens, {
          context,
          path: "/orders/" + data.orders[0].id,
        }),
      );
      expect(html).not.toContain("Bayar dengan QRIS");
      expect(html).not.toContain("Sudah bayar");
    },
  );
  it.each(["object", "array", "null"])(
    "renders student details, waiting/history and admin queue/verification for %s",
    (shape) => {
      for (const admin of [false, true]) {
        const raw = fixture(admin);
        const payment = {
          ...raw.orders[0].payments[0],
          method: "qris_static",
          status: "pending_verification",
        };
        const order = {
          ...raw.orders[0],
          payment_method: "qris_static",
          payments:
            shape === "object" ? payment : shape === "array" ? [payment] : null,
        };
        const data = parseDataResponse({
          ...raw,
          orders: [order],
          unacknowledgedOrders: admin ? [order] : [],
        });
        const context: AppContext = {
          data,
          busy: false,
          run: vi.fn(),
          refresh: vi.fn(),
          upload: vi.fn(),
          page: 0,
          setPage: vi.fn(),
          queueTab: "pending",
          setQueueTab: vi.fn(),
        };
        const paths = admin
          ? ["/admin", "/admin/payments", "/admin/orders/" + order.id]
          : ["/orders", "/orders/" + order.id, "/pay/" + order.id];
        for (const path of paths) {
          const html = renderToStaticMarkup(
            createElement(admin ? AdminScreens : StudentScreens, {
              context,
              path,
            }),
          );
          if (path === "/admin/payments" && shape === "null") {
            expect(html).toContain("Tidak ada pembayaran pada halaman ini");
            continue;
          }
          expect(html).toContain(order.order_number);
          expect(html).toContain("12.000");
          expect(html).not.toContain('name="qris"');
          if (shape === "null") {
            expect(html).toContain("Data pembayaran belum tersedia");
            expect(html).not.toContain("Belum dibayar");
            expect(html).not.toContain("Verifikasi pembayaran QRIS");
            expect(html).not.toContain("Sudah bayar");
          }
          if (!admin && shape !== "null" && path !== "/orders") {
            expect(html).toContain("Pindai QRIS merchant");
            expect(html).toContain("tidak memuat nominal pesanan");
            expect(html).toContain("Salin nominal");
          }
        }
      }
    },
  );
});
