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

  test("expires a selected pickup slot and disables checkout without refreshing", async ({
    page,
  }) => {
    const base = Date.now();
    const data = fixture();
    data.slots[0].cutoff_at = new Date(base + 4000).toISOString();
    let commands = 0;
    await page.route("**/api/data?*", (route) => route.fulfill({ json: data }));
    await page.route("**/api/time", (route) =>
      route.fulfill({ json: { serverTime: base } }),
    );
    await page.route("**/api/command", (route) => {
      commands++;
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto("/checkout");
    const select = page.getByLabel("Pilih sesi pengambilan");
    await expect(select).toBeEnabled();
    await select.selectOption(data.slots[0].id);
    const submit = page.getByRole("button", {
      name: "Pesan sekarang",
      exact: true,
    });
    await expect(submit).toBeEnabled();
    await expect(submit).toBeDisabled({ timeout: 7000 });
    await expect(select).toHaveValue("");
    await expect(
      page.getByText("Sesi pilihanmu sudah tidak tersedia. Pilih sesi lain."),
    ).toBeVisible();
    expect(commands).toBe(0);
  });

  test("admin session inputs use WIB even on a US browser and preserve stored precision", async ({
    page,
  }) => {
    const data = fixture(true);
    data.slots[0].starts_at = "2026-10-30T02:30:10.123456Z";
    data.slots[0].ends_at = "2026-10-30T03:30:10.123456Z";
    data.slots[0].cutoff_at = "2026-10-30T02:20:10.123456Z";
    await page.route("**/api/data?*", (route) => route.fulfill({ json: data }));
    let submitted:
      | { data: { starts_at: string; ends_at: string; cutoff_at: string } }
      | undefined;
    await page.route("**/api/command", (route) => {
      submitted = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto("/admin/sessions");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Mulai", { exact: true })).toHaveValue(
      "2026-10-30T09:30:10",
    );
    await page.getByLabel("Kapasitas pesanan").fill("31");
    await page.getByRole("button", { name: "Simpan sesi" }).click();
    await expect.poll(() => submitted).toBeTruthy();
    expect(submitted?.data.starts_at).toBe(data.slots[0].starts_at);
    expect(submitted?.data.ends_at).toBe(data.slots[0].ends_at);
    expect(submitted?.data.cutoff_at).toBe(data.slots[0].cutoff_at);
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
  await page.getByRole("button", { name: "Tambah sesi", exact: true }).click();
  await expect(page.getByLabel("Kapasitas pesanan")).toBeVisible();
});
test("keyboard focus and checkout required fields", async ({ page }) => {
  await page.goto("/checkout");
  await expect(
    page.getByRole("button", { name: "Pesan sekarang" }),
  ).toBeDisabled();
  await page
    .getByLabel("Pilih sesi pengambilan")
    .selectOption("55555555-5555-4555-8555-555555555555");
  await expect(
    page.getByRole("button", { name: "Pesan sekarang" }),
  ).toBeEnabled();
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
