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

## Sesi dan validasi pengambilan

- Header siswa/admin menampilkan jam berjalan. `SessionTiming` menampilkan durasi sesi dan hitung mundur ke mulai/selesai pada ringkasan katalog, checkout, tiket dan editor/daftar sesi admin. Durasi dihitung dari selisih timestamp, bukan penghitung yang dikurangi setiap callback, dan tidak menjadi negatif atau kembali ke nol setelah 24 jam.
- Katalog dan checkout mengevaluasi ulang ketersediaan setiap detik memakai waktu tersinkron. Sesi harus aktif, belum melewati cutoff/akhir dan masih memiliki kapasitas. Pilihan yang kedaluwarsa tidak lagi mengaktifkan tombol checkout. Submit membaca `getNow()` lagi sehingga cutoff dengan pecahan detik juga ditolak sebelum request checkout.
- Database tetap menjadi otoritas: fungsi checkout pada migrasi 002 sudah memeriksa `cutoff_at <= clock_timestamp()` setelah mengunci sesi, berikut stok dan kapasitas. Jam browser, termasuk hasil sinkronisasi, tidak digunakan sebagai otoritas mutasi. Tidak ada perubahan migrasi atau aturan status pembayaran/pengambilan.
- Input `datetime-local` admin selalu berarti WIB, termasuk detik. `parseWibDateTime` mengubahnya ke timestamp UTC dan menolak tanggal yang tidak valid/ternormalisasi, serta UI dan schema server memeriksa urutan cutoff/mulai/selesai. Timestamp lama yang tidak diubah mempertahankan presisi aslinya supaya edit kapasitas tidak mengubah jadwal sesi yang sudah memiliki reservasi.
- Timestamp riwayat, pembaruan data, snooze pengingat dan tanggal laporan memakai WIB. Reminders tetap memerlukan gesture untuk audio; perubahan jam tidak memberikan jaminan audio/push baru.

## Pemeriksaan dan operasi

Jalankan lint, typecheck, suite tes dan build; sesudah build jalankan `npm run test:security` untuk pemeriksaan HTTP produksi termasuk endpoint waktu dan placeholder SSR jam. `tests/clock.test.ts` menguji timer, latensi, lifecycle, reconnect, backoff, cutoff, zona waktu dan format. Tiga skenario Playwright baru di `tests/ui.spec.ts` memeriksa detik berjalan/jumlah request, cutoff tanpa refresh, dan input WIB pada browser berzona AS melalui UI harness yang ada.

Pastikan jam host aplikasi dan PostgreSQL dipelihara oleh sinkronisasi waktu sistem/NTP. Akurasi akhir mengikuti jam server dan ketidaksimetrian latensi jaringan; hook bukan pengganti NTP dan tidak menjanjikan presisi jam atom. Verifikasi sleep/wake, browser/device dan proxy/CDN produksi secara langsung. Jangan menambahkan cache pada `/api/time`.

Acuan API: [React useSyncExternalStore dan snapshot hydration](https://react.dev/reference/react/useSyncExternalStore), [jam monoton performance.now dan perilaku sleep](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now).
