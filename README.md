# MANJI FOOD

Satu aplikasi Next.js untuk pemesanan satu kantin sekolah dan satu titik pengambilan. UI Bahasa Indonesia, role `student` dan `admin`. Katalog, keranjang, pesanan, pembayaran dan notifikasi disimpan di Supabase. Tidak ada data menu, kredensial atau QRIS merchant contoh pada aplikasi produksi.

Implementasi dan bukti pemeriksaan ada di [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md). Status kode lokal dan kesiapan layanan hosted dibedakan di sana.

## Menjalankan aplikasi

Prasyarat: Node.js 22.14+ (pengembangan ini memakai 24.15), npm, proyek Supabase milik pengelola.

```powershell
npm ci
Copy-Item .env.example .env.local
# Isi .env.local di editor, bukan di chat atau Git.
npm run dev
```

Isi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan `NEXT_PUBLIC_APP_URL=http://localhost:3000`. Gunakan URL HTTPS produksi saat deploy. Kunci publik Supabase memang digunakan browser dan dilindungi RLS. Web app tidak memerlukan kunci service role. `.env.local` diabaikan Git.

Tanpa konfigurasi Supabase, halaman menampilkan petunjuk setup dan API data mengembalikan 503. Aplikasi tidak mengalihkan transaksi ke database palsu atau localStorage.

## Database dan admin pertama

Untuk proyek **baru/kosong**, jalankan sekali melalui SQL Editor Supabase, dengan urutan:

1. `supabase/migrations/001_initial_schema.sql` — salinan starter asli yang telah diperiksa.
2. `supabase/migrations/002_operations.sql` — RPC transaksional, grants, RLS, storage, audit dan outbox.
3. `supabase/migrations/003_manual_sessions.sql` — sesi Start/End, satu sesi terbuka dan resolusi jam ambil WIB. Lihat [rencana migrasi](docs/SESSIONS.md) untuk database berisi data.
4. `supabase/migrations/004_order_details.sql` — detail nomor MF, serah-terima admin tanpa kode, penolakan terpisah dari pembayaran dan sinyal Realtime privat. Untuk database berisi 001–003, terapkan hanya 004; lihat [rollout detail pesanan](docs/ORDER_DETAILS.md).

Jangan menjalankan kembali `database/001_initial_schema.sql` setelah migrasi 001. Untuk database yang sudah berisi tabel/aplikasi, bandingkan schema dan siapkan migrasi penyesuaian terlebih dahulu; file ini bukan skrip overwrite. Tidak ada migrasi hosted yang diterapkan oleh proses implementasi ini.

Daftarkan akun lewat `/register`, konfirmasi email, lalu operator tepercaya menjalankan SQL berikut di SQL Editor (ganti email dengan akun pengelola yang benar):

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'EMAIL_ADMIN_ANDA');

