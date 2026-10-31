# Payment and order state machines

## Student checkout
1. Authenticated checkout contains the current manual session ID, pickup HH:mm, server preview timestamp, payment method, note and idempotency key. **No trusted totals/prices or client date.**
2. In one DB transaction: lock store/session/products, require an open manual session, check visibility/stock/quantity, resolve the next HH:mm occurrence in Asia/Jakarta after waiting locks and compare with the preview; calculate prices from DB; reserve stock and record the session order count; insert order/pickup_at, immutable order_items and payment; record events; commit. Session start/end and data migration follow [SESSIONS.md](SESSIONS.md); there is no scheduled cutoff or automatic closure.
3. Return server-generated order ID and payment instructions.
4. Client sees persistent ticket even if later navigation or browser closes. Retried requests with same user/idempotency key return original order.

## Payment
- `cash`: payment `unpaid` at checkout. Admin may prepare; must record cash before completed.
- `qris_static`: show QR rendering original merchant-provided static payload. User must type exact displayed amount in bank app; cannot force amount through static QR. Optional receipt screenshot is untrusted and only supports manual review. Mark `pending_verification` after student claims paid. Admin verifies merchant settlement (amount, time, reference, double-claim) before marking `paid` and auditing who/when. Admin can reject suspected failed payment with reason. Do not mark automatically.
- Expiry means payment instructions/order can expire per policy; if a late payment comes in, admin manual reconciliation/refund is necessary. Never silently retain funds or mark refund without actual execution.

## Distinct order states
`pending -> confirmed -> preparing -> ready -> completed` and `cancelled` / `rejected` terminal states. Validate all transitions server-side. Payment states: `unpaid`, `pending_verification`, `paid`, `rejected`, `refunded`. Payment state is NOT automatically coupled to preparation.

## Invariants
- Immutable item-price snapshots and order final total.
- Order completion requires validated pickup code and `paid` or recorded cash collection.
- No client-side payment status update rights.
- Only authorized admin server function verifies payment; transactional transition with conditional old state and idempotency.
- Stock reservation release for cancelled/rejected before kitchen work per explicit policy, never double release.
- Do not count unpaid QRIS orders as paid revenue.
- Audit every admin action, including cash collection and rejected payments.
