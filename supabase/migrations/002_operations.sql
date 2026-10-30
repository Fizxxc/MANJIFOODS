-- Additive completion of the reviewed starter. Fresh projects: apply 001 then 002.
-- Existing deployments: inspect schema differences before applying either file.
alter table public.profiles add column notifications_enabled boolean not null default true;
alter table public.orders add column acknowledged_at timestamptz;
alter table public.orders add column inventory_released boolean not null default false;
create sequence public.order_number_seq;
revoke all on sequence public.order_number_seq from anon,authenticated;
create table public.pickup_tickets (
 order_id uuid primary key references public.orders(id), student_id uuid not null references public.profiles(id), code text not null
);
alter table public.pickup_tickets enable row level security;
create policy ticket_owner on public.pickup_tickets for select to authenticated using(student_id=auth.uid());
create table public.rate_limits (identity text not null, bucket bigint not null, hits int not null default 1, primary key(identity,bucket));
alter table public.rate_limits enable row level security;
create table public.push_outbox (
 id uuid primary key default gen_random_uuid(), notification_id uuid not null unique references public.notifications(id),
 recipient_id uuid not null references public.profiles(id), attempts int not null default 0,
 available_at timestamptz not null default now(), locked_until timestamptz, delivered_at timestamptz, last_error text
);
alter table public.push_outbox enable row level security;
create unique index merchant_reference_unique on public.payments(merchant_reference) where merchant_reference is not null;
alter table public.pickup_slots add constraint cutoff_before_start check(cutoff_at <= starts_at);
alter table public.products add constraint product_price_limit check(price_idr <= 10000000);
alter table public.product_variants add constraint variant_delta_limit check(price_delta_idr between -10000000 and 10000000);
insert into public.app_settings(key,value) values('store','{"open":false,"pickup_location":"Kantin MANJI FOOD","hours":"","qris_payload":""}');
create policy settings_read on public.app_settings for select to authenticated using(key='store');
create policy slots_history_read on public.pickup_slots for select to authenticated using(exists(select 1 from public.orders o where o.pickup_slot_id=pickup_slots.id and o.student_id=auth.uid()));

-- Browser clients can only SELECT RLS-filtered data. Every mutation goes through a bounded RPC.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.categories, public.products, public.product_variants, public.pickup_slots,
 public.carts,public.cart_items,public.orders,public.order_items,public.payments,public.payment_proofs,
 public.order_events,public.notifications,public.app_settings,public.audit_logs,public.pickup_tickets to authenticated;
revoke select on public.orders from authenticated;
grant select(id,order_number,student_id,pickup_slot_id,status,payment_method,total_idr,idempotency_key,customer_note,created_at,updated_at,acknowledged_at,inventory_released) on public.orders to authenticated;
-- Push endpoint credentials are intentionally not readable even by the owning browser.

