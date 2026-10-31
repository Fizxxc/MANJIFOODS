import { redirect, notFound } from "next/navigation";
import { configured, identity } from "@/lib/supabase/server";
import { App } from "@/components/app";
import { AuthForm } from "@/components/auth-form";
import Link from "next/link";
import { Reload } from "@/components/reload";
export const dynamic = "force-dynamic";
const authRoutes = ["login", "register", "forgot-password", "reset-password"];
const studentRoutes = [
  "menu",
  "cart",
  "checkout",
  "orders",
  "profile",
  "profile/edit",
  "notifications",
  "about",
];
const adminRoutes = [
  "admin",
  "admin/products",
  "admin/categories",
  "admin/payments",
  "admin/sessions",
  "admin/reports",
  "admin/settings",
];
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const path = (await params).path?.join("/") || "";
  if (!path) {
    if (configured()) {
      let landing = "/login";
      try {
        const { profile } = await identity();
        landing = profile.role === "admin" ? "/admin" : "/menu";
      } catch {}
      redirect(landing);
    }
    redirect("/menu");
  }
  if (
    !authRoutes.includes(path) &&
    !studentRoutes.includes(path) &&
    !adminRoutes.includes(path) &&
    !/^menu\/[^/]+$/.test(path) &&
    !/^orders\/[0-9a-f-]{36}$/.test(path) &&
    !/^pay\/[0-9a-f-]{36}$/.test(path) &&
    !/^admin\/orders\/[0-9a-f-]{36}$/.test(path)
  )
    notFound();
  if (!configured())
    return (
      <main id="main" className="setup">
        <div className="wordmark">
          manji<span>.</span> food
        </div>
        <h1>Siapkan kantinmu</h1>
        <p>
          Aplikasi belum terhubung ke Supabase. Isi variabel lingkungan,
          jalankan migrasi, lalu mulai ulang server.
        </p>
        <ol>
          <li>
            Salin <code>.env.example</code> ke <code>.env.local</code>.
          </li>
          <li>Isi URL dan kunci publik Supabase serta URL aplikasi.</li>
          <li>
            Terapkan migrasi 001, 002, lalu 003. Ikuti README untuk membuat
            admin.
          </li>
        </ol>
        <p>Kredensial dan QRIS merchant diisi oleh pengelola.</p>
        <Reload />
      </main>
    );
  if (authRoutes.includes(path)) return <AuthForm mode={path} />;
  let actor;
  try {
    actor = await identity(path.startsWith("admin"));
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "AUTH_REQUIRED") redirect("/login");
    if (msg === "ADMIN_REQUIRED") redirect("/menu");
    return (
      <main id="main" className="setup">
        <h1>Koneksi belum siap</h1>
        <p>{msg}</p>
        <Link className="button" href="/menu">
          Coba lagi
        </Link>
      </main>
    );
  }
  return <App key={path} initialProfile={actor.profile} />;
}
