# AGENTS.md — MANJI FOOD

Scope: ONE canteen vendor, ONE pickup location, roles `student` and `admin`. Indonesian UI copy. Mobile first. No kiosk, delivery, table QR, multi-merchant, Midtrans.

## Required reading
1. `START_HERE.md`
2. `docs/READING_ORDER.md`
3. `prompts/MASTER_PROMPT.md`
4. `design/UI_SPEC.md`, `design/TOKENS.json`, `design/SCREENS.md`
5. `docs/ARCHITECTURE.md`, `docs/PAYMENTS_AND_ORDERS.md`, `database/README.md`
6. `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `examples/ACCEPTANCE.md`

## Work discipline
- Audit the repo, inspect its current migrations, routes and dependencies FIRST. Prefer incremental refactoring, not creating a second app.
- Write a short plan and deliver working vertical slices in priority order: auth -> catalog -> cart -> atomic checkout -> queue -> payments -> realtime -> notifications -> ops -> QA.
- Apply migrations in correct order; inspect existing schema and adapt rather than overwriting. No destructive migrations without a migration plan.
- Server-authoritative prices, stock, pickup capacity and state changes. Use transactions, locking and idempotency.
- Static QRIS never proves payment. Student cannot mark payment `paid`; only admin verifies against actual merchant settlement.
- All tables with student records require RLS; never expose service-role key in browser. Distinguish order status from payment status.
- UI: Quicksand + Fredoka, Lucide ONLY. No emoji, no glassmorphism, no gradients, no generic hero banners, no overdecorated AI-slop.
- Make all screens functional and responsive (320, 360, 390, 430, 768, 1024, 1440px). No dummy buttons.
- Test business invariants and role boundaries. Run lint, typecheck, tests, build. Don't claim passes unless run.
- Secrets, QRIS payload, Supabase project ID and brand assets are user-provided; provide secure admin configuration and useful setup guidance, not fabricated values.
- Keep a detailed `IMPLEMENTATION_LOG.md` in repo root: changed files, completed items, tests executed, remaining blockers.
- Never claim Web Push always delivers or that browser sound can auto-play before user interaction.
