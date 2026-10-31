import type { SupabaseClient } from "@supabase/supabase-js";

export function subscribeOrderRefresh(
  db: SupabaseClient,
  userId: string,
  refresh: () => void,
  setLive: (live: boolean) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  // Multiple rows/notifications from one commit collapse into one canonical read.
  const invalidate = () => {
    if (!active || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (active) refresh();
    }, 80);
  };
  const channel = db
    // Supabase caches channels by topic. A route change can subscribe before
    // the previous asynchronous unsubscribe finishes; never reuse that topic.
    .channel(`inbox-${userId}-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: "recipient_id=eq." + userId,
      },
      invalidate,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "order_refresh",
        filter: "recipient_id=eq." + userId,
      },
      invalidate,
    )
    .subscribe((status) => {
      if (!active) return;
      setLive(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") invalidate();
    });
  return () => {
    active = false;
    clearTimeout(timer);
    void db.removeChannel(channel);
  };
}
