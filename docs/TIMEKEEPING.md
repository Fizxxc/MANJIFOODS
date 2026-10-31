# Waktu WIB dan sinkronisasi jam

Semua jam tampilan menggunakan `Asia/Jakarta`, format `HH:mm:ss`, dan label WIB. Jadwal tetap disimpan sebagai timestamp dengan offset/UTC. Zona waktu serta jam perangkat pengguna tidak menentukan jadwal kantin.

## Sumber waktu dan hook

- `GET /api/time` mengembalikan `{ serverTime }` berupa epoch milidetik server saat respons dibuat. Respons tidak dicache, tidak mengakses database dan tidak memerlukan atau memperbarui sesi Supabase. CSP tetap diterapkan. Browser mengirim request tanpa cookie.
- `src/hooks/use-server-clock.ts` menyediakan `useServerClock()` dengan `now`, `synchronized` dan `getNow()`. Semua pemakai dalam satu tab berbagi store, timer dan request yang sama. Gunakan `now` untuk tampilan, `getNow()` untuk pemeriksaan tepat saat tindakan dilakukan. `useWibToday()` hanya memperbarui komponen saat tanggal WIB berubah.
- `src/lib/server-clock.ts` mengikat timestamp server ke `performance.now()` dan mengoreksi perkiraan transit respons dengan setengah waktu round trip. Callback timer menghitung ulang dari acuan tersebut dan dijadwalkan ke batas detik server berikutnya; tidak ada penambahan penghitung satu detik yang bisa terakumulasi terlambat.
- Sinkronisasi dilakukan sekali saat diperlukan, lalu setiap lima menit selama tab terlihat. Perubahan visibility, focus/pageshow dan koneksi online memicu konfirmasi ulang; request serentak digabung dan event berdekatan dibatasi dengan jeda lima detik. Reconnect yang terjadi selama jeda tetap dijadwalkan pada akhir jeda tersebut. Navigasi React dengan acuan yang masih segar tidak meminta sampel baru.
- Timer berhenti saat tab tersembunyi atau tidak ada subscriber. Request yang sudah dimulai boleh selesai dengan batas delapan detik, sehingga remount React Strict Mode memakai request yang sama. Kegagalan request dicoba lagi setelah 30 detik, lalu meningkat hingga lima menit; tidak ada polling jaringan tiap detik.
- Saat offline, jam meneruskan perkiraan dari acuan terakhir. Lonjakan selisih jam perangkat dan jam monoton menandakan perubahan jam atau sleep yang menghentikan jam monoton; acuan ditahan sampai konfirmasi server baru diperoleh. Sebelum sampel pertama atau saat acuan tidak dapat dipercaya, jam menampilkan `--:--:-- WIB` dan pemilihan/checkout menunggu sinkronisasi.

`useSyncExternalStore` memakai snapshot server konstan yang sama dengan render pertama saat hydration. Tidak ada pembacaan waktu perangkat saat render SSR, `suppressHydrationWarning`, atau reload halaman. Komponen jam terpisah dari root aplikasi agar seluruh katalog/board tidak dirender ulang hanya untuk perubahan detik.

## Sesi manual dan validasi pengambilan

Admin memakai Mulai sesi/Akhiri sesi, tanpa editor tanggal, cutoff atau checkbox aktif. Timestamp database menjadi acuan durasi sesi; sesi terbuka tidak kedaluwarsa pada tengah malam. Siswa memilih HH:mm tanpa tanggal dan melihat pratinjau waktu hasil server. Migrasi 003 menghitung pickup_at dalam Asia/Jakarta, memeriksa ulang sesudah lock checkout, dan menolak perubahan tanggal dari pratinjau. Riwayat serta pembayaran dipertahankan. Kontrak dan rencana migrasi ada di [SESSIONS.md](SESSIONS.md).

## Pemeriksaan dan operasi

Jalankan lint, typecheck, suite tes dan build; sesudah build jalankan `npm run test:security` untuk pemeriksaan HTTP produksi termasuk endpoint waktu, placeholder SSR jam dan role sesi. Tes mencakup timer, latensi, lifecycle, reconnect, backoff, sesi lintas hari, HH:mm, zona waktu dan format. Skenario Playwright pada UI harness memeriksa detik berjalan/jumlah request, input jam ambil tanpa tanggal dan kontrol Start/End pada browser berzona AS.

Pastikan jam host aplikasi dan PostgreSQL dipelihara oleh sinkronisasi waktu sistem/NTP. Akurasi akhir mengikuti jam server dan ketidaksimetrian latensi jaringan; hook bukan pengganti NTP dan tidak menjanjikan presisi jam atom. Verifikasi sleep/wake, browser/device dan proxy/CDN produksi secara langsung. Jangan menambahkan cache pada `/api/time`.

Acuan API: [React useSyncExternalStore dan snapshot hydration](https://react.dev/reference/react/useSyncExternalStore), [jam monoton performance.now dan perilaku sleep](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now).
