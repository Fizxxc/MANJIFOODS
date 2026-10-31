import { test, expect } from "@playwright/test";
import { fixture } from "./ui/fixture";
const widths = [320, 360, 375, 390, 430, 768, 1024, 1440];
const routes = [
  "/menu",
  "/menu/menu-pengujian",
  "/cart",
  "/checkout",
  "/orders",
  "/orders/77777777-7777-4777-8777-777777777777",
  "/profile",
  "/profile/edit",
  "/notifications",
  "/about",
  "/admin",
  "/admin/products",
  "/admin/categories",
  "/admin/payments",
  "/admin/sessions",
  "/admin/reports",
  "/admin/settings",
  "/admin/orders/77777777-7777-4777-8777-777777777777",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];
test.beforeEach(async ({ page }) => {
  await page.route("**/api/data?*", (r) =>
    r.fulfill({ json: fixture(r.request().frame().url().includes("/admin")) }),
  );
  await page.route("**/api/command", (r) =>
    r.fulfill({ json: { ok: true, data: null } }),
  );
});
test.describe("server-synchronized WIB clock", () => {
  test.use({ timezoneId: "America/Los_Angeles" });
  test("student/admin clocks tick locally without a per-second time request", async ({
    page,
  }) => {
    let requests = 0;
    await page.route("**/api/time", (route) => {
      requests++;
      return route.fulfill({
        json: { serverTime: Date.parse("2026-10-30T02:30:00Z") },
      });
    });
    for (const path of ["/menu", "/admin"]) {
      await page.goto(path);
      const clock = page.getByRole("timer", { name: "Waktu WIB" });
      await expect(clock).toHaveText(/09:30:\d{2} WIB/);
      const text = await clock.textContent();
      await expect
        .poll(() => clock.textContent(), { timeout: 4000 })
        .not.toBe(text);
    }
    expect(requests).toBe(2);
  });

  test("pickup is HH:mm only and uses the server preview", async ({ page }) => {
    const data = fixture();
    await page.route("**/api/pickup-time", (route) =>
      route.fulfill({
        json: {
          session_id: data.sessions[0].id,
          pickup_at: "2030-10-30T17:05:00Z",
          server_now: new Date().toISOString(),
        },
      }),
    );
    await page.goto("/checkout");
    await page.getByLabel("Jam pengambilan (WIB)").fill("00:05");
    await expect(page.getByText(/Pengambilan:/)).toContainText("00:05:00 WIB");
    await expect(
      page.getByRole("button", { name: "Pesan sekarang", exact: true }),
    ).toBeEnabled();
    await expect(
      page.locator('input[type="date"], input[type="datetime-local"]'),
    ).toHaveCount(0);
  });
  test("admin session page only starts and ends sessions", async ({ page }) => {
    const data = fixture(true);
    let last: { type: string } | undefined;
    await page.route("**/api/data?*", (route) => route.fulfill({ json: data }));
    await page.route("**/api/command", (route) => {
      last = route.request().postDataJSON();
      if (last?.type === "session_end") {
        data.sessions[0].ends_at = new Date().toISOString();
        data.sessions[0].active = false;
      }
      return route.fulfill({ json: { ok: true, data: data.sessions[0].id } });
    });
    await page.goto("/admin/sessions");
    await expect(
      page.locator(
        'input[type="date"], input[type="datetime-local"], input[type="checkbox"]',
      ),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Akhiri sesi", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Mulai sesi", exact: true }),
    ).toBeVisible();
    expect(last?.type).toBe("session_end");
  });
});
for (const width of widths)
  test(`responsive screens at ${width}px (fixture UI)`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await expect(
        page.getByRole("button", { name: "Tutup pesan" }),
      ).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
test("search, filters, sold-out and quantity controls", async ({ page }) => {
  await page.goto("/menu");
  await page.getByRole("searchbox").fill("tidak-ada");
  await expect(page.getByText("Menu tidak ditemukan")).toBeVisible();
  await page.getByRole("searchbox").clear();
  await page
    .getByRole("link", { name: "Pilih Menu pengujian antarmuka" })
    .click();
  await page.getByRole("button", { name: "Tambah jumlah" }).click();
  await expect(page.getByLabel("Jumlah", { exact: true })).toHaveText("2");
  await expect(page.getByRole("button", { name: /Tambah ·/ })).toContainText(
    "24.000",
  );
});
test("admin product, category and session forms are available", async ({
  page,
}) => {
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "Tambah menu", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Nama menu", exact: true }),
  ).toBeVisible();
  await page.goto("/admin/categories");
  await page
    .getByRole("button", { name: "Tambah kategori", exact: true })
    .click();
  await expect(page.getByLabel("Nama kategori")).toBeVisible();
  await page.goto("/admin/sessions");
  await expect(
    page.getByRole("button", { name: "Akhiri sesi", exact: true }),
  ).toBeVisible();
});
test("keyboard focus and checkout required fields", async ({ page }) => {
  await page.goto("/checkout");
  await expect(
    page.getByRole("button", { name: "Pesan sekarang" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Jam pengambilan (WIB)")).toHaveAttribute(
    "required",
    "",
  );
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Kembali" })).toBeFocused();
});
test("network failure exposes retry", async ({ page }) => {
  await page.route("**/api/data?*", (r) =>
    r.fulfill({ status: 503, json: { error: "Koneksi pengujian terputus." } }),
  );
  await page.goto("/menu");
  await expect(page.getByRole("alert")).toContainText(
    "Koneksi pengujian terputus.",
  );
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
});
