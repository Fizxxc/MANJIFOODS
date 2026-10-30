import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="setup">
      <h1>Halaman tidak ditemukan</h1>
      <Link className="button" href="/menu">
        Kembali ke menu
      </Link>
    </main>
  );
}
