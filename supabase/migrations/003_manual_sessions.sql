-- Apply after 001 and 002. Additive data migration: old slots/orders remain.
-- Old date-based RPCs fail closed after this migration; deploy the matching app.
begin;

alter table public.pickup_slots add column session_mode text not null default 'scheduled'
  check(session_mode in ('scheduled','manual'));
alter table public.pickup_slots add column start_key uuid unique;
alter table public.pickup_slots alter column ends_at drop not null;
alter table public.pickup_slots alter column cutoff_at drop not null;
alter table public.pickup_slots alter column capacity drop not null;
alter table public.pickup_slots add constraint manual_session_shape check(
  session_mode <> 'manual' or (
    cutoff_at is null and capacity is null and start_key is not null
    and active = (ends_at is null)
  )
);
create unique index one_open_manual_session on public.pickup_slots(session_mode)
  where session_mode='manual' and ends_at is null;

alter table public.orders add column pickup_at timestamptz;
-- Preserve the original pickup appointment on historical tickets.
update public.orders o set pickup_at=s.starts_at from public.pickup_slots s
  where s.id=o.pickup_slot_id and o.pickup_at is null;
grant select(pickup_at) on public.orders to authenticated;
revoke select on public.pickup_slots from authenticated;
grant select(id,title,starts_at,ends_at,cutoff_at,capacity,reserved_count,active,session_mode)
  on public.pickup_slots to authenticated;
drop policy slots_read on public.pickup_slots;
create policy slots_read on public.pickup_slots for select to authenticated using(
  public.is_admin() or (session_mode='manual' and active and ends_at is null)
);
-- Existing slots_history_read continues to authorize the student's old tickets.

create function public.resolve_pickup_at(p_time text,p_now timestamptz) returns timestamptz
language plpgsql immutable set search_path='' as $$
declare local_pickup timestamp; result timestamptz;
begin
 if p_time is null or p_now is null or not isfinite(p_now)
    or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
  raise exception 'Pilih jam pengambilan dalam format HH:mm.';
 end if;
 local_pickup := (p_now at time zone 'Asia/Jakarta')::date + p_time::time;
 result := local_pickup at time zone 'Asia/Jakarta';
 if result <= p_now then
  result := (local_pickup + interval '1 day') at time zone 'Asia/Jakarta';
 end if;
 return result;
end $$;

