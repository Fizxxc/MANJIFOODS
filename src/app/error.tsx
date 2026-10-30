"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="setup">
      <h1>Halaman belum dapat dibuka</h1>
      <p>Periksa koneksi lalu coba lagi.</p>
      <button onClick={reset}>Coba lagi</button>
    </main>
  );
}
