# Screen inventory & text wireframes

## Student
```
/MENU
[MANJI FOOD                     bell]
[Open/Closed  •  Ambil: Istirahat 1]
[Search products________________]
[All | Food | Drinks | Snacks]
[Product photograph]  Nasi Ayam
                      Rp12.000  [+]
[Product photograph]  Es Teh
                      Rp4.000   [+]
[Menu] [Keranjang] [Pesanan] [Akun] <- fixed, safe area
```
```
/CHECKOUT
[Back] Konfirmasi pesanan
[Products, qty, price locked on server]
[Jam pengambilan (WIB)] HH:mm only
[Server-resolved pickup date/time confirmation]
[Pembayaran] (QRIS statis) (Cash)
[Total Rp16.000]
[Pesan sekarang] -> idempotent transaction
```
```
/PAY/ORDER-ID (QRIS)
[Order MF-XXXX]  [Menunggu verifikasi]
[Amount: Rp16.000] [Salin nominal]
[QR from configured merchant payload]
[Open payment app, scan and enter exact amount]
[Upload proof optional] [Sudah transfer?]
[Not confirmed until actual settlement checked]
```
```
/ORDERS/MF-YYYYMMDD-XXXXXX
[Existing MF order number]  [Payment separately]
[Status] pending->confirmed->preparing->ready->completed
[Pickup HH:mm WIB and location; no separate code/session dates/duration]
[Ordered items and price snapshot]
[Status and action history]
```
```
/ACCOUNT
[Name] [Class]
[Profile settings] [Notification preference] [Security]
[About / developer details] [Logout]
```
## Admin
```
/ADMIN
[MANJI FOOD / Order board] [Sound toggle]
[New (3)] [Preparing (5)] [Ready (2)] [Finished]
[MF-001][Istirahat 1][QRIS: pending]
  Nasi Ayam x1, Es Teh x1     Rp16.000
  [Open order]
[MF-002][Istirahat 1][Cash: unpaid]
  Mie x1                      Rp10.000
  [Open order]
```

Admin opens the MF detail before confirming/rejecting, with a confirmation dialog and rejection reason. Payment review is separate: private proof thumbnails open a zoomable modal; only actual receipt checked by admin permits marking paid. Pickup completion confirms paid handoff without typing a code. Historical records/tickets remain stored. See docs/ORDER_DETAILS.md. Product editors, session Start/End with live duration, and store/QRIS settings remain as specified in docs/SESSIONS.md.

## Routes (suggested)
`/login`, `/register`, `/forgot-password`, `/menu`, `/menu/[slug]`, `/cart`, `/checkout`, `/orders`, `/orders/[id]`, `/profile`, `/profile/edit`, `/notifications`, `/about`, `/admin`, `/admin/orders/[id]`, `/admin/products`, `/admin/categories`, `/admin/payments`, `/admin/sessions`, `/admin/reports`, `/admin/settings`.