create function public.session_start(p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor(true); sid uuid; stamp timestamptz;
begin
 if p_key is null then raise exception 'Kunci sesi wajib diisi.'; end if;
 perform pg_advisory_xact_lock(742001,1);
 select id into sid from public.pickup_slots where start_key=p_key;
 if sid is not null then return sid; end if;
 -- Same store-before-session lock order as checkout/end.
 perform 1 from public.app_settings where key='store' for update;
 select id into sid from public.pickup_slots where session_mode='manual' and ends_at is null for update;
 if sid is not null then return sid; end if;
 stamp:=clock_timestamp(); sid:=gen_random_uuid();
 insert into public.pickup_slots(id,title,starts_at,ends_at,cutoff_at,capacity,active,session_mode,start_key)
 values(sid,'Sesi '||to_char(stamp at time zone 'Asia/Jakarta','DD/MM/YYYY HH24:MI:SS'),stamp,null,null,null,true,'manual',p_key);
 update public.app_settings set value=value||'{"open":true}',updated_at=stamp where key='store';
 insert into public.audit_logs(actor_id,operation,entity_type,entity_id,metadata)
 values(u,'session_start','session',sid::text,jsonb_build_object('started_at',stamp));
 return sid;
end $$;

create function public.session_end(p_session uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor(true); s public.pickup_slots; stamp timestamptz;
begin
 if p_session is null then raise exception 'Sesi wajib dipilih.'; end if;
 perform pg_advisory_xact_lock(742001,1);
 perform 1 from public.app_settings where key='store' for update;
 select * into s from public.pickup_slots where id=p_session for update;
 if s.id is null or s.session_mode<>'manual' then raise exception 'Sesi tidak ditemukan.'; end if;
 if s.ends_at is not null then return s.id; end if;
 stamp:=greatest(clock_timestamp(),s.starts_at+interval '1 microsecond');
 update public.pickup_slots set ends_at=stamp,active=false where id=s.id;
 update public.app_settings set value=value||'{"open":false}',updated_at=stamp where key='store';
 insert into public.audit_logs(actor_id,operation,entity_type,entity_id,metadata)
 values(u,'session_end','session',s.id::text,jsonb_build_object('ended_at',stamp));
 return s.id;
end $$;

create function public.pickup_time_preview(p_time text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid; stamp timestamptz;
begin
 perform public.require_actor();
 select id into sid from public.pickup_slots where session_mode='manual' and ends_at is null and active;
 if sid is null then raise exception 'Belum ada sesi terbuka. Tunggu admin memulai sesi.'; end if;
 stamp:=clock_timestamp();
 return jsonb_build_object('session_id',sid,'pickup_at',public.resolve_pickup_at(p_time,stamp),'server_now',stamp);
end $$;

-- Keep other catalog mutations unchanged, but remove the date editor RPC path.
alter function public.admin_save(text,uuid,jsonb) rename to admin_save_legacy;
revoke execute on function public.admin_save_legacy(text,uuid,jsonb) from public,anon,authenticated;
create function public.admin_save(p_kind text,p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_actor(true);
 if p_kind is null or p_kind not in('category','product','variant') then
  raise exception 'Gunakan Start Session atau End Session.';
 end if;
 return public.admin_save_legacy(p_kind,p_id,p_data);
end $$;
revoke execute on function public.checkout(uuid,public.payment_method,uuid,text) from public,anon,authenticated;

create function public.checkout_session(p_session uuid,p_pickup_time text,p_expected_pickup_at timestamptz,
 p_method public.payment_method,p_key uuid,p_note text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor(); oid uuid; cid uuid; s public.pickup_slots; r record;
 total bigint:=0; code text; cfg jsonb; ticket_n text; pickup_stamp timestamptz;
begin
 perform 1 from public.profiles where id=u for no key update;
 select id into oid from public.orders where student_id=u and idempotency_key=p_key;
 if oid is not null then return oid; end if;
 if p_key is null or p_method is null or p_session is null or p_note is null or length(p_note)>300
    or p_expected_pickup_at is null then raise exception 'Data checkout tidak valid.'; end if;
 select value into cfg from public.app_settings where key='store' for share;
 if not coalesce((cfg->>'open')::boolean,false) then raise exception 'Kantin sedang tutup.'; end if;
 if p_method='qris_static' and coalesce(cfg->>'qris_payload','')='' then raise exception 'QRIS belum dikonfigurasi. Pilih tunai.'; end if;
 select * into s from public.pickup_slots where id=p_session for update;
 if s.id is null or s.session_mode<>'manual' or not s.active or s.ends_at is not null then
  raise exception 'Sesi sudah berakhir. Tunggu sesi baru dari admin.';
 end if;
 select id into cid from public.carts where student_id=u;
 if not exists(select 1 from public.cart_items where cart_id=cid) then raise exception 'Keranjangmu kosong.'; end if;
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
 -- Resolve after every potentially waiting lock. Never trust a client date.
 pickup_stamp:=public.resolve_pickup_at(p_pickup_time,clock_timestamp());
 if pickup_stamp is distinct from p_expected_pickup_at then
  raise exception 'Jam pengambilan berubah. Periksa ulang waktu pengambilan.';
 end if;
 oid:=gen_random_uuid(); code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 ticket_n:=nextval('public.order_number_seq')::text;
 insert into public.orders(id,order_number,student_id,pickup_slot_id,pickup_at,payment_method,total_idr,pickup_code_hash,idempotency_key,customer_note)
 values(oid,'MF-'||to_char(clock_timestamp() at time zone 'Asia/Jakarta','YYYYMMDD')||'-'||lpad(ticket_n,greatest(6,length(ticket_n)),'0'),u,p_session,pickup_stamp,p_method,total,encode(sha256(convert_to(oid::text||code,'UTF8')),'hex'),p_key,trim(p_note));
 insert into public.pickup_tickets values(oid,u,code);
 insert into public.order_items(order_id,product_id,variant_id,product_name_snapshot,variant_name_snapshot,quantity,unit_price_idr,line_total_idr)
 select oid,i.product_id,i.variant_id,p.name,v.name,i.quantity,p.price_idr+coalesce(v.price_delta_idr,0),(p.price_idr+coalesce(v.price_delta_idr,0))*i.quantity
 from public.cart_items i join public.products p on p.id=i.product_id left join public.product_variants v on v.id=i.variant_id where cart_id=cid;
 update public.products p set stock=p.stock-x.qty from(select product_id,sum(quantity)::int qty from public.cart_items where cart_id=cid group by product_id)x where p.id=x.product_id;
 update public.pickup_slots set reserved_count=reserved_count+1 where id=p_session;
 insert into public.payments(order_id,method,amount_idr) values(oid,p_method,total);
 insert into public.order_events(order_id,actor_id,event_type,to_state) values(oid,u,'order_created','pending');
 perform public.emit_notification(u,oid,'order_created','Pesanan diterima','Tiket pesananmu sudah tersimpan.');
 for r in select id from public.profiles where role='admin' loop
  perform public.emit_notification(r.id,oid,'new_order','Pesanan baru','Buka antrean untuk memeriksa pesanan.');
 end loop;
 delete from public.cart_items where cart_id=cid;
 return oid;
end $$;

revoke execute on function public.resolve_pickup_at(text,timestamptz),public.session_start(uuid),public.session_end(uuid),
 public.pickup_time_preview(text),public.admin_save(text,uuid,jsonb),
 public.checkout_session(uuid,text,timestamptz,public.payment_method,uuid,text) from public,anon,authenticated;
grant execute on function public.session_start(uuid),public.session_end(uuid),public.pickup_time_preview(text),
 public.admin_save(text,uuid,jsonb),public.checkout_session(uuid,text,timestamptz,public.payment_method,uuid,text) to authenticated;
commit;
