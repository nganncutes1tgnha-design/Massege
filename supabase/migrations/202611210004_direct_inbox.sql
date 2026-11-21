begin;

create function public.direct_inbox()
returns table (
  peer_id uuid,
  peer_name text,
  last_message_id bigint,
  last_sender_id uuid,
  last_preview text,
  last_sent_at timestamptz,
  unread_count bigint
)
language sql stable set search_path = '' as $$
  with timeline as (
    select m.recipient_id as peer_id, m.id, m.sender_id, m.body, m.created_at, false as unread
    from public.direct_messages m
    where m.sender_id = (select auth.uid())
    union all
    select m.sender_id as peer_id, m.id, m.sender_id, m.body, m.created_at, m.read_at is null as unread
    from public.direct_messages m
    where m.recipient_id = (select auth.uid())
  ),
  latest as (
    select distinct on (t.peer_id)
      t.peer_id, t.id, t.sender_id, left(t.body, 160) as preview, t.created_at,
      count(*) filter (where t.unread) over (partition by t.peer_id) as unread_count
    from timeline t
    order by t.peer_id, t.id desc
  )
  select l.peer_id, p.name, l.id, l.sender_id, l.preview, l.created_at, l.unread_count
  from latest l
  join public.profiles p on p.id = l.peer_id
  order by l.id desc;
$$;

revoke all on function public.direct_inbox() from public, anon, authenticated;
grant execute on function public.direct_inbox() to authenticated;

commit;
