# MANJI FOOD — MASTER BUILD PROMPT FOR CODEX

You are a principal full-stack engineer, product designer, database engineer, accessibility reviewer and security engineer. Implement a production-oriented school canteen pre-order service named **MANJI FOOD** in the EXISTING repository. This bundle is the authoritative specification. Do not implement the mock UI alone. Read all files in `docs/READING_ORDER.md` before editing.

## Product
One UMKM school canteen, one seller, one pickup point. Two roles: student and admin. Student picks menu -> cart -> selects school break pickup slot -> checks out -> chooses static merchant QRIS or cash -> gets permanent order ticket -> follows live updates -> picks up and verifies code. No delivery, kiosk, table ordering, branches, other vendors, Midtrans or payment gateway.

## Stack
Next.js App Router + TypeScript strict + React compatible versions + Supabase PostgreSQL/Auth/Storage/Realtime + @supabase/ssr + Tailwind CSS + lucide-react + next/font Google (Quicksand, Fredoka) + Zod + React Hook Form. Web Push via standards-based service worker + server-side push tool such as web-push; verify dependency versions and capabilities first. Vercel deployable. PWA where compatible. Keep one Next.js app, distinct student routes and `/admin`.

## Student
Build functional Indonesian language screens: login, register, forgot/reset password, menu search/filter, menu detail/variants, persistent cart, checkout with pickup slot and payment choice, static QRIS instructions (display server-calculated total and original merchant QR; manual amount input in payment app), upload optional proof privately, cash at pickup, digital ticket, live status timeline, active/completed/cancelled history, reorder at current prices, profile/edit/notification preferences, about/developer contact. Auth persistence through secure Supabase session; remember email only if user opts in, never plaintext password or resurrected session after logout.

## Admin
Landing = operational order board (new, confirmed/preparing, ready, completed), NOT analytics tiles. Authorized order action controls; manual payment verification against merchant incoming settlement, cash collection, pickup code verification, reject/cancel reasons; product/category/photos/availability/stock/variants; pickup windows, capacity, cutoff; store open/pause; QRIS admin config; daily reports and exports. Admin not self-registerable. Never trust UI for authorization.

## Payments & state
Server owns final totals, verified product prices, variant prices and quantities. Save immutable order-item price snapshots. Checkout: transaction + idempotency key + inventory reserve + pickup capacity reserve; roll back on any error. Separate order and payment states. Cash order can be prepared while unpaid; must be collected before completion. QRIS is STATIC: render original string; do not modify to insert amount; payment app typically asks student to enter amount; no automatic verification. Proof image alone is not settlement. Only an authenticated admin can manually mark paid after checking bank/merchant ledger. Handle late payments and refund reconciliation manually via explicit audited flow. Avoid double payment and duplicate revenue.

## Data & security
Follow database starter and augment with safe transactional checkout/transition RPCs or equivalent backend transactions. RLS on all exposed tables. Private proof storage, signed URLs with authorization. Access only own orders, profile, subscriptions. Server-verified admin privilege and SQL helper. Validation, rate limits, input sanitization, file MIME and size restrictions, audit logs. Never expose secrets or sensitive lock-screen notifications. Avoid broad wildcard Realtime subscriptions that leak personal data.

## Notification behavior
Order insert -> durable DB notification -> Realtime updates to admin + popup -> original 3-note gentle sound when unlocked by admin gesture -> configurable reminders while unresolved, muted/snoozed/volume, batch arrivals -> stop when acknowledged. Student receives in-app updates and opt-in Web Push (service worker / VAPID). Support offline/reconnect and push failure. Don't claim audio can work with browser closed or unconsented notifications.

## Visual identity
Read design specs. Soft Editorial Commerce, warm near-white #FCFAF9, blush #F6E5EB, rose #D87898, ink #29262B. Pink restrained. Quicksand for functional UI and Fredoka selectively for brand/heads. Lucide icons only, NO emoji. Solid surfaces, fine borders, 10–16px radius, no liquid glass or gradients, no fake hero promo, no 3D mascot, no excessive rounded pills, no generic dashboard. Student fixed mobile bottom nav: Menu, Keranjang, Pesanan, Akun. Admin compact mobile navigation and sidebar on desktop. WCAG-minded contrasts and tap targets. 320–1440px QA, keyboard support, safe areas.

## Brand
Use replaceable wordmark `MANJI FOOD`, simple temporary icon, favicon/PWA placeholders and original sound. Do not fabricate merchant QR payload. Developer in profile About: Kographh by Fizzxverss; WA 088991114939 (https://wa.me/6288991114939); email fizzxverss@luujaaa.my.id. Avoid prominent storefront developer attribution.

## Complete definition of done
Real persistent flows, correct role restrictions, a functioning admin queue, real status & price persistence, payment verification guarded server-side, durable order history, notifications with graceful fallbacks, usable responsive UI. Implement tests in test plan; run typecheck, lint, test, production build. Write README setup, migrations, env example, deploy/merchant QRIS setup, admin account bootstrap, troubleshooting. Explicitly report anything blocked by unknown Supabase credentials or QRIS payload. Don't simulate features and claim success.

## Work policy
Inspect repository first. Execute changes, not just make a plan. Do not create a new project in a monorepo unless an empty repo truly requires scaffolding. Do not remove user data. Track completed slices in `IMPLEMENTATION_LOG.md`. Continue sequentially until implemented or technical constraints force a documented stop; never report unsupported outcomes.
