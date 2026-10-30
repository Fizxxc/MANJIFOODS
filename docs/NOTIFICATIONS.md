# Notifications and admin chime

Durability: create row in `notifications` in same transaction as important state transition or via reliable outbox. Supabase Realtime updates open clients; reconnect refetches unread count and active orders. Notifications must be visible in app even when push fails.

Admin new-order UI: brief popup with order ID, pickup slot, item summary and action; no forced modal blocking other orders. Unacknowledged order count separate from paid/unpaid status. Sound chime: original three gentle notes (e.g. 523 Hz / 659 Hz / 784 Hz, short decay, total under 1s) generated using Web Audio after explicit admin click to enable sound. Batch bursts, repeat at 20-second interval for unacknowledged orders while tab active, stop on acknowledgement, offer mute, volume, snooze 5 min, quiet mode. Browser autoplay restriction applies; no guaranteed playback when closed or device silent.

Web Push: use standards Push API, Service Worker, server-side `web-push` with VAPID; support subscribe/unsubscribe, multi-device, expired endpoint cleanup, opt-in and iOS installed web app limitations. Permission only from user gesture. Lock-screen text generic: 'Status pesanan MANJI FOOD diperbarui'. Keep detailed data inside authenticated app. Do not send payloads containing class, personal identity or payment proof URLs.
