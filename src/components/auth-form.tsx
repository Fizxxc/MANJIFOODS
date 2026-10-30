"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Utensils, Eye, EyeOff } from "lucide-react";
import { cleanCredentialUrl } from "@/lib/auth-url";
type Fields = {
  email: string;
  password: string;
  name: string;
  class_name: string;
  remember: boolean;
};
export function AuthForm({ mode }: { mode: string }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Fields>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [show, setShow] = useState(false);
  const isLogin = mode === "login",
    isRegister = mode === "register",
    isForgot = mode === "forgot-password",
    isReset = mode === "reset-password";
  /* eslint-disable react-hooks/set-state-in-effect -- Read browser-only remembered email and callback status after hydration. */
  useEffect(() => {
    const cleanUrl = cleanCredentialUrl(location.href);
    if (cleanUrl) history.replaceState(history.state, "", cleanUrl);
    try {
      setValue("email", localStorage.getItem("manji-remember-email") || "");
      setValue("remember", !!localStorage.getItem("manji-remember-email"));
    } catch {}
    const status = new URLSearchParams(location.search);
    if (status.has("error"))
      setError(
        status.get("error") === "link"
          ? "Tautan tidak valid atau kedaluwarsa. Minta tautan baru."
          : "Permintaan belum berhasil. Periksa isian dan coba lagi.",
      );
    if (status.has("success"))
      setSuccess("Permintaan diproses. Periksa email atau masuk kembali.");
  }, [setValue]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const submit = handleSubmit(async (fields) => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const action = isLogin
        ? "login"
        : isRegister
          ? "register"
          : isForgot
            ? "forgot"
            : "reset";
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...fields }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (isLogin) {
        try {
          if (fields.remember)
            localStorage.setItem("manji-remember-email", fields.email);
          else localStorage.removeItem("manji-remember-email");
        } catch {}
        router.replace(json.destination || "/menu");
        router.refresh();
      } else
        setSuccess(
          isRegister
            ? "Periksa email untuk konfirmasi akun, lalu masuk."
            : isForgot
              ? "Jika email terdaftar, tautan pemulihan akan dikirim."
              : "Kata sandi diperbarui. Silakan masuk kembali.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Koneksi terputus. Coba lagi.");
    } finally {
      setBusy(false);
    }
  });
  return (
    <main id="main" className="auth-shell">
      <section className="auth-intro">
        <div className="wordmark">
          manji<span>.</span> food
        </div>
        <div className="auth-art">
          <Utensils size={64} strokeWidth={1} />
        </div>
        <h2>
          Jeda istirahat,
          <br />
          waktunya makan.
        </h2>
        <p>Pilih menu kantin dan simpan tiket pengambilanmu di satu tempat.</p>
        <span className="eyebrow">Kantin sekolah · Satu titik pengambilan</span>
      </section>
      <section className="auth-card">
        <Link href="/menu" className="text-link">
          <ArrowLeft size={18} /> Kembali
        </Link>
        <span className="eyebrow">MANJI FOOD</span>
        <h1>
          {isLogin
            ? "Selamat datang"
            : isRegister
              ? "Buat akun siswa"
              : isForgot
                ? "Lupa kata sandi?"
                : "Kata sandi baru"}
        </h1>
        <p className="muted">
          {isLogin
            ? "Masuk untuk memesan menu saat istirahat."
            : isRegister
              ? "Gunakan email aktif untuk menyimpan pesananmu."
              : isForgot
                ? "Kami akan mengirim tautan pemulihan ke emailmu."
                : "Gunakan minimal 10 karakter untuk akunmu."}
        </p>
        <form
          method="post"
          action="/api/auth"
          onSubmit={submit}
          className="form-stack"
        >
          <input
            type="hidden"
            name="action"
            value={
              isLogin
                ? "login"
                : isRegister
                  ? "register"
                  : isForgot
                    ? "forgot"
                    : "reset"
            }
          />
          {isRegister && (
            <>
              <label>
                Nama lengkap
                <input
                  autoComplete="name"
                  {...register("name", {
                    required: "Nama wajib diisi.",
                    maxLength: 120,
                  })}
                />
              </label>
              <label>
                Kelas
                <input
                  placeholder="Contoh: XI IPA 2"
                  {...register("class_name", { maxLength: 40 })}
                />
              </label>
            </>
          )}
          {!isReset && (
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                {...register("email", { required: "Email wajib diisi." })}
              />
            </label>
          )}
          {!isForgot && (
            <label>
              Kata sandi
              <div className="password-field">
                <input
                  type={show ? "text" : "password"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  {...register("password", {
                    required: "Kata sandi wajib diisi.",
                    minLength: isLogin ? 1 : 10,
                    maxLength: 128,
                  })}
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShow(!show)}
                  aria-label={
                    show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                  }
                >
                  {show ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </label>
          )}
          {isLogin && (
            <div className="row between">
              <label className="check">
                <input type="checkbox" {...register("remember")} />
                Ingat email
              </label>
              <Link className="text-link" href="/forgot-password">
                Lupa sandi?
              </Link>
            </div>
          )}
          {Object.keys(errors).length > 0 && (
            <p className="message error" role="alert">
              Periksa isian; kata sandi baru minimal 10 karakter.
            </p>
          )}
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="message success" role="status">
              {success}
            </p>
          )}
          <button disabled={busy} type="submit">
            {busy
              ? "Memproses…"
              : isLogin
                ? "Masuk"
                : isRegister
                  ? "Daftar"
                  : isForgot
                    ? "Kirim tautan"
                    : "Simpan kata sandi"}
          </button>
        </form>
        <p className="auth-footer">
          {isLogin
            ? "Belum punya akun? "
            : isRegister
              ? "Sudah punya akun? "
              : ""}
          <Link className="text-link" href={isLogin ? "/register" : "/login"}>
            {isLogin ? "Daftar siswa" : "Masuk ke akun"}
          </Link>
        </p>
      </section>
    </main>
  );
}
