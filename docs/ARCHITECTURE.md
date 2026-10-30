# Application architecture

Single Next.js App Router project. Browser client (student/admin) talks to authenticated Next.js server operations with Supabase Auth cookies. Server verifies JWT identity and role, validates input with Zod, uses database transactions/RPCs for stock, price, order and payment integrity. Supabase RLS is the final data boundary. Realtime broadcasts only authorized events. Avoid exposing student PII on broad channels.

Suggested structure:
```
src/app/(auth)/...; src/app/(student)/...; src/app/admin/...;
src/app/api/...; src/components/ui/...; src/features/{auth,catalog,cart,checkout,orders,payments,notifications,admin}/...;
src/lib/{supabase,security,notification}/...;
supabase/migrations/...; public/{icons,sounds,images}/...; tests/...
```

Strongly prefer database functions/transactions for checkout and transitions; separate read models vs commands. Use `@supabase/ssr` per current API and ensure cookies refresh. Service-role only for isolated trusted server tasks and only where necessary; never forward service-role key to browser. Storage payment proofs private and accessed via authenticated signed URL routes. Use proper idempotency for checkout, admin verification and push deduplication.

Source of truth: products/prices, inventory, slots, orders, payments are database; frontend can show optimistic cart UI but never override canonical totals. Products out of stock cannot be purchased. Realtime reconnect must refetch canonical state, not rely solely on ephemeral events.

Admin account bootstrap: create student user via auth registration / invitation; privileged server/database operator sets `profiles.role='admin'` securely. Never allow client role edits. One vendor only; no store_id routing required.
