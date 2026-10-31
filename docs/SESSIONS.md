# Sesi manual dan jam pengambilan

Kontrak ini menggantikan editor sesi berbasis tanggal pada kit awal. Admin hanya memakai **Mulai sesi / Akhiri sesi**. Tidak ada tanggal, deadline, kapasitas sesi atau checkbox aktif yang diisi manual. Database mencatat timestamp; satu sesi boleh terbuka dan tetap terbuka melewati tengah malam hingga admin mengakhirinya.

Start membuka penerimaan pesanan untuk sesi baru. Kontrol jeda toko tetap berlaku tanpa mengakhiri sesi. End menutup penerimaan pesanan baru; pesanan yang sudah masuk, stok reservasi, tiket dan pembayaran tetap diproses seperti semula. Tidak ada pembatalan/refund otomatis.

Siswa memilih **HH:mm** saja. Server PostgreSQL menyelesaikan kemunculan berikutnya dalam 24 jam menggunakan `Asia/Jakarta`. Jam yang telah lewat hari ini, termasuk menit yang sudah dimulai, berarti besok WIB. Pratinjau server menampilkan tanggal/jam sebelum checkout; siswa tidak memasukkan tanggal. Checkout menghitung ulang setelah semua lock yang dapat menunggu diperoleh. Jika hasilnya berubah dari pratinjau, siswa harus memeriksa ulang, sehingga pesanan tidak diam-diam bergeser satu hari.

Jam header tetap berdetak `HH:mm:ss WIB` menggunakan hook waktu tersinkron. Durasi dihitung dari timestamp mulai server sampai sekarang atau timestamp selesai; tidak kembali ke nol setelah 24 jam. Data sesi diperbarui dengan polling kanonik 20 detik dan reconnect/kembali ke tab yang sudah ada. Database langsung menolak checkout pada sesi yang sudah ditutup walaupun layar siswa belum memuat ulang.

## Migrasi dan pelestarian data

Terapkan **001 → 002 → 003_manual_sessions.sql**. Jangan menjalankan kembali starter 001/002 pada database yang sudah berisi data.

Migrasi 003 mempertahankan `pickup_slots`, semua baris lama dan FK `orders.pickup_slot_id`. Sesi lama diberi mode `scheduled` dan menjadi riwayat; nilai tanggal/status/kapasitas lama tidak diubah. Sesi baru bermode `manual`; akhir/deadline/kapasitasnya NULL saat dibuka. Constraint bentuk baris serta indeks unik parsial menjamin satu sesi terbuka. `start_key` tidak diberi hak baca browser. RLS riwayat pemilik tetap berlaku.

Kolom baru `orders.pickup_at` menyimpan janji pengambilan hasil server. Pesanan lama dibackfill dari waktu mulai sesi lama yang direferensikannya. Snapshot harga/item, status, total dan pembayaran asli tidak ditulis ulang.

RPC `session_start(p_key)` dan `session_end(p_session)` memeriksa admin, memakai advisory lock dan urutan lock store→session yang konsisten dengan checkout, serta mencatat audit. Start retry tidak membuka ulang sesi yang sudah berakhir; End retry tidak menutup sesi baru. `pickup_time_preview(p_time)` dan `checkout_session(...)` memeriksa aktor. Helper resolusi dengan waktu acuan dan implementasi editor lama tidak dapat dieksekusi role browser. Checkout tanggal lama dicabut aksesnya dan wrapper katalog menolak jalur editor `slot`.

## Penerapan pada Supabase berisi data

1. Buat backup/snapshot, catat jumlah/ref pesanan/item/pembayaran/sesi, dan uji pada salinan staging. Jangan reset schema.
2. Jeda penerimaan pesanan selama pergantian versi. Cocokkan schema/grants aktual dengan 001/002, lalu terapkan **hanya 003**. Migrasi berjalan dalam transaksi dan tidak menghapus baris/tabel riwayat.
3. Deploy aplikasi versi ini sesudah migrasi. RPC lama sengaja gagal tertutup selama pergantian. Klik Mulai sesi; sesi terjadwal lama tidak otomatis menjadi sesi terbuka.
4. Cocokkan data lama dan backfill `pickup_at`; uji dua siswa/admin, Start bersamaan, End versus checkout, retry, rollover WIB, pembayaran dan pengambilan pada tiket lama.
5. Utamakan perbaikan maju. Rollback ke editor lama memerlukan rencana kompatibilitas tersendiri; jangan menghapus kolom/sesi/pesanan baru untuk membalikkan migrasi.

Migrasi hosted tidak diterapkan oleh implementasi lokal ini. Operator menerapkannya melalui SQL Editor/CLI tepercaya; kunci publik aplikasi tidak cukup untuk migrasi SQL.