create function public.require_actor(admin_only boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Silakan masuk kembali.' using errcode='42501'; end if;
 if admin_only and not public.is_admin() then raise exception 'Akses admin diperlukan.' using errcode='42501'; end if;
 return auth.uid();
end $$;

create function public.consume_rate_limit() returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor(); b bigint:=floor(extract(epoch from now())/60); n int;
begin
 insert into public.rate_limits(identity,bucket) values(u::text,b) on conflict(identity,bucket) do update set hits=public.rate_limits.hits+1 returning hits into n;
 if n>90 then raise exception 'Terlalu banyak permintaan. Coba sebentar lagi.'; end if;
 delete from public.rate_limits where bucket<b-10;
end $$;

create function public.emit_notification(recipient uuid, oid uuid, kind text, heading text, message text) returns void
language plpgsql security definer set search_path='' as $$
declare nid uuid;
begin
 insert into public.notifications(recipient_id,order_id,type,title,body) values(recipient,oid,kind,heading,message) returning id into nid;
 if exists(select 1 from public.profiles where id=recipient and notifications_enabled) then
  insert into public.push_outbox(notification_id,recipient_id) values(nid,recipient);
 end if;
end $$;

create function public.update_profile(p_name text,p_class text,p_notifications boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_actor();
 if length(trim(p_name)) not between 1 and 120 or length(p_class)>40 then raise exception 'Nama atau kelas tidak valid.'; end if;
 update public.profiles set full_name=trim(p_name),class_name=trim(p_class),notifications_enabled=p_notifications,updated_at=now() where id=auth.uid();
 if not p_notifications then
  delete from public.push_subscriptions where student_or_admin_id=auth.uid();
  update public.push_outbox set delivered_at=now(),last_error='opted_out' where recipient_id=auth.uid() and delivered_at is null;
 end if;
end $$;

create function public.set_cart_item(p_product uuid,p_variant uuid,p_quantity int) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor(); cid uuid;
begin
 if p_quantity is null or p_quantity not between 0 and 99 then raise exception 'Jumlah harus 0–99.'; end if;
 perform 1 from public.profiles where id=u for no key update;
 if not exists(select 1 from public.products p where p.id=p_product and p.active) then raise exception 'Menu tidak tersedia.'; end if;
 if p_variant is not null and not exists(select 1 from public.product_variants where id=p_variant and product_id=p_product and active) then raise exception 'Varian tidak tersedia.'; end if;
 insert into public.carts(student_id) values(u) on conflict(student_id) do update set updated_at=now() returning id into cid;
 delete from public.cart_items where cart_id=cid and product_id=p_product and variant_id is not distinct from p_variant;
 if p_quantity>0 then
  if (select count(*) from public.cart_items where cart_id=cid)>=40 then raise exception 'Maksimal 40 pilihan menu.'; end if;
  insert into public.cart_items(cart_id,product_id,variant_id,quantity) values(cid,p_product,p_variant,p_quantity);
 end if;
end $$;

create function public.remove_cart_item(p_item uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor();
begin
 perform 1 from public.profiles where id=u for no key update;
 delete from public.cart_items where id=p_item and cart_id in(select id from public.carts where student_id=u);
end $$;

create function public.checkout(p_slot uuid,p_method public.payment_method,p_key uuid,p_note text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor(); oid uuid; cid uuid; s public.pickup_slots; r record; total bigint:=0; code text; cfg jsonb; ticket_n text;
begin
 -- Per-user lock serializes cart changes and idempotent retries across app instances.
 perform 1 from public.profiles where id=u for no key update;
 select id into oid from public.orders where student_id=u and idempotency_key=p_key;
 if oid is not null then return oid; end if;
 if p_key is null or p_method is null or p_slot is null or length(p_note)>300 then raise exception 'Data checkout tidak valid.'; end if;
 select value into cfg from public.app_settings where key='store' for share;
 if not coalesce((cfg->>'open')::boolean,false) then raise exception 'Kantin sedang tutup.'; end if;
 if p_method='qris_static' and coalesce(cfg->>'qris_payload','')='' then raise exception 'QRIS belum dikonfigurasi. Pilih tunai.'; end if;
 select * into s from public.pickup_slots where id=p_slot for update;
 if s.id is null or not s.active or s.cutoff_at<=clock_timestamp() or s.reserved_count>=s.capacity then raise exception 'Sesi penuh atau batas pesan sudah lewat.'; end if;
 select id into cid from public.carts where student_id=u;
 if not exists(select 1 from public.cart_items where cart_id=cid) then raise exception 'Keranjangmu kosong.'; end if;
 -- Deterministic product lock order prevents cross-cart deadlocks. Variants are locked too.
 perform 1 from public.products where id in(select product_id from public.cart_items where cart_id=cid) order by id for update;
 perform 1 from public.product_variants where id in(select variant_id from public.cart_items where cart_id=cid) order by id for share;
 for r in select p.id,p.stock,p.active,sum(i.quantity) qty from public.cart_items i join public.products p on p.id=i.product_id where i.cart_id=cid group by p.id loop
  if not r.active or r.qty>r.stock then raise exception 'Stok menu berubah. Periksa keranjang.'; end if;
 end loop;
 for r in select i.*,p.price_idr,p.name,p.category_id,v.name vn,v.price_delta_idr,v.active va,v.product_id vp from public.cart_items i join public.products p on p.id=i.product_id left join public.product_variants v on v.id=i.variant_id where i.cart_id=cid loop
  if r.category_id is not null and not exists(select 1 from public.categories where id=r.category_id and active) then raise exception 'Kategori tidak tersedia.'; end if;
  if r.variant_id is not null and (not coalesce(r.va,false) or r.vp<>r.product_id) then raise exception 'Varian tidak tersedia.'; end if;
  if r.price_idr+coalesce(r.price_delta_idr,0)<0 then raise exception 'Harga varian tidak valid.'; end if;
  total:=total+(r.price_idr+coalesce(r.price_delta_idr,0))*r.quantity;
 end loop;
 if total>100000000 then raise exception 'Total pesanan terlalu besar.'; end if;
 oid:=gen_random_uuid(); code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 ticket_n:=nextval('public.order_number_seq')::text;
 insert into public.orders(id,order_number,student_id,pickup_slot_id,payment_method,total_idr,pickup_code_hash,idempotency_key,customer_note)
 values(oid,'MF-'||to_char(now() at time zone 'Asia/Jakarta','YYYYMMDD')||'-'||lpad(ticket_n,greatest(6,length(ticket_n)),'0'),u,p_slot,p_method,total,encode(sha256(convert_to(oid::text||code,'UTF8')),'hex'),p_key,trim(p_note));
 insert into public.pickup_tickets values(oid,u,code);
 insert into public.order_items(order_id,product_id,variant_id,product_name_snapshot,variant_name_snapshot,quantity,unit_price_idr,line_total_idr)
 select oid,i.product_id,i.variant_id,p.name,v.name,i.quantity,p.price_idr+coalesce(v.price_delta_idr,0),(p.price_idr+coalesce(v.price_delta_idr,0))*i.quantity
 from public.cart_items i join public.products p on p.id=i.product_id left join public.product_variants v on v.id=i.variant_id where cart_id=cid;
 update public.products p set stock=p.stock-x.qty from(select product_id,sum(quantity)::int qty from public.cart_items where cart_id=cid group by product_id)x where p.id=x.product_id;
 update public.pickup_slots set reserved_count=reserved_count+1 where id=p_slot;
 insert into public.payments(order_id,method,amount_idr) values(oid,p_method,total);
 insert into public.order_events(order_id,actor_id,event_type,to_state) values(oid,u,'order_created','pending');
 perform public.emit_notification(u,oid,'order_created','Pesanan diterima','Tiket pesananmu sudah tersimpan.');
 for r in select id from public.profiles where role='admin' loop
  perform public.emit_notification(r.id,oid,'new_order','Pesanan baru','Buka antrean untuk memeriksa pesanan.');
 end loop;
 delete from public.cart_items where cart_id=cid;
 return oid;
end $$;

create function public.order_command(p_order uuid,p_action text,p_note text default '',p_code text default '',p_reference text default '') returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor(); o public.orders; pay public.payments; next_state public.order_state; admin boolean:=public.is_admin(); r record;
begin
 select * into o from public.orders where id=p_order for update;
 if o.id is null or (o.student_id<>u and not admin) then raise exception 'Pesanan tidak ditemukan.' using errcode='42501'; end if;
 select * into pay from public.payments where order_id=o.id for update;
 if p_note is null or p_code is null or p_reference is null or length(p_note)>500 or length(p_reference)>120 or length(p_code)>20 then raise exception 'Isian tindakan tidak valid.'; end if;
 if p_action='claim_payment' then
  if o.student_id<>u or o.payment_method<>'qris_static' or o.status in('cancelled','rejected','completed') then raise exception 'Pembayaran tidak dapat diajukan.'; end if;
  if pay.status='paid' or pay.status='pending_verification' then return; end if;
  if pay.status not in('unpaid','rejected') then raise exception 'Status pembayaran tidak valid.'; end if;
  update public.payments set status='pending_verification' where id=pay.id;
  for r in select id from public.profiles where role='admin' loop perform public.emit_notification(r.id,o.id,'payment_claim','Periksa pembayaran','Cocokkan dengan mutasi merchant yang sebenarnya.'); end loop;
 elsif p_action='cancel' then
  if o.student_id<>u and not admin then raise exception 'Akses ditolak.'; end if;
  if o.status='cancelled' then return; end if;
  if o.status not in('pending','confirmed') or length(trim(p_note))<3 then raise exception 'Pembatalan hanya sebelum persiapan dan perlu alasan.'; end if;
  if pay.status in('paid','pending_verification') then raise exception 'Minta admin merekonsiliasi pembayaran sebelum pembatalan.'; end if;
  next_state:='cancelled';
 else
  perform public.require_actor(true);
  if p_action='acknowledge' then
   if o.acknowledged_at is not null then return; end if;
   update public.orders set acknowledged_at=coalesce(acknowledged_at,now()) where id=o.id;
  elsif p_action in('verify_payment','collect_cash') then
   if (p_action='collect_cash')<>(o.payment_method='cash') then raise exception 'Metode pembayaran tidak sesuai.'; end if;
   if o.payment_method='qris_static' and length(trim(p_reference))<3 then raise exception 'Referensi mutasi merchant wajib diisi.'; end if;
   if o.status in('cancelled','rejected') and length(trim(p_note))<10 then raise exception 'Pembayaran terlambat perlu catatan rekonsiliasi.'; end if;
   if pay.status='paid' then return; end if;
   if pay.status='refunded' then raise exception 'Pembayaran telah dikembalikan.'; end if;
   update public.payments set status='paid',verified_by=u,verified_at=now(),merchant_reference=nullif(trim(p_reference),''),admin_note=trim(p_note) where id=pay.id;
  elsif p_action='reject_payment' then
   if pay.status not in('unpaid','pending_verification','rejected') or length(trim(p_note))<3 then raise exception 'Perlu pembayaran belum lunas dan alasan penolakan.'; end if;
   update public.payments set status='rejected',admin_note=trim(p_note) where id=pay.id;
  elsif p_action='refund' then
   if pay.status='refunded' then return; end if;
   if pay.status<>'paid' or length(trim(p_note))<10 or length(trim(p_reference))<3 then raise exception 'Catat pengembalian dana nyata beserta alasan dan referensi.'; end if;
   if o.status='completed' then raise exception 'Pesanan sudah selesai. Tangani sengketa secara terpisah.'; end if;
   update public.payments set status='refunded',admin_note=trim(p_note) where id=pay.id;
  elsif p_action='reject' then
   if o.status='rejected' then return; end if;
   if o.status not in('pending','confirmed') or pay.status in('paid','pending_verification') or length(trim(p_note))<3 then raise exception 'Periksa pembayaran dan alasan sebelum menolak.'; end if;
   next_state:='rejected';
  elsif p_action in('confirmed','preparing','ready','completed') then
   next_state:=p_action::public.order_state;
   if o.status=next_state then return; end if;
   if not ((o.status='pending' and next_state='confirmed') or (o.status='confirmed' and next_state='preparing') or (o.status='preparing' and next_state='ready') or (o.status='ready' and next_state='completed')) then raise exception 'Urutan status tidak valid.'; end if;
   if next_state='completed' and (pay.status<>'paid' or encode(sha256(convert_to(o.id::text||upper(trim(p_code)),'UTF8')),'hex') is distinct from o.pickup_code_hash) then raise exception 'Pembayaran harus lunas dan kode ambil harus benar.'; end if;
  else raise exception 'Tindakan tidak dikenal.';
  end if;
 end if;
 if next_state is not null then
  if next_state in('cancelled','rejected') and not o.inventory_released then
   -- Same slot-before-product lock order as checkout.
   perform 1 from public.pickup_slots where id=o.pickup_slot_id for update;
   perform 1 from public.products where id in(select product_id from public.order_items where order_id=o.id) order by id for update;
   update public.products p set stock=p.stock+x.qty from(select product_id,sum(quantity)::int qty from public.order_items where order_id=o.id group by product_id)x where p.id=x.product_id;
   update public.pickup_slots set reserved_count=reserved_count-1 where id=o.pickup_slot_id;
  end if;
  update public.orders set status=next_state,updated_at=now(),acknowledged_at=coalesce(acknowledged_at,now()),inventory_released=inventory_released or next_state in('cancelled','rejected') where id=o.id;
 end if;
 insert into public.order_events(order_id,actor_id,event_type,from_state,to_state,note) values(o.id,u,p_action,o.status::text,coalesce(next_state::text,o.status::text),nullif(trim(p_note),''));
 if admin then insert into public.audit_logs(actor_id,operation,entity_type,entity_id,metadata) values(u,p_action,'order',o.id::text,jsonb_build_object('reference',p_reference,'note',p_note)); end if;
 perform public.emit_notification(o.student_id,o.id,p_action,'Status pesanan diperbarui','Buka tiket untuk melihat detail terbaru.');
 for r in select id from public.profiles where role='admin' and id<>u loop
  perform public.emit_notification(r.id,o.id,'queue_updated','Antrean diperbarui','Buka tiket untuk melihat status terbaru.');
 end loop;
end $$;

create function public.reorder_order(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor(); item record; qty int;
begin
 perform 1 from public.profiles where id=u for no key update;
 if not exists(select 1 from public.orders where id=p_order and student_id=u and status in('completed','cancelled','rejected')) then raise exception 'Pesanan tidak dapat dipesan ulang.'; end if;
 for item in select i.*,p.stock,p.active from public.order_items i join public.products p on p.id=i.product_id where i.order_id=p_order loop
  select coalesce(sum(ci.quantity),0)::int+item.quantity into qty from public.cart_items ci join public.carts c on c.id=ci.cart_id where c.student_id=u and ci.product_id=item.product_id and ci.variant_id is not distinct from item.variant_id;
  if not item.active or qty>item.stock or qty>99 then raise exception 'Ada menu yang tidak tersedia atau stok tidak cukup. Pilih ulang dari menu.'; end if;
  perform public.set_cart_item(item.product_id,item.variant_id,qty);
 end loop;
end $$;

-- Admin CRUD uses one explicitly allowlisted command, never arbitrary SQL/table names.
create function public.admin_save(p_kind text,p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor(true); result uuid:=coalesce(p_id,gen_random_uuid());
begin
 if p_kind='category' then
  if length(trim(p_data->>'name')) not between 1 and 80 then raise exception 'Nama kategori tidak valid.'; end if;
  insert into public.categories(id,name,sort_order,active) values(result,trim(p_data->>'name'),coalesce((p_data->>'sort_order')::int,0),coalesce((p_data->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,sort_order=excluded.sort_order,active=excluded.active;
 elsif p_kind='product' then
  perform 1 from public.products where id=result for update;
  if length(trim(p_data->>'name')) not between 1 and 120 or (p_data->>'slug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_data->>'description')>1500 then raise exception 'Data menu tidak valid.'; end if;
  if coalesce(p_data->>'image_path','')<>'' and not exists(select 1 from storage.objects where bucket_id='product-images' and name=p_data->>'image_path') then raise exception 'Foto menu tidak ditemukan.'; end if;
  if exists(select 1 from public.product_variants where product_id=result and (p_data->>'price_idr')::int+price_delta_idr<0) then raise exception 'Harga baru membuat harga varian negatif.'; end if;
  insert into public.products(id,category_id,name,slug,description,price_idr,stock,image_path,active)
  values(result,nullif(p_data->>'category_id','')::uuid,trim(p_data->>'name'),p_data->>'slug',p_data->>'description',(p_data->>'price_idr')::int,(p_data->>'stock')::int,nullif(p_data->>'image_path',''),(p_data->>'active')::boolean)
  on conflict(id) do update set category_id=excluded.category_id,name=excluded.name,slug=excluded.slug,description=excluded.description,price_idr=excluded.price_idr,stock=excluded.stock,image_path=excluded.image_path,active=excluded.active;
 elsif p_kind='variant' then
  if length(trim(p_data->>'name')) not between 1 and 80 then raise exception 'Nama varian tidak valid.'; end if;
  perform 1 from public.products where id=(p_data->>'product_id')::uuid for update;
  if exists(select 1 from public.products where id=(p_data->>'product_id')::uuid and price_idr+(p_data->>'price_delta_idr')::int<0) then raise exception 'Harga varian tidak boleh negatif.'; end if;
  insert into public.product_variants(id,product_id,name,price_delta_idr,active) values(result,(p_data->>'product_id')::uuid,trim(p_data->>'name'),(p_data->>'price_delta_idr')::int,(p_data->>'active')::boolean)
  on conflict(id) do update set name=excluded.name,price_delta_idr=excluded.price_delta_idr,active=excluded.active;
 elsif p_kind='slot' then
  if length(trim(p_data->>'title')) not between 1 and 80 then raise exception 'Nama sesi tidak valid.'; end if;
  -- Lock before checking reservations; changing time of sold slots is forbidden.
  perform 1 from public.pickup_slots where id=result for update;
  if exists(select 1 from public.pickup_slots where id=result and reserved_count>0 and (starts_at<>(p_data->>'starts_at')::timestamptz or ends_at<>(p_data->>'ends_at')::timestamptz or cutoff_at<>(p_data->>'cutoff_at')::timestamptz)) then raise exception 'Waktu sesi yang sudah dipesan tidak dapat diubah.'; end if;
  insert into public.pickup_slots(id,title,starts_at,ends_at,cutoff_at,capacity,active) values(result,trim(p_data->>'title'),(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,(p_data->>'cutoff_at')::timestamptz,(p_data->>'capacity')::int,(p_data->>'active')::boolean)
  on conflict(id) do update set title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,cutoff_at=excluded.cutoff_at,capacity=excluded.capacity,active=excluded.active;
 else raise exception 'Jenis perubahan tidak dikenal.';
 end if;
 insert into public.audit_logs(actor_id,operation,entity_type,entity_id) values(u,'save',p_kind,result::text);
 return result;
end $$;

-- QRIS validation is repeated in SQL so direct RPC callers cannot bypass the API.
create function public.valid_static_qris(payload text) returns boolean language plpgsql immutable set search_path='' as $$
declare b bytea:=convert_to(payload,'UTF8'); n int:=octet_length(b); pos int:=0; tag text; len int; val text; tags jsonb:='{}'; crc int:=65535; i int; j int;
begin
 if n<40 or n>2048 then return false; end if;
 while pos<n loop
  tag:=convert_from(substring(b from pos+1 for 2),'UTF8');
  if tag !~ '^[0-9]{2}$' or convert_from(substring(b from pos+3 for 2),'UTF8') !~ '^[0-9]{2}$' then return false; end if;
  len:=convert_from(substring(b from pos+3 for 2),'UTF8')::int;
  if pos+4+len>n or tags ? tag then return false; end if;
  val:=convert_from(substring(b from pos+5 for len),'UTF8'); tags:=tags||jsonb_build_object(tag,val); pos:=pos+4+len;
  if tag='63' and (len<>4 or pos<>n) then return false; end if;
 end loop;
 if tags->>'00' is distinct from '01' or tags->>'01' is distinct from '11' or tags->>'53' is distinct from '360' or tags->>'58' is distinct from 'ID' or tags ? '54' or not (tags ? '59' and tags ? '60' and tags ? '63') then return false; end if;
 for i in 0..n-5 loop
  crc:=crc # (get_byte(b,i)<<8);
  for j in 1..8 loop
   if (crc & 32768)<>0 then crc:=((crc<<1) # 4129) & 65535; else crc:=(crc<<1) & 65535; end if;
  end loop;
 end loop;
 return upper(lpad(to_hex(crc),4,'0'))=upper(tags->>'63');
exception when others then return false;
end $$;

create function public.save_store(p_open boolean,p_location text,p_hours text,p_qris text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor(true);
begin
 if length(trim(p_location)) not between 1 and 160 or length(p_hours)>250 or (p_qris<>'' and not public.valid_static_qris(p_qris)) then raise exception 'Lokasi, jam, atau payload QRIS statis tidak valid.'; end if;
 update public.app_settings set value=jsonb_build_object('open',p_open,'pickup_location',trim(p_location),'hours',p_hours,'qris_payload',p_qris),updated_at=now() where key='store';
 insert into public.audit_logs(actor_id,operation,entity_type,entity_id) values(u,'save_store','settings','store');
end $$;

create function public.read_notifications() returns void language plpgsql security definer set search_path='' as $$
begin perform public.require_actor(); update public.notifications set read_at=now() where recipient_id=auth.uid() and read_at is null; end $$;

create function public.admin_queue_counts() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.require_actor(true);
 return (select jsonb_build_object('pending',count(*) filter(where status='pending'),'preparing',count(*) filter(where status in('confirmed','preparing')),'ready',count(*) filter(where status='ready'),'unacknowledged',count(*) filter(where acknowledged_at is null and status not in('completed','cancelled','rejected'))) from public.orders);
end $$;

create function public.save_push(p_endpoint text,p_p256dh text,p_auth text,p_remove boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor();
begin
 if p_remove then delete from public.push_subscriptions where student_or_admin_id=u and endpoint=p_endpoint; return; end if;
 if not exists(select 1 from public.profiles where id=u and notifications_enabled) then raise exception 'Aktifkan preferensi notifikasi dahulu.'; end if;
 if p_endpoint !~ '^https://' or length(p_endpoint)>2048 or length(p_p256dh) not between 40 and 200 or length(p_auth) not between 16 and 100 then raise exception 'Langganan tidak valid.'; end if;
 if (select count(*) from public.push_subscriptions where student_or_admin_id=u)>=10 then raise exception 'Maksimal 10 perangkat.'; end if;
 -- An endpoint cannot silently migrate from another account.
 if exists(select 1 from public.push_subscriptions where endpoint=p_endpoint and student_or_admin_id<>u) then raise exception 'Hapus langganan akun sebelumnya pada perangkat ini.'; end if;
 insert into public.push_subscriptions(student_or_admin_id,endpoint,p256dh,auth_secret) values(u,p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth_secret=excluded.auth_secret;
end $$;

-- Private proofs: authenticated owner only, immutable names; admin may read all.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('payment-proofs','payment-proofs',false,4194304,array['image/jpeg','image/png','image/webp']),('product-images','product-images',true,4194304,array['image/jpeg','image/png','image/webp']);
create policy proof_insert on storage.objects for insert to authenticated with check(bucket_id='payment-proofs' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.orders o join public.payments p on p.order_id=o.id where o.id::text=(storage.foldername(name))[2] and o.student_id=auth.uid() and o.payment_method='qris_static' and o.status not in('completed','cancelled','rejected') and p.status in('unpaid','pending_verification','rejected')));
create policy proof_select on storage.objects for select to authenticated using(bucket_id='payment-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy product_image_read on storage.objects for select to anon,authenticated using(bucket_id='product-images');
create policy product_image_insert on storage.objects for insert to authenticated with check(bucket_id='product-images' and public.is_admin());

create function public.attach_proof(p_order uuid,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor(); pay uuid;
begin
 perform 1 from public.orders where id=p_order for update;
 select p.id into pay from public.payments p join public.orders o on o.id=p.order_id where o.id=p_order and o.student_id=u and o.payment_method='qris_static' and o.status not in('completed','cancelled','rejected') and p.status in('unpaid','pending_verification','rejected');
 if pay is null or p_path not like u::text||'/'||p_order::text||'/%' or not exists(select 1 from storage.objects where bucket_id='payment-proofs' and name=p_path) then raise exception 'Bukti tidak valid.'; end if;
 if (select count(*) from public.payment_proofs where payment_id=pay)>=3 then raise exception 'Maksimal tiga bukti per pesanan.'; end if;
 insert into public.payment_proofs(payment_id,uploaded_by,storage_path) values(pay,u,p_path);
end $$;

-- Service worker dispatcher: locked claims; delivery is at-least-once (tagged for browser dedupe).
create function public.claim_push_jobs() returns setof public.push_outbox language sql security definer set search_path='' as $$
 update public.push_outbox set locked_until=now()+interval '2 minutes',attempts=attempts+1 where id in(
  select id from public.push_outbox where delivered_at is null and available_at<=now() and (locked_until is null or locked_until<now()) and attempts<6 order by available_at for update skip locked limit 25
 ) returning *;
$$;

-- Revoke default public execution, including helper functions which must stay internal.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(),public.consume_rate_limit(),public.update_profile(text,text,boolean),public.set_cart_item(uuid,uuid,int),public.remove_cart_item(uuid),public.checkout(uuid,public.payment_method,uuid,text),public.order_command(uuid,text,text,text,text),public.admin_save(text,uuid,jsonb),public.save_store(boolean,text,text,text),public.read_notifications(),public.save_push(text,text,text,boolean),public.attach_proof(uuid,text) to authenticated;
grant execute on function public.claim_push_jobs() to service_role;
grant execute on function public.reorder_order(uuid) to authenticated;
grant execute on function public.admin_queue_counts() to authenticated;
grant all on public.push_outbox,public.push_subscriptions to service_role;
grant select on public.profiles to service_role;
-- Realtime publishes only per-recipient notifications; RLS and client recipient filter both apply.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.notifications;
 end if;
end $$;