select id, full_name, role from public.profiles where role = 'admin';
```

Tidak ada pemilihan role admin di formulir. Metadata pendaftaran tidak dapat memberi role admin. Jangan memindahkan SQL bootstrap ini ke endpoint publik.

Atur Supabase Authentication → URL Configuration: Site URL = URL aplikasi; Redirect URLs meliputi `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/callback?next=/reset-password` saat pengembangan dan padanan domain HTTPS produksi. Atur SMTP, konfirmasi email dan rate limit Auth. Callback mendukung PKCE `code` dan `token_hash` yang dikirim template email Supabase. Jika mengubah template email ke token hash, arahkan tautan konfirmasi ke `/auth/callback?token_hash={{ .TokenHash }}&type=signup`; pemulihan ke `/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` pada Site URL Anda. Uji email nyata untuk kedua alur.

## Persiapan kantin

Masuk sebagai admin dan buka `/admin`:

1. `/admin/categories`: kategori asli kantin.
2. `/admin/products`: menu, foto JPG/PNG/WebP maksimal 4 MiB, harga rupiah, stok **tersedia di luar pesanan yang telah direservasi**, varian. Nonaktifkan menu/varian untuk mengarsipkan; tidak menghapus snapshot pesanan.
3. `/admin/sessions`: **Mulai sesi / Akhiri sesi**. Timestamp otomatis dari server, hanya satu sesi terbuka, tidak berakhir otomatis walau melewati tengah malam. Tidak ada input tanggal/deadline/checkbox aktif.
4. `/admin/settings`: lokasi tunggal, keterangan jam, payload asli QRIS statis dari merchant. Validasi TLV/checksum tidak membuktikan keaslian merchant: pindai dengan aplikasi pembayaran dan cocokkan nama merchant sebelum membuka layanan. Payload ditampilkan tanpa perubahan dan tanpa penyisipan nominal. Kosongkan untuk hanya menerima tunai.
5. Mulai sesi untuk menerima pesanan. Jeda toko tetap dapat dipakai tanpa mengakhiri sesi. Tanpa sesi terbuka/stok, checkout tidak tersedia.

Siswa memilih menu → keranjang persisten per akun → jam ambil HH:mm → konfirmasi waktu server → checkout → tiket permanen. Harga/varian/stok dihitung dari database pada checkout. Perkiraan harga dapat berubah; **bayar total tiket hasil server**, bukan estimasi keranjang. Retry memakai kunci idempotensi yang disimpan di sessionStorage; keranjang dan tiket tersimpan di database.

## Pembayaran dan pengambilan

- QRIS **statis**: siswa memindai QR asli, memasukkan nominal tiket sendiri, lalu boleh mengunggah bukti privat dan mengirim klaim pembayaran. Tidak ada verifikasi otomatis.
- Admin mencocokkan jumlah, waktu dan referensi dana masuk nyata pada ledger merchant. Referensi harus unik; satu penerimaan dana tidak dapat dipakai dua kali.
- Tunai: admin mencatat uang yang benar-benar telah diterima. Persiapan boleh berjalan sebelum pembayaran, tetapi penyelesaian wajib sudah lunas dan kode 10 karakter sesuai tiket siswa.
- Pesanan: `pending → confirmed → preparing → ready → completed`. Pembayaran memiliki status terpisah.
- Pembatalan/penolakan sebelum persiapan mengembalikan stok dan melepaskan hitungan reservasi sesi tepat sekali. Klaim pembayaran harus ditolak/direkonsiliasi dahulu; dana lunas harus dikembalikan nyata dan dicatat sebelum pembatalan.
- Tidak ada expiry otomatis atau refund otomatis. Admin meninjau reservasi yang tidak dibayar dan mengakhiri sesi secara manual. Pembayaran terlambat pada tiket batal harus memiliki catatan rekonsiliasi; pengembalian dicatat dengan referensi dan alasan setelah benar-benar dilakukan di luar aplikasi.

Bukti berada di bucket privat `payment-proofs`; URL bertanda tangan hanya dibuat setelah RLS mengizinkan pemilik/admin dan berlaku 60 detik. Foto menu berada di bucket publik terpisah. Batas upload 4 MiB dipilih agar multipart tetap di bawah batas body Vercel Function.

## Realtime, suara, dan Web Push

Realtime hanya berlangganan `notifications` dengan filter recipient dan RLS, lalu memuat ulang data kanonik. Polling 20 detik, reconnect jaringan dan kembali ke tab juga memuat ulang data. Riwayat notifikasi tetap tersedia meskipun push gagal; layar menampilkan 100 notifikasi terbaru.

Admin perlu menekan **Suara nonaktif** untuk mengizinkan Web Audio. Tiga nada asli dibunyikan saat tab terlihat; pengingat tiap 20 detik untuk tiket belum ditinjau, mute/mode senyap, volume, tunda 5 menit dan batching tersedia. Menutup popup tidak memverifikasi pembayaran. Browser tertutup, mode senyap perangkat dan pembatasan autoplay dapat mencegah bunyi.

Untuk Web Push:

1. Buat pasangan VAPID dengan `node -e "console.log(require('web-push').generateVAPIDKeys())"` pada terminal lokal aman. Simpan public key di `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; private key dan `VAPID_SUBJECT=mailto:EMAIL_PENGELOLA` hanya di environment server/penjadwal.
2. Isi `SUPABASE_SERVICE_ROLE_KEY` **hanya pada proses penjadwal tepercaya**. Web app tidak memakai kunci ini.
3. Jalankan `npm run push:dispatch` tiap menit di Node scheduler/worker yang Anda kelola. Deploy Vercel web app saja tidak menjalankan skrip ini otomatis. Untuk scheduler tanpa `.env.local`, pasang environment variables langsung di platform.
4. Siswa mengaktifkan preferensi dan perangkat dari `/notifications`. HTTPS dan dukungan browser diperlukan; pada iOS dapat memerlukan pemasangan ke layar utama. Opt-out menghapus subscriptions pengguna; logout mencoba melepas perangkat tanpa menghalangi logout sesi.

Outbox dibuat dalam transaksi yang sama dengan notifikasi. Worker mengambil maksimal 25 pekerjaan dengan locking, menghapus endpoint 404/410, retry dengan backoff maksimal 6 percobaan dan memakai tag notification ID untuk dedupe tampilan. Semantik pengiriman at-least-once; tidak ada jaminan push selalu tiba. Payload lock-screen generik tanpa nama, kelas, detail pembayaran, atau URL bukti. Endpoint di luar penyedia push yang diizinkan ditolak worker untuk membatasi SSRF.

Pantau outbox lewat SQL Editor; `attempts >= 6 AND delivered_at IS NULL` memerlukan pemeriksaan konfigurasi lalu requeue terkontrol oleh operator. Jangan menganggapnya terkirim.

