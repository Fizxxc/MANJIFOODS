export default function Loading() {
  return (
    <main id="main" className="setup" aria-busy="true">
      <div className="wordmark">
        manji<span>.</span> food
      </div>
      <p role="status">Memuat halaman…</p>
      <div className="skeleton" />
      <div className="skeleton" />
    </main>
  );
}
