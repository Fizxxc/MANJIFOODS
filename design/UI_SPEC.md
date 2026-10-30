# Visual design contract (non-negotiable)

**Direction:** a quiet contemporary food ordering product, not a generic delivery app or SaaS dashboard. Editorial typographic hierarchy + sparse rose accents + real food photos. Do not turn every component pink.

## Global
- Canvas `#FCFAF9`, surface white, text `#29262B`, muted `#786C73`, border `#EADCE1`, main rose `#D87898`, deeper action rose `#AF5273`. Validate contrast on actionable controls; adapt text shade when necessary.
- Quicksand body; Fredoka for MANJI FOOD identity + prominent headings sparingly. Use `next/font/google` to avoid layout shift.
- Lucide ONLY for UI icons (`house`, `shopping-basket`, `receipt-text`, `user-round`, `search`, `bell`, `clock-3`, `check`, `qr-code`, `banknote`, `chevron-left`, `plus`, `minus`, `volume-2`, `volume-x`, `package-check`, `settings`, `log-out`, `mail`, `message-circle`). No emoji in any UI or notifications.
- Radius: 12px controls, 16px cards. Borders 1px; sparse shadow. Clear hierarchy, 8px grid spacing. No glassmorphism, animated blobs, extreme gradients, misleading mock data in production.
- Touch targets >=44px, visible focus, overflow safe, 320px min viewport, minimum 16px input type to avoid iOS auto zoom. Sticky bottom action bar not overlapping navbar or safe area.
- Product photos `object-fit: cover`, fixed aspect ratio, graceful local placeholder and alt text. Avoid random web image search in production.

## Student navigation
Bottom anchored nav: Menu / Keranjang / Pesanan / Akun. 4 tabs, each icon + label, active rose outline or ink emphasis. Cart count badge. Header small and practical. Desktop constrain storefront content appropriately rather than stretching four-column SaaS grid.

## Admin
Operations-first: queue tabs with counts and accessible status labels. Each ticket one clear primary next action; secondary menu for more. Desktop sidebar, tablet compact nav, mobile bottom or top nav. Alerts never obscure primary action or make order list inaccessible.

## Microcopy examples
'Pesan untuk istirahat', 'Ambil saat istirahat', 'Keranjangmu kosong', 'Belum ada pesanan', 'Menunggu pembayaran dicek', 'Siap diambil', 'Tunjukkan kode ini ke kantin', 'Pembayaran tunai saat ambil'. Avoid forced slang, generic marketing promises, emoji.

## State contract
Every important page handles: loading, empty, validation error, network outage, permission error, success, retry. Product card sold-out and disabled state. Popup should be accessible and dismissible without marking payment verified. Notification preferences persistent.
