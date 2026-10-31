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

describe("order and payment screens with validated Supabase relationships", () => {
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
