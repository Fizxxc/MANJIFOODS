"use client";
export function Reload() {
  return (
    <button className="secondary" onClick={() => location.reload()}>
      Muat ulang
    </button>
  );
}
