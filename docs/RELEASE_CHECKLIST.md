# Release verification — MANJI FOOD

Kode lokal bukan bukti integrasi hosted. Catat tanggal, environment, akun uji dan hasil tanpa menyimpan password/token/QRIS merchant dalam repo.

- [ ] Terapkan 001 lalu 002 pada proyek Supabase yang benar setelah backup/review schema. Periksa grants, SECURITY DEFINER search_path, RLS setiap tabel dan bucket privat.
- [ ] Daftar dua siswa dan satu admin bootstrap tepercaya. Verifikasi email, login, refresh sesi, logout, pemulihan email dan sesi lama setelah password reset.
- [ ] Coba membaca/mengubah profil, keranjang, tiket, pembayaran, bukti dan subscriptions siswa lain via Supabase REST/RPC langsung. Pastikan role metadata tidak menaikkan privilege.
- [ ] Jalankan checkout berbarengan lewat dua koneksi nyata untuk stok akhir dan kapasitas akhir. Periksa rollback, retry setelah koneksi terputus, total snapshot dan idempotensi.
- [ ] Uji QRIS asli pada aplikasi pembayaran: nama merchant tepat, payload tidak berubah, nominal diisi manual. Cocokkan settlement nyata sebelum paid. Uji referensi duplikat, claim salah, late settlement dan refund yang benar-benar dilakukan.
- [ ] Uji tunai sampai kode ambil: salah kode/belum lunas harus ditolak. Satu penyelesaian dan satu pembatalan/restock saja saat retry.
- [ ] Unggah JPG/PNG/WebP 4 MiB, file lebih besar, file berkedok gambar, akses URL privat tanpa sesi dan siswa lain, serta expiry signed URL.
- [ ] Uji publikasi notifikasi per recipient, admin pada dua perangkat, reconnect, poll fallback dan riwayat setelah browser ditutup.
- [ ] Pasang VAPID/scheduler; periksa outbox, opt-in/out, multi-perangkat, endpoint expired, retry. Pastikan pesan lock-screen generik dan tidak mengklaim delivery guarantee.
- [ ] Uji audio setelah gesture, mute, volume, snooze 5 menit, batch, acknowledge, tab hidden dan device silent.
- [ ] Jalankan fixture browser QA dan E2E pada aplikasi hosted di 320/360/375/390/430/768/1024/1440px. Periksa zoom 200%, keyboard/focus, screen reader, safe area, reduced motion, keadaan loading/error/kosong/retry, dan semua editor admin.
- [ ] Cocokkan laporan CSV tanggal WIB dengan database; hanya `paid` masuk kolom penerimaan, `refunded` nol, invoice tidak berganda. Uji formula injection pada data ekspor.
- [ ] Periksa env Vercel, redirect Auth, HTTPS, CSP, backup/restore, prosedur rekonsiliasi dan siapa operator yang mengawasi outbox.

Tidak ada expiry pesanan otomatis pada versi ini: admin perlu meninjau pesanan tidak dibayar sebelum persiapan. Jangan membatalkan pesanan yang telah menerima dana tanpa rekonsiliasi.
