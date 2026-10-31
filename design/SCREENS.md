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
/ORDERS/ORDER-ID
[Ticket MF-XXXX]  [Payment separately]
[Status] pending->confirmed->preparing->ready->completed
[Pickup slot, verification code]
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
  [Open / verify transaction / accept]
[MF-002][Istirahat 1][Cash: unpaid]
  Mie x1                      Rp10.000
  [Open / accept]
```

Admin operational detail: verified pay only after checking real merchant settlement. Pickup completion requests pickup code and verifies cash collection. Product editor includes photo, stock, category, visibility, optional variants. Session screen has Start Session / End Session only with server timestamps and live duration, no date editor/cutoff/active checkbox; one session remains open across midnight until explicitly ended. Settings retain location, descriptive hours, QRIS payload, push and sound. See docs/SESSIONS.md.

## Routes (suggested)
`/login`, `/register`, `/forgot-password`, `/menu`, `/menu/[slug]`, `/cart`, `/checkout`, `/orders`, `/orders/[id]`, `/profile`, `/profile/edit`, `/notifications`, `/about`, `/admin`, `/admin/orders/[id]`, `/admin/products`, `/admin/categories`, `/admin/payments`, `/admin/sessions`, `/admin/reports`, `/admin/settings`.
