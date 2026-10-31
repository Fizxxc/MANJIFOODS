-- Additive UX support. Keep every existing order, payment, event and ticket.
begin;

-- Admin handoff uses the existing ticket internally; no code needs to be
-- displayed/transcribed. The original locked transition still requires PAID,
-- READY, a matching ticket, and records the existing event/audit trail.
create function public.complete_order(p_order uuid, p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare ticket text;
begin
 perform public.require_actor(true);
 if p_order is null or p_note is null or length(p_note)>500 then raise exception 'Isian tidak valid.'; end if;
 perform 1 from public.orders where id=p_order for update;
 if not found then raise exception 'Pesanan tidak ditemukan.'; end if;
 if not exists(select 1 from public.payments where order_id=p_order) then raise exception 'Data pembayaran belum tersedia. Periksa transaksi.'; end if;
 select code into ticket from public.pickup_tickets where order_id=p_order;
 if ticket is null then raise exception 'Data pengambilan belum tersedia. Periksa transaksi.'; end if;
 perform public.order_command(p_order,'completed',p_note,ticket,'');
end $$;
revoke all on function public.complete_order(uuid,text) from public,anon,authenticated;
grant execute on function public.complete_order(uuid,text) to authenticated;

-- An order decision never settles/rejects/refunds its payment. Even a paid or
-- claimed order may be rejected before preparation, with separate reconciliation.
create function public.reject_order(p_order uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.require_actor(true); o public.orders; recipient record;
begin
 if p_order is null or p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'Alasan penolakan wajib diisi (3–500 karakter).'; end if;
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'Pesanan tidak ditemukan.'; end if;
 if o.status='rejected' then return; end if;
 if o.status not in('pending','confirmed') then raise exception 'Pesanan sudah disiapkan atau ditutup.'; end if;
 if not o.inventory_released then
  perform 1 from public.pickup_slots where id=o.pickup_slot_id for update;
  perform 1 from public.products where id in(select product_id from public.order_items where order_id=o.id) order by id for update;
  update public.products p set stock=p.stock+x.qty from(select product_id,sum(quantity)::int qty from public.order_items where order_id=o.id group by product_id)x where p.id=x.product_id;
  update public.pickup_slots set reserved_count=reserved_count-1 where id=o.pickup_slot_id;
 end if;
 update public.orders set status='rejected',updated_at=now(),acknowledged_at=coalesce(acknowledged_at,now()),inventory_released=true where id=o.id;
 insert into public.order_events(order_id,actor_id,event_type,from_state,to_state,note) values(o.id,u,'reject',o.status::text,'rejected',trim(p_reason));
 insert into public.audit_logs(actor_id,operation,entity_type,entity_id,metadata) values(u,'reject','order',o.id::text,jsonb_build_object('note',trim(p_reason)));
 perform public.emit_notification(o.student_id,o.id,'reject','Pesanan ditolak','Buka detail untuk melihat alasan dan status pembayaran.');
 for recipient in select id from public.profiles where role='admin' and id<>u loop
  perform public.emit_notification(recipient.id,o.id,'queue_updated','Antrean diperbarui','Buka detail untuk melihat status terbaru.');
 end loop;
end $$;
revoke all on function public.reject_order(uuid,text) from public,anon,authenticated;
grant execute on function public.reject_order(uuid,text) to authenticated;

-- Publish ONLY a per-recipient invalidation counter, not order/payment records
-- or proof paths. Subscribers ignore the payload and refetch via JWT + RLS.
create table public.order_refresh (
 recipient_id uuid primary key references public.profiles(id) on delete cascade,
 version bigint not null default 1
);
alter table public.order_refresh enable row level security;
create policy order_refresh_read on public.order_refresh for select to authenticated
 using(recipient_id=(select auth.uid()));
revoke all on public.order_refresh from public,anon,authenticated;
grant select on public.order_refresh to authenticated;

create function public.signal_order_refresh() returns trigger
language plpgsql security definer set search_path='' as $$
declare oid uuid; owner_id uuid;
begin
 if tg_table_name='orders' then oid:=new.id;
 elsif tg_table_name='payment_proofs' then select order_id into oid from public.payments where id=new.payment_id;
 else oid:=new.order_id;
 end if;
 select student_id into owner_id from public.orders where id=oid;
 if owner_id is not null then
  -- Stable recipient order avoids deadlocks for concurrent order transactions.
  insert into public.order_refresh(recipient_id,version)
  select id,1 from public.profiles where id=owner_id or role='admin' order by id
  on conflict(recipient_id) do update set version=public.order_refresh.version+1;
 end if;
 return new;
end $$;
revoke all on function public.signal_order_refresh() from public,anon,authenticated;
create trigger order_refresh_order after insert or update on public.orders
 for each row execute function public.signal_order_refresh();
create trigger order_refresh_payment after insert or update on public.payments
 for each row execute function public.signal_order_refresh();
create trigger order_refresh_proof after insert on public.payment_proofs
 for each row execute function public.signal_order_refresh();
create trigger order_refresh_event after insert on public.order_events
 for each row execute function public.signal_order_refresh();
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.order_refresh;
 end if;
end $$;
commit;
