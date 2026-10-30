# Database migration notes

`001_initial_schema.sql` is a deliberately reviewable **schema starter** with core tables, indexes and basic RLS. It is not a complete checkout implementation. Codex MUST compare against existing migrations, fill in atomic checkout/cancel/transition/payment RPCs and apply least-privilege privileges + verified storage bucket policies before calling the app production-ready.

Recommended sequence:
1. Auth profile trigger, `is_admin` SECURITY DEFINER helper, role restrictions.
2. Product, category and pickup session policies.
3. Cart/order/payment/event/notification policies.
4. Server-authoritative checkout RPC with locking, revalidation and idempotency.
5. Transition RPCs including payment, inventory release, pickup-code verification.
6. Private proof storage policies.
7. Test two students plus admin and concurrent checkout.

Never run a blanket DROP on existing production tables. Do not blindly execute this starter on a live DB. Review PostgreSQL grants, schema permissions and SECURITY DEFINER search_path first.
