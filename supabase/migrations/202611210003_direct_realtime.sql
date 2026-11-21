begin;

alter table public.direct_messages add column read_at timestamptz;

create index direct_messages_unread
  on public.direct_messages (recipient_id, sender_id, id)
  where read_at is null;

create function public.direct_unread_counts()
returns table (sender_id uuid, unread_count bigint)
language sql stable set search_path = '' as $$
  select m.sender_id, count(*)
  from public.direct_messages m
  where m.recipient_id = (select auth.uid()) and m.read_at is null
  group by m.sender_id;
$$;

create function public.mark_direct_read(other_user uuid, through_id bigint)
returns void
language sql security definer set search_path = '' as $$
  update public.direct_messages
  set read_at = now()
  where recipient_id = (select auth.uid()) and sender_id = other_user
    and id <= through_id and read_at is null;
$$;

revoke all on function public.direct_unread_counts(), public.mark_direct_read(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.direct_unread_counts(), public.mark_direct_read(uuid, bigint)
  to authenticated;

alter publication supabase_realtime add table public.direct_messages;

commit;