## Pemeriksaan

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:smoke
```

Vitest memakai TypeScript in-process dan thread tunggal untuk menghindari kebutuhan child process compiler pada Windows yang dibatasi. Tes database mengeksekusi kedua migrasi asli dalam PostgreSQL PGlite, dengan stand-in schema `auth`/`storage`, dua siswa dan admin. Ini memeriksa SQL/RLS/transaksi, **bukan** Supabase Auth/Storage/Realtime hosted. PGlite menserialisasi koneksi; uji multi-koneksi stok/capacity tetap perlu dijalankan pada Postgres/Supabase staging.

QA browser fixture (hanya pengujian UI; tidak dikirim sebagai route produksi):

```powershell
npm run build
npm run test:ui:build
# Terminal terpisah:
npm run test:ui:serve
# Terminal pengujian:
npm run test:e2e
```

Harness mengompilasi komponen aplikasi yang sama, mengganti transport/navigasi dengan fixture khusus tes, dan memeriksa 22 layar pada 320/360/375/390/430/768/1024/1440px serta interaksi. Set `PLAYWRIGHT_CHROME_PATH` ke executable Chrome yang tersedia. Tes browser ini **belum lulus di lingkungan implementasi** karena pembatasan pembuatan proses; detail di log. Tetap jalankan E2E hosted nyata mengikuti [docs/TEST_PLAN.md](docs/TEST_PLAN.md) dan [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Deploy Vercel

Impor direktori root ini sebagai satu proyek Next.js. Pasang environment web (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, opsional public VAPID key), jalankan migrasi, set redirect Auth dan domain HTTPS, lalu deploy dengan `npm run build`. Google fonts disiapkan melalui `next/font/google` dan di-host oleh Next; build membutuhkan akses unduhan font atau cache valid. Worker push dijalankan terpisah seperti di atas. Jangan menaruh kunci service role/private VAPID pada variabel `NEXT_PUBLIC_*`.

Manifest, ikon PNG/SVG dan service worker disediakan. Service worker tidak meng-cache HTML terautentikasi, API, atau bukti pribadi; aplikasi tidak menawarkan checkout offline.

Troubleshooting: halaman setup → periksa env dan restart; profil hilang/RPC tidak ditemukan → periksa urutan migrasi; login ditolak → konfirmasi email/SMTP/redirect; realtime tidak tersambung → cek publication `notifications` dan RLS (polling tetap tersedia); QRIS tidak muncul → isi payload asli di pengaturan; tidak ada push → periksa izin, VAPID, scheduler, outbox dan subscription; suara diam → tekan tombol suara saat tab aktif; origin ditolak → samakan `NEXT_PUBLIC_APP_URL` dengan origin browser (termasuk port). Jangan menonaktifkan RLS sebagai solusi.

Login selalu mengirim email dan kata sandi dalam body POST, termasuk ketika JavaScript belum aktif. URL lama yang memuat parameter kredensial diarahkan ke URL bersih. Jika CSP masih ditolak, periksa header respons dari deployment: CSP aplikasi hanya dibuat di `src/proxy.ts`; hapus konfigurasi CSP lama yang bertentangan di hosting/reverse proxy. Izin `unsafe-eval` hanya ada saat `npm run dev`; jangan menambahkannya ke produksi. Worker dibatasi ke origin aplikasi untuk `/sw.js`; aplikasi saat ini tidak memerlukan worker `blob:`.

Setelah `npm run build`, jalankan `npm run test:security` untuk menguji header CSP dan nonce HTML asli, form POST, login siswa/admin, cookie sesi, logout, URL bersih, dan origin melalui server Next produksi. Transport Supabase menggunakan fixture lokal yang memblokir koneksi keluar; hasilnya tidak membuktikan login pada Supabase hosted atau eksekusi JavaScript di browser. Pemeriksaan browser dan akun staging tetap diperlukan. Rincian kebijakan ada di `docs/SECURITY.md`.

Jam siswa/admin memakai waktu server, WIB `HH:mm:ss`, dan berjalan setiap detik tanpa refresh. Durasi sesi aktif ditampilkan di header; sesi dimulai/diakhiri admin tanpa input tanggal. Jam ambil siswa HH:mm diselesaikan dan divalidasi database dalam WIB. Sinkronisasi normal hanya setiap lima menit saat tab terlihat, ditambah koreksi saat tab aktif kembali atau koneksi pulih; tidak ada request setiap detik. Sebelum sinkronisasi pertama, `--:--:-- WIB` adalah placeholder yang aman untuk hydration. Dokumentasi ada di [docs/TIMEKEEPING.md](docs/TIMEKEEPING.md) dan [docs/SESSIONS.md](docs/SESSIONS.md).
