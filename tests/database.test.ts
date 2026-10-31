import { PGlite, type PGliteInterface } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { crc16, type Session as Slot } from "../src/lib/domain";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  ADMIN = "33333333-3333-4333-8333-333333333333",
  P = "44444444-4444-4444-8444-444444444444",
  S = "55555555-5555-4555-8555-555555555555",
  V = "66666666-6666-4666-8666-666666666666";
let db: PGlite;
let legacyBefore: unknown,
  legacyAfter: unknown,
  legacyPickupBackfilled: boolean;
async function snapshotLegacy() {
  const result: Record<string, unknown> = {};
  for (const table of [
    "orders",
    "order_items",
    "payments",
    "pickup_slots",
    "pickup_tickets",
  ]) {
    result[table] = (
      await db.query(
        `select to_jsonb(t)-'pickup_at'-'session_mode'-'start_key' as record from public.${table} t`,
      )
    ).rows;
  }
  return result;
}
const sql = (name: string) =>
  readFileSync(
    new URL("../supabase/migrations/" + name, import.meta.url),
    "utf8",
  );
async function actor<T>(
  uid: string,
  fn: (tx: Pick<PGliteInterface, "query" | "exec">) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
    return fn(tx);
  });
}
async function cart(uid = A, qty = 1, variant: string | null = null) {
  return actor(uid, (tx) =>
    tx.query("select public.set_cart_item($1,$2,$3)", [P, variant, qty]),
  );
}
async function checkout(
  uid = A,
  method = "cash",
  key = crypto.randomUUID(),
  slot = S,
) {
  const pickup = await scalar(
    "select public.resolve_pickup_at('23:59',clock_timestamp())",
  );
  return actor(
    uid,
    async (tx) =>
      (
        await tx.query<{ id: string }>(
          "select public.checkout_session($1,'23:59',$5,$2,$3,$4) id",
          [slot, method, key, "", pickup],
        )
      ).rows[0].id,
  );
}
async function command(
  id: string,
  action: string,
  uid = ADMIN,
  note = "",
  code = "",
  reference = "",
) {
  return actor(uid, (tx) =>
    tx.query("select public.order_command($1,$2,$3,$4,$5)", [
      id,
      action,
      note,
      code,
      reference,
    ]),
  );
}
async function scalar<T = number>(query: string, args: unknown[] = []) {
  return Object.values((await db.query(query, args)).rows[0] as object)[0] as T;
}
const qris = () => {
  const s =
    "00020101021126080004TEST5204581253033605802ID5904TEST6007JAKARTA6304";
  return s + crc16(new TextEncoder().encode(s));
};
beforeAll(async () => {
  db = new PGlite({
    extensions: { pgcrypto },
  });
  await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
 grant usage on schema storage to authenticated; grant select,insert on storage.objects to authenticated; grant execute on function storage.foldername(text) to authenticated;
 `);
  await db.exec(sql("001_initial_schema.sql"));
  await db.exec(sql("002_operations.sql"));
  // A real pre-003 order, not an empty-schema migration test.
  await db.query("insert into auth.users(id) values($1)", [A]);
  await db.query(
    "insert into public.products(id,name,slug,price_idr,stock) values($1,'Legacy menu','legacy-menu',1000,10)",
    [P],
  );
  await db.query(
    "insert into public.pickup_slots(id,title,starts_at,ends_at,cutoff_at,capacity) values($1,'Legacy session',now()+interval '2 hours',now()+interval '3 hours',now()+interval '1 hour',30)",
    [S],
  );
  await db.exec(
    "update public.app_settings set value=value||'{\"open\":true}' where key='store'",
  );
  await cart();
  await actor(A, (tx) =>
    tx.query("select public.checkout($1,'cash',$2,'')", [
      S,
      crypto.randomUUID(),
    ]),
  );
  legacyBefore = await snapshotLegacy();
  await db.exec(sql("003_manual_sessions.sql"));
  legacyAfter = await snapshotLegacy();
  legacyPickupBackfilled = await scalar<boolean>(
    "select bool_and(o.pickup_at=s.starts_at) from orders o join pickup_slots s on s.id=o.pickup_slot_id",
  );
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "truncate auth.users,public.categories,public.products,public.pickup_slots,storage.objects restart identity cascade;",
  );
  await db.query(
    'insert into auth.users(id,raw_user_meta_data) values($1,\'{"full_name":"Siswa A","role":"admin"}\'),($2,\'{"full_name":"Siswa B"}\'),($3,\'{"full_name":"Admin"}\')',
    [A, B, ADMIN],
  );
  await db.query("update public.profiles set role='admin' where id=$1", [
    ADMIN,
  ]);
  await db.query(
    "insert into public.products(id,name,slug,price_idr,stock) values($1,'Menu tes','menu-tes',12000,10)",
    [P],
  );
  await db.query(
    "insert into public.product_variants(id,product_id,name,price_delta_idr) values($1,$2,'Tambahan tes',2000)",
    [V, P],
  );
  await db.query(
    "insert into public.pickup_slots(id,title,starts_at,ends_at,cutoff_at,capacity,session_mode,start_key) values($1,'Sesi tes',clock_timestamp(),null,null,null,'manual',$2)",
    [S, crypto.randomUUID()],
  );
  await db.query(
    "update public.app_settings set value=jsonb_build_object('open',true,'qris_payload',$1::text,'pickup_location','Lokasi tes','hours','') where key='store'",
    [qris()],
  );
});
describe("actual migrations and RPC invariants in PostgreSQL (PGlite)", () => {
  it("003 preserves every original order/item/payment/session/ticket field and backfills pickup appointments", () => {
    expect(legacyAfter).toEqual(legacyBefore);
    expect(legacyPickupBackfilled).toBe(true);
  });
  it("provides global queue counts only to an admin", async () => {
    await cart();
    await checkout();
    const counts = await actor(ADMIN, (tx) =>
      tx.query<{ counts: { pending: number } }>(
        "select public.admin_queue_counts() counts",
      ),
    );
    expect(counts.rows[0].counts.pending).toBe(1);
    await expect(
      actor(A, (tx) => tx.query("select public.admin_queue_counts()")),
    ).rejects.toThrow("admin");
  });
  it("preserves access to an inactive historical pickup slot for its owner only", async () => {
    await cart();
    await checkout();
    await actor(ADMIN, (tx) => tx.query("select public.session_end($1)", [S]));
    expect(
      (await actor(A, (tx) => tx.query("select id from pickup_slots"))).rows,
    ).toHaveLength(1);
    expect(
      (await actor(B, (tx) => tx.query("select id from pickup_slots"))).rows,
    ).toHaveLength(0);
  });
  it("rejects SQL NULL pickup-code and payment-reference bypasses", async () => {
    await cart();
    const id = await checkout();
    for (const action of ["confirmed", "preparing", "ready"])
      await command(id, action);
    await command(id, "collect_cash");
    await expect(
      actor(ADMIN, (tx) =>
        tx.query("select public.order_command($1,'completed','',null,'')", [
          id,
        ]),
      ),
    ).rejects.toThrow("Isian");
  });
  it("rejects missing mandatory QRIS fields even with a valid checksum", async () => {
    const raw = qris().slice(6, -4);
    const altered = raw + crc16(new TextEncoder().encode(raw));
    expect(
      await scalar<boolean>("select public.valid_static_qris($1)", [altered]),
    ).toBe(false);
  });
  it("reorders atomically at current prices and rejects another student", async () => {
    await cart();
    const id = await checkout();
    await command(id, "cancel", A, "Batal tes");
    await db.exec("update products set price_idr=15000");
    await expect(
      actor(B, (tx) => tx.query("select public.reorder_order($1)", [id])),
    ).rejects.toThrow();
    await actor(A, (tx) => tx.query("select public.reorder_order($1)", [id]));
    const next = await checkout();
    expect(
      await scalar("select total_idr from orders where id=$1", [next]),
    ).toBe(15000);
    expect(await scalar("select total_idr from orders where id=$1", [id])).toBe(
      12000,
    );
  });
  it("ignores admin metadata at signup and denies role escalation", async () => {
    expect(
      await scalar<string>("select role from profiles where id=$1", [A]),
    ).toBe("student");
    await expect(
      actor(A, (tx) =>
        tx.query("update public.profiles set role='admin' where id=$1", [A]),
      ),
    ).rejects.toThrow();
    await expect(
      actor(A, (tx) =>
        tx.query(
          "select public.admin_save('category',null,'{\"name\":\"bad\"}')",
        ),
      ),
    ).rejects.toThrow("admin");
  });
  it("atomically saves canonical variant price, payment, ticket, stock, slot and durable notifications", async () => {
    await cart(A, 2, V);
    const id = await checkout();
    expect(await scalar("select total_idr from orders where id=$1", [id])).toBe(
      28000,
    );
    expect(await scalar("select stock from products where id=$1", [P])).toBe(8);
    expect(
      await scalar("select reserved_count from pickup_slots where id=$1", [S]),
    ).toBe(1);
    expect(
      await scalar("select count(*)::int from payments where order_id=$1", [
        id,
      ]),
    ).toBe(1);
    expect(
      await scalar(
        "select count(*)::int from notifications where order_id=$1",
        [id],
      ),
    ).toBe(2);
    expect(await scalar("select count(*)::int from push_outbox")).toBe(2);
    expect(await scalar("select count(*)::int from cart_items")).toBe(0);
    expect(
      await scalar<string>(
        "select code from pickup_tickets where order_id=$1",
        [id],
      ),
    ).toHaveLength(10);
  });
  it("retries idempotently after cart cleared and store closes", async () => {
    await cart();
    const key = crypto.randomUUID(),
      id = await checkout(A, "cash", key);
    await db.exec("update app_settings set value='{}' where key='store'");
    expect(await checkout(A, "cash", key)).toBe(id);
    expect(await scalar("select count(*)::int from orders")).toBe(1);
    expect(await scalar("select stock from products where id=$1", [P])).toBe(9);
  });
  it("preserves immutable item snapshots when catalog changes", async () => {
    await cart();
    const id = await checkout();
    await db.exec("update products set name='Harga baru',price_idr=99000");
    expect(
      await scalar("select unit_price_idr from order_items where order_id=$1", [
        id,
      ]),
    ).toBe(12000);
    expect(
      await scalar<string>(
        "select product_name_snapshot from order_items where order_id=$1",
        [id],
      ),
    ).toBe("Menu tes");
    await expect(
      actor(A, (tx) =>
        tx.exec("update public.order_items set unit_price_idr=1"),
      ),
    ).rejects.toThrow();
  });
  it("rolls back all reservations on insufficient stock", async () => {
    await cart(A, 11);
    await expect(checkout()).rejects.toThrow("Stok");
    expect(await scalar("select stock from products")).toBe(10);
    expect(await scalar("select reserved_count from pickup_slots")).toBe(0);
    expect(await scalar("select count(*)::int from orders")).toBe(0);
    expect(await scalar("select count(*)::int from cart_items")).toBe(1);
  });
  it("aggregates stock across base and variant lines", async () => {
    await cart(A, 6);
    await cart(A, 6, V);
    await expect(checkout()).rejects.toThrow("Stok");
    expect(await scalar("select stock from products")).toBe(10);
  });
  it("only one competing checkout gets the final unit (serialized engine)", async () => {
    await db.exec("update products set stock=1");
    await cart(A);
    await cart(B);
    const r = await Promise.allSettled([checkout(A), checkout(B)]);
    expect(r.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    expect(await scalar("select stock from products")).toBe(0);
    expect(await scalar("select count(*)::int from orders")).toBe(1);
  });
  it("keeps a manual session open without an artificial pickup capacity", async () => {
    await cart(A);
    await cart(B);
    await checkout(A);
    await checkout(B);
    expect(await scalar("select capacity from pickup_slots")).toBeNull();
    expect(await scalar("select reserved_count from pickup_slots")).toBe(2);
  });
  it.each(["closed", "ended", "inactive", "variant"])(
    "rejects %s without leaving an order",
    async (kind) => {
      await cart(A, 1, V);
      if (kind === "closed")
        await db.exec(
          "update app_settings set value=value||'{\"open\":false}'",
        );
      if (kind === "ended")
        await actor(ADMIN, (tx) =>
          tx.query("select public.session_end($1)", [S]),
        );
      if (kind === "inactive")
        await db.exec("update products set active=false");
      if (kind === "variant")
        await db.exec("update product_variants set active=false");
      await expect(checkout()).rejects.toThrow();
      expect(await scalar("select count(*)::int from orders")).toBe(0);
    },
  );
  it("isolates students across orders, ticket codes, payments, events, notifications, cart and proofs", async () => {
    await cart();
    const id = await checkout();
    for (const table of [
      "orders",
      "order_items",
      "payments",
      "order_events",
      "notifications",
      "pickup_tickets",
      "cart_items",
      "payment_proofs",
    ]) {
      const rows = await actor(B, (tx) =>
        tx.query(
          `select ${table === "orders" ? "id" : "*"} from public.${table}`,
        ),
      );
      expect(rows.rows).toHaveLength(0);
    }
    await expect(
      command(id, "cancel", B, "Attacking another order"),
    ).rejects.toThrow("Pesanan");
    await expect(
      actor(B, (tx) => tx.query("select pickup_code_hash from orders")),
    ).rejects.toThrow();
  });
  it("student claim never marks paid and student cannot verify payment", async () => {
    await cart();
    const id = await checkout(A, "qris_static");
    await command(id, "claim_payment", A);
    expect(await scalar<string>("select status from payments")).toBe(
      "pending_verification",
    );
    await expect(
      command(id, "verify_payment", A, "", "", "REF1"),
    ).rejects.toThrow("admin");
    expect(await scalar<string>("select status from payments")).toBe(
      "pending_verification",
    );
  });
  it("requires unique settlement reference and audits manual verification exactly once", async () => {
    await cart();
    const id = await checkout(A, "qris_static");
    await expect(command(id, "verify_payment")).rejects.toThrow("Referensi");
    await command(
      id,
      "verify_payment",
      ADMIN,
      "Checked actual ledger",
      "",
      "REF1",
    );
    await command(id, "verify_payment", ADMIN, "retry", "", "REF1");
    expect(
      await scalar(
        "select count(*)::int from audit_logs where operation='verify_payment'",
      ),
    ).toBe(1);
    await cart(B);
    const other = await checkout(B, "qris_static");
    await expect(
      command(other, "verify_payment", ADMIN, "", "", "REF1"),
    ).rejects.toThrow();
    expect(
      await scalar<string>("select status from payments where order_id=$1", [
        other,
      ]),
    ).toBe("unpaid");
  });
  it("requires sequential transitions, cash collection and valid pickup code", async () => {
    await cart();
    const id = await checkout();
    await expect(command(id, "ready")).rejects.toThrow("Urutan");
    for (const action of ["confirmed", "preparing", "ready"])
      await command(id, action);
    const code = await scalar<string>(
      "select code from pickup_tickets where order_id=$1",
      [id],
    );
    await expect(command(id, "completed", ADMIN, "", code)).rejects.toThrow(
      "lunas",
    );
    await command(id, "collect_cash");
    await expect(
      command(id, "completed", ADMIN, "", "WRONGCODE1"),
    ).rejects.toThrow("kode");
    await command(id, "completed", ADMIN, "", code);
    await command(id, "completed", ADMIN, "", code);
    expect(await scalar<string>("select status from orders")).toBe("completed");
    expect(
      await scalar(
        "select count(*)::int from order_events where event_type='completed'",
      ),
    ).toBe(1);
  });
  it("cancel releases stock and capacity exactly once and cannot cancel in kitchen", async () => {
    await cart(A, 2);
    const id = await checkout();
    await command(id, "cancel", A, "Tidak jadi");
    await command(id, "cancel", A, "retry");
    expect(await scalar("select stock from products")).toBe(10);
    expect(await scalar("select reserved_count from pickup_slots")).toBe(0);
    await cart();
    const next = await checkout();
    await command(next, "confirmed");
    await command(next, "preparing");
    await expect(command(next, "cancel", A, "Tidak jadi")).rejects.toThrow(
      "persiapan",
    );
  });
  it("requires reconciliation before cancelling paid QRIS and supports audited real refund", async () => {
    await cart();
    const id = await checkout(A, "qris_static");
    await command(id, "verify_payment", ADMIN, "", "", "REF2");
    await expect(command(id, "cancel", A, "Tidak jadi")).rejects.toThrow(
      "rekonsiliasi",
    );
    await expect(
      command(id, "refund", ADMIN, "too short", "", "RF1"),
    ).rejects.toThrow();
    await command(id, "refund", ADMIN, "Refund actually executed", "", "RF1");
    await command(id, "cancel", ADMIN, "Setelah pengembalian dana");
    expect(await scalar<string>("select status from payments")).toBe(
      "refunded",
    );
  });
  it("rejects negative or invalid quantity and variant from another product", async () => {
    await expect(cart(A, 0)).resolves.toBeDefined();
    await expect(cart(A, -1)).rejects.toThrow();
    await expect(cart(A, 100)).rejects.toThrow();
    await db.exec(
      `insert into products(name,slug,price_idr,stock) values('Other','other',1,1);update product_variants set product_id=(select id from products where slug='other')`,
    );
    await expect(cart(A, 1, V)).rejects.toThrow("Varian");
  });
  it("validates static QRIS again at the database boundary", async () => {
    expect(
      await scalar<boolean>("select public.valid_static_qris($1)", [qris()]),
    ).toBe(true);
    await expect(
      actor(ADMIN, (tx) =>
        tx.query("select public.save_store(true,$1,$2,$3)", [
          "Kantin",
          "",
          "fabricated",
        ]),
      ),
    ).rejects.toThrow("QRIS");
    await expect(
      actor(A, (tx) =>
        tx.query("select public.save_store(true,$1,$2,$3)", ["Kantin", "", ""]),
      ),
    ).rejects.toThrow("admin");
  });
  it("makes proof storage private and prevents cross-student inserts/reads", async () => {
    await cart();
    const id = await checkout(A, "qris_static"),
      path = A + "/" + id + "/proof.png";
    await actor(A, (tx) =>
      tx.query(
        "insert into storage.objects(bucket_id,name) values('payment-proofs',$1)",
        [path],
      ),
    );
    await actor(A, (tx) =>
      tx.query("select public.attach_proof($1,$2)", [id, path]),
    );
    expect(
      (await actor(B, (tx) => tx.query("select * from storage.objects"))).rows,
    ).toHaveLength(0);
    expect(
      (await actor(ADMIN, (tx) => tx.query("select * from storage.objects")))
        .rows,
    ).toHaveLength(1);
    await expect(
      actor(B, (tx) =>
        tx.query(
          "insert into storage.objects(bucket_id,name) values('payment-proofs',$1)",
          [path + "x"],
        ),
      ),
    ).rejects.toThrow();
    expect(
      await scalar<boolean>(
        "select public from storage.buckets where id='payment-proofs'",
      ),
    ).toBe(false);
    expect(await scalar<string>("select status from payments")).toBe("unpaid");
  });
  it("disables push, preserves inbox, and never exposes endpoint secrets", async () => {
    await cart();
    await checkout();
    await expect(
      actor(A, (tx) => tx.query("select * from public.push_subscriptions")),
    ).rejects.toThrow();
    await actor(A, (tx) =>
      tx.query("select public.update_profile($1,$2,false)", ["Name", "Class"]),
    );
    expect(
      await scalar(
        "select count(*)::int from notifications where recipient_id=$1",
        [A],
      ),
    ).toBe(1);
    expect(
      await scalar(
        "select count(*)::int from push_outbox where recipient_id=$1 and delivered_at is null",
        [A],
      ),
    ).toBe(0);
    await expect(
      actor(A, (tx) => tx.exec("select public.claim_push_jobs()")),
    ).rejects.toThrow();
  });
  it("restricts helper execution, direct sensitive writes and enforces per-user throttle", async () => {
    await expect(
      actor(A, (tx) =>
        tx.exec("select public.emit_notification(null,null,'x','x','x')"),
      ),
    ).rejects.toThrow();
    await expect(
      actor(A, (tx) => tx.exec("update public.payments set status='paid'")),
    ).rejects.toThrow();
    await actor(A, (tx) =>
      tx.exec("select public.consume_rate_limit() from generate_series(1,90)"),
    );
    await expect(
      actor(A, (tx) => tx.exec("select public.consume_rate_limit()")),
    ).rejects.toThrow("Terlalu");
  });
  it("rejects the removed date-based session mutation path", async () => {
    await cart();
    await checkout();
    const slot = (await db.query<Slot>("select * from pickup_slots")).rows[0];
    await expect(
      actor(ADMIN, (tx) =>
        tx.query("select public.admin_save('slot',$1,$2::jsonb)", [
          S,
          JSON.stringify({
            ...slot,
            starts_at: new Date(Date.now() + 9e6).toISOString(),
          }),
        ]),
      ),
    ).rejects.toThrow("Start Session");
  });

  it("only admins start/end sessions and old checkout/private helpers cannot be invoked by students", async () => {
    for (const statement of [
      "select public.session_start(gen_random_uuid())",
      `select public.session_end('${S}')`,
      `select public.checkout('${S}','cash',gen_random_uuid(),'')`,
      "select public.resolve_pickup_at('09:30',clock_timestamp())",
      "select public.admin_save_legacy('slot',null,'{}')",
    ])
      await expect(actor(A, (tx) => tx.exec(statement))).rejects.toThrow();
  });

  it("keeps authorized category/product/variant editing working through the guarded catalog wrapper", async () => {
    const save = (kind: string, id: string | null, data: unknown) =>
      actor(
        ADMIN,
        async (tx) =>
          (
            await tx.query<{ id: string }>(
              "select public.admin_save($1,$2,$3::jsonb) id",
              [kind, id, JSON.stringify(data)],
            )
          ).rows[0].id,
      );
    const category = await save("category", null, {
      name: "Kategori baru",
      sort_order: 1,
      active: true,
    });
    await save("product", P, {
      name: "Menu diperbarui",
      slug: "menu-diperbarui",
      description: "",
      category_id: category,
      price_idr: 13000,
      stock: 10,
      image_path: "",
      active: true,
    });
    await save("variant", V, {
      product_id: P,
      name: "Varian diperbarui",
      price_delta_idr: 3000,
      active: true,
    });
    expect(await scalar("select name from products where id=$1", [P])).toBe(
      "Menu diperbarui",
    );
    expect(
      await scalar("select category_id from products where id=$1", [P]),
    ).toBe(category);
    expect(
      await scalar("select price_delta_idr from product_variants where id=$1", [
        V,
      ]),
    ).toBe(3000);
  });
  it("start/end are retry safe and only one manual session can be open", async () => {
    await actor(ADMIN, (tx) => tx.query("select public.session_end($1)", [S]));
    const key = crypto.randomUUID();
    const start = (key: string) =>
      actor(
        ADMIN,
        async (tx) =>
          (
            await tx.query<{ id: string }>(
              "select public.session_start($1) id",
              [key],
            )
          ).rows[0].id,
      );
    const ids = await Promise.all([start(key), start(crypto.randomUUID())]);
    expect(ids[0]).toBe(ids[1]);
    expect(
      await scalar(
        "select count(*)::int from pickup_slots where session_mode='manual' and ends_at is null",
      ),
    ).toBe(1);
    expect(await start(key)).toBe(ids[0]);
    await expect(
      db.query(
        "insert into pickup_slots(title,starts_at,ends_at,cutoff_at,capacity,active,session_mode,start_key) values('illegal',clock_timestamp(),null,null,null,true,'manual',gen_random_uuid())",
      ),
    ).rejects.toThrow();
    await actor(ADMIN, (tx) =>
      tx.query("select public.session_end($1)", [ids[0]]),
    );
    const fresh = await start(crypto.randomUUID());
    expect(fresh).not.toBe(ids[0]);
    await actor(ADMIN, (tx) =>
      tx.query("select public.session_end($1)", [ids[0]]),
    );
    expect(await start(key)).toBe(ids[0]); // replay cannot reopen an ended session
    expect(
      await scalar(
        "select (value->>'open')::boolean from app_settings where key='store'",
      ),
    ).toBe(true);
    expect(
      await scalar("select active from pickup_slots where id=$1", [fresh]),
    ).toBe(true);
  });

  it("records server lifecycle timestamps and keeps sessions open for multiple days", async () => {
    await db.exec(
      "update pickup_slots set starts_at=clock_timestamp()-interval '3 days' where session_mode='manual'",
    );
    await cart();
    const id = await checkout();
    expect(
      await scalar("select ends_at from pickup_slots where id=$1", [S]),
    ).toBeNull();
    expect(
      await scalar(
        "select pickup_at>clock_timestamp() from orders where id=$1",
        [id],
      ),
    ).toBe(true);
    const before = await scalar<string>("select clock_timestamp()::text");
    await actor(ADMIN, (tx) => tx.query("select public.session_end($1)", [S]));
    expect(
      await scalar(
        "select ends_at >= $1::timestamptz and ends_at <= clock_timestamp() from pickup_slots where id=$2",
        [before, S],
      ),
    ).toBe(true);
    expect(
      await scalar(
        "select count(*)::int from audit_logs where operation='session_end'",
      ),
    ).toBe(1);
  });

  it("ending a session blocks new orders but preserves existing orders, payment, reservations and pickup timestamp", async () => {
    await cart();
    const id = await checkout();
    const before = await snapshotLegacy();
    const pickup = await scalar("select pickup_at from orders where id=$1", [
      id,
    ]);
    await actor(ADMIN, (tx) => tx.query("select public.session_end($1)", [S]));
    const after = await snapshotLegacy();
    expect((after as Record<string, unknown>).orders).toEqual(
      (before as Record<string, unknown>).orders,
    );
    expect((after as Record<string, unknown>).payments).toEqual(
      (before as Record<string, unknown>).payments,
    );
    expect((after as Record<string, unknown>).order_items).toEqual(
      (before as Record<string, unknown>).order_items,
    );
    expect(
      await scalar("select pickup_at from orders where id=$1", [id]),
    ).toEqual(pickup);
    await cart(B);
    await expect(checkout(B)).rejects.toThrow();
    await command(id, "confirmed");
    await command(id, "preparing");
    await command(id, "ready");
    await command(id, "collect_cash");
    const code = await scalar<string>(
      "select code from pickup_tickets where order_id=$1",
      [id],
    );
    await command(id, "completed", ADMIN, "", code);
    expect(await scalar("select status from orders where id=$1", [id])).toBe(
      "completed",
    );
  });

  it.each([
    ["2026-10-30T16:58:00Z", "00:05", "2026-10-30T17:05:00.000Z"],
    ["2026-10-30T17:01:00Z", "00:05", "2026-10-30T17:05:00.000Z"],
    ["2026-10-30T02:30:15Z", "09:30", "2026-10-31T02:30:00.000Z"],
    ["2026-10-30T02:30:15Z", "09:31", "2026-10-30T02:31:00.000Z"],
  ])("resolves HH:mm in Asia/Jakarta at %s", async (base, time, expected) => {
    for (const zone of ["UTC", "America/New_York", "Asia/Tokyo"]) {
      await db.exec(`set timezone='${zone}'`);
      const stamp = await scalar<string>(
        "select public.resolve_pickup_at($1,$2)::text",
        [time, base],
      );
      expect(new Date(stamp).toISOString()).toBe(expected);
    }
    await db.exec("set timezone='UTC'");
  });

  it.each([null, "24:00", "09:60", "9:30", "09:30:00", "2030-01-01T09:30", ""])(
    "rejects invalid pickup input %s in SQL",
    async (value) => {
      await expect(
        db.query("select public.resolve_pickup_at($1,clock_timestamp())", [
          value,
        ]),
      ).rejects.toThrow("HH:mm");
    },
  );

  it("previews pickup timestamps on the server and rejects date tampering without reserving anything", async () => {
    const preview = await actor(
      A,
      async (tx) =>
        (
          await tx.query<{ value: { session_id: string; pickup_at: string } }>(
            "select public.pickup_time_preview('23:59') value",
          )
        ).rows[0].value,
    );
    expect(preview.session_id).toBe(S);
    await cart();
    await expect(
      actor(A, (tx) =>
        tx.query("select public.checkout_session($1,'23:59',$2,'cash',$3,'')", [
          S,
          new Date(Date.parse(preview.pickup_at) + 86400000).toISOString(),
          crypto.randomUUID(),
        ]),
      ),
    ).rejects.toThrow("Jam pengambilan berubah");
    expect(await scalar("select count(*)::int from orders")).toBe(0);
    expect(await scalar("select stock from products")).toBe(10);
    expect(await scalar("select reserved_count from pickup_slots")).toBe(0);
    await checkout();
    expect(
      await scalar(
        "select count(*)::int from orders where pickup_at is not null",
      ),
    ).toBe(1);
  });
});
