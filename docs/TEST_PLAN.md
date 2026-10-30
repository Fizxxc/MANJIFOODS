# Test and release plan

Unit: product base+variant total, zero/negative qty, discounts if introduced, immutable snapshot, pickup cutoff, slot capacity, allowed state transitions, QRIS payload validation.
Integration: session handling; RLS student-user isolation; admin permissions; checkout atomicity/idempotency; stock race; payment manual verification; cash completion; cancel/restock; notification row persistence; storage access control.
E2E: register/login/logout/recovery; menu-search-cart-checkout; QRIS manual flow; cash flow; admin queue status update; student ticket refresh and history; proof upload; sold-out, closed vendor and no slot; duplicate click; realtime reconnect.
Security: forged low price, role escalation, other student's order ID, invalid pickup code, double payment verification, CSRF where applicable, large non-image upload, public proof URLs.
Visual QA: 320/360/375/390/430/768/1024/1440px, light/dark browser/system preferences (app may use light-only consistent palette), notch safe area, keyboard focus, color contrast, no horizontal overflow, text zoom 200%, voiceover labels, reduced motion.
Release: run lint, typecheck, unit/integration tests, E2E if environment supports, production build. Report actual execution and blockers. Verify Vercel env, Supabase RLS, Auth redirect URLs, VAPID keys, domain HTTPS, admin initialization, genuine static QRIS string, and merchant settlement procedure.
