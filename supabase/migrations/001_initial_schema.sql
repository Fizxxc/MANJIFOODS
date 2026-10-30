-- MANJI FOOD initial schema STARTER. Review before applying; see database/README.md.
create extension if not exists pgcrypto;
create type public.user_role as enum ('student','admin');
create type public.payment_method as enum ('cash','qris_static');
create type public.order_state as enum ('pending','confirmed','preparing','ready','completed','cancelled','rejected');
create type public.payment_state as enum ('unpaid','pending_verification','paid','rejected','refunded');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '', class_name text,
 role public.user_role not null default 'student',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.categories (id uuid primary key default gen_random_uuid(), name text not null unique, sort_order int not null default 0, active boolean not null default true);
create table public.products (
 id uuid primary key default gen_random_uuid(), category_id uuid references public.categories(id),
 name text not null, slug text not null unique, description text,
 price_idr integer not null check(price_idr >= 0), stock integer not null default 0 check(stock >= 0),
 image_path text, active boolean not null default true, created_at timestamptz not null default now()
);
create table public.product_variants (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
 name text not null, price_delta_idr integer not null default 0, active boolean not null default true,
 unique(product_id,name)
);
create table public.pickup_slots (
 id uuid primary key default gen_random_uuid(), title text not null,
 starts_at timestamptz not null, ends_at timestamptz not null,
 cutoff_at timestamptz not null, capacity integer not null check(capacity > 0),
 reserved_count integer not null default 0 check(reserved_count >= 0),
 active boolean not null default true, check(starts_at < ends_at),check(reserved_count <= capacity)
);
create table public.carts (id uuid primary key default gen_random_uuid(), student_id uuid not null unique references public.profiles(id) on delete cascade, updated_at timestamptz not null default now());
create table public.cart_items (
 id uuid primary key default gen_random_uuid(), cart_id uuid not null references public.carts(id) on delete cascade,
 product_id uuid not null references public.products(id), variant_id uuid references public.product_variants(id),
 quantity integer not null check(quantity between 1 and 99)
);
create unique index cart_item_identity on public.cart_items(cart_id, product_id, coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table public.orders (
 id uuid primary key default gen_random_uuid(), order_number text not null unique,
 student_id uuid not null references public.profiles(id), pickup_slot_id uuid not null references public.pickup_slots(id),
 status public.order_state not null default 'pending', payment_method public.payment_method not null,
 total_idr integer not null check(total_idr >= 0), pickup_code_hash text not null,
 idempotency_key uuid not null, customer_note text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(student_id, idempotency_key)
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 product_id uuid not null references public.products(id), variant_id uuid references public.product_variants(id),
 product_name_snapshot text not null, variant_name_snapshot text, quantity integer not null check(quantity > 0),
 unit_price_idr integer not null check(unit_price_idr >= 0), line_total_idr integer not null check(line_total_idr >= 0)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id),
 method public.payment_method not null, status public.payment_state not null default 'unpaid',
 amount_idr integer not null check(amount_idr >= 0), verified_by uuid references public.profiles(id), verified_at timestamptz,
 merchant_reference text, admin_note text, created_at timestamptz not null default now()
);
create table public.payment_proofs (
 id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments(id),
 uploaded_by uuid not null references public.profiles(id), storage_path text not null unique,
 created_at timestamptz not null default now()
);
create table public.order_events (
 id bigint generated always as identity primary key, order_id uuid not null references public.orders(id),
 actor_id uuid references public.profiles(id), event_type text not null,
 from_state text, to_state text, note text, created_at timestamptz not null default now()
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id) on delete cascade,
 order_id uuid references public.orders(id), type text not null, title text not null, body text not null,
 read_at timestamptz, created_at timestamptz not null default now()
);
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), student_or_admin_id uuid not null references public.profiles(id) on delete cascade,
 endpoint text not null unique, p256dh text not null, auth_secret text not null, created_at timestamptz not null default now()
);
create table public.app_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
create table public.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id),
 operation text not null, entity_type text not null, entity_id text, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index orders_student_created on public.orders(student_id, created_at desc);
create index orders_status_created on public.orders(status, created_at desc);
create index notifications_recipient_created on public.notifications(recipient_id, created_at desc);
create index events_order_created on public.order_events(order_id, created_at desc);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'::public.user_role);
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Auth signup must never grant admin role from user-controlled metadata.
create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id, full_name, class_name, role)
 values(new.id, coalesce(left(new.raw_user_meta_data->>'full_name',120), ''),
        left(new.raw_user_meta_data->>'class_name',40), 'student'::public.user_role);
 return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.pickup_slots enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.order_events enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;

-- Only expose direct writes where safe. Privileged writes via server-side transactions/RPC.
create policy profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
-- Profile updates must use safe column-scoped RPC/server operation, never raw UPDATE on role.
create policy categories_read on public.categories for select to authenticated using (active or (select public.is_admin()));
create policy products_read on public.products for select to authenticated using (active or (select public.is_admin()));
create policy variants_read on public.product_variants for select to authenticated using (active or (select public.is_admin()));
create policy slots_read on public.pickup_slots for select to authenticated using (active or (select public.is_admin()));
create policy carts_read on public.carts for select to authenticated using (student_id = (select auth.uid()) or (select public.is_admin()));
create policy items_read on public.cart_items for select to authenticated using (exists(select 1 from public.carts c where c.id = cart_id and c.student_id = (select auth.uid())) or (select public.is_admin()));
create policy orders_read on public.orders for select to authenticated using (student_id = (select auth.uid()) or (select public.is_admin()));
create policy order_items_read on public.order_items for select to authenticated using (exists(select 1 from public.orders o where o.id = order_id and (o.student_id = (select auth.uid()) or (select public.is_admin()))));
create policy payments_read on public.payments for select to authenticated using (exists(select 1 from public.orders o where o.id = order_id and (o.student_id = (select auth.uid()) or (select public.is_admin()))));
create policy proofs_read on public.payment_proofs for select to authenticated using (uploaded_by = (select auth.uid()) or (select public.is_admin()));
create policy events_read on public.order_events for select to authenticated using (exists(select 1 from public.orders o where o.id = order_id and (o.student_id = (select auth.uid()) or (select public.is_admin()))));
create policy notifications_read on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy pushes_read on public.push_subscriptions for select to authenticated using (student_or_admin_id = (select auth.uid()));
create policy audit_read on public.audit_logs for select to authenticated using ((select public.is_admin()));
-- No INSERT/UPDATE/DELETE policies for sensitive tables by design. Build audited RPCs and tightly scoped write grants before production.
