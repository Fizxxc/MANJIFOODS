// Run every minute in a trusted scheduler with service-role/VAPID env, never in the browser.
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
];
if (required.some((k) => !process.env[k]))
  throw new Error("Push dispatcher environment is incomplete.");
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: jobs, error } = await db.rpc("claim_push_jobs");
if (error) throw new Error("Unable to claim push jobs.");
const checked = async (promise) => {
  const result = await promise;
  if (result.error) throw new Error("Unable to persist push delivery state.");
  return result;
};
for (const job of jobs) {
  const { data: profile, error: pe } = await db
    .from("profiles")
    .select("notifications_enabled")
    .eq("id", job.recipient_id)
    .single();
  if (pe) throw new Error("Unable to check notification preference.");
  const { data: subs, error: se } = await db
    .from("push_subscriptions")
    .select("*")
    .eq("student_or_admin_id", job.recipient_id);
  if (se) throw new Error("Unable to read subscriptions.");
  let failed = false;
  if (profile.notifications_enabled)
    for (const sub of subs) {
      // Protect the privileged sender from SSRF through direct RPC subscription writes.
      const url = new URL(sub.endpoint);
      const allowed = [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
        "wns.windows.com",
      ];
      if (
        url.protocol !== "https:" ||
        (url.port && url.port !== "443") ||
        !allowed.some(
          (host) => url.hostname === host || url.hostname.endsWith("." + host),
        )
      ) {
        await checked(db.from("push_subscriptions").delete().eq("id", sub.id));
        continue;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_secret },
          },
          JSON.stringify({ id: job.notification_id }),
          { TTL: 300, timeout: 10000 },
        );
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410)
          await checked(
            db.from("push_subscriptions").delete().eq("id", sub.id),
          );
        else failed = true;
      }
    }
  await checked(
    db
      .from("push_outbox")
      .update(
        failed
          ? {
              locked_until: null,
              available_at: new Date(
                Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts),
              ).toISOString(),
              last_error: "delivery_failed",
            }
          : {
              locked_until: null,
              delivered_at: new Date().toISOString(),
              last_error: null,
            },
      )
      .eq("id", job.id),
  );
}
console.log(`Processed ${jobs.length} push jobs. No recipient data logged.`);
