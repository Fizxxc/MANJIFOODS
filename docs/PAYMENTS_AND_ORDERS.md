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

## Read contract and QRIS recovery

`payments.order_id` is a UNIQUE foreign key: PostgREST embeds `payments` as an object or null, despite the plural relationship name. `src/lib/order-response.ts` normalizes that relationship to **`Payment[]` with zero or one validated record** before proof lookup, JSON serialization, React rendering and CSV export. Legacy array transports remain accepted. Missing records become an empty collection and a visible unavailable state, never an invented `unpaid` payment. Invalid statuses/amounts, duplicate relationship records or payment/order method/total mismatches fail safely without changing database state. React validates the HTTP read model as well.

`GET /api/data` accepts `page` as an integer 0–10000 (default 0), optional `order` UUID, `active=0|1` and `group=pending|preparing|ready`. Explicit order lookup ignores pagination. Invalid/duplicate parameters return 400 `INVALID_QUERY`; a missing or RLS-hidden order returns the same 404 `ORDER_NOT_FOUND`; unavailable/invalid provider data returns a sanitized 503 `DATA_UNAVAILABLE`. Authentication remains 401 and admin-only access remains 403. Responses are private/no-store. All queries use the authenticated user's SSR client and existing RLS; student orders also have an explicit owner filter.

Static QRIS is loaded from the existing Supabase `app_settings.store.qris_payload`, validated for TLV/static IDR format and CRC, then encoded verbatim into a PNG with a quiet zone. No order amount is inserted. The separate displayed/copyable amount is the persisted, server-calculated order total. Students must enter that amount and confirm the merchant in their payment app; only admin checks actual receipt and verifies payment. QR loading, rendering failure and retry do not submit any financial command. Changed payloads cannot leave an old QR image visible. Paid/refunded orders do not prompt a second payment. QRIS editing remains admin-only.

This rendering fix requires **no database migration or data repair**. Do not reset the database, recreate payments, replay checkout with a new idempotency key, or change payment statuses to recover a failed display. Deploy the matching application build, reload existing tickets and reconcile actual merchant receipts through the existing audited admin flow. The merchant setting is current configuration, not a per-order payload snapshot; configuration changes affecting old unpaid tickets still require operational care.
