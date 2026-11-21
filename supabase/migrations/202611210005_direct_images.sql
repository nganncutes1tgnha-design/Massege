begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('direct-chat-images', 'direct-chat-images', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

alter table public.direct_messages
  add column image_path text unique,
  drop constraint direct_messages_body_check,
  add constraint direct_message_content check (
    char_length(body) <= 2000 and (body ~ '[^[:space:]]' or (body = '' and image_path is not null))
  ),
  add constraint direct_image_path check (
    image_path is null or (
      image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
      and split_part(image_path, '/', 1) = sender_id::text
      and split_part(image_path, '/', 2) = recipient_id::text
    )
  );

create policy direct_images_upload on storage.objects for insert to authenticated
with check (
  bucket_id = 'direct-chat-images'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and exists (
    select 1 from public.friend_requests f where f.status = 'accepted'
      and (
        (f.sender_id = (select auth.uid()) and f.recipient_id::text = split_part(name, '/', 2))
        or (f.recipient_id = (select auth.uid()) and f.sender_id::text = split_part(name, '/', 2))
      )
  )
);

create schema if not exists massege_private;
grant usage on schema massege_private to authenticated;

-- Isolate the participant check from the storage policy used when inserting a message.
create function massege_private.direct_image_attached(object_name text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.direct_messages m where m.image_path = object_name
      and (select auth.uid()) in (m.sender_id, m.recipient_id)
  );
$$;

revoke all on function massege_private.direct_image_attached(text) from public, anon, authenticated;
grant execute on function massege_private.direct_image_attached(text) to authenticated;

create policy direct_images_read on storage.objects for select to authenticated
using (
  bucket_id = 'direct-chat-images' and (
    split_part(name, '/', 1) = (select auth.uid())::text
    or massege_private.direct_image_attached(name)
  )
);

create policy direct_images_delete_unsent on storage.objects for delete to authenticated
using (
  bucket_id = 'direct-chat-images'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and not massege_private.direct_image_attached(name)
);

-- The storage SELECT policy allows the sender to see staged uploads.
create policy direct_images_require_upload on public.direct_messages as restrictive for insert to authenticated
with check (
  image_path is null or exists (
    select 1 from storage.objects o where o.bucket_id = 'direct-chat-images' and o.name = image_path
  )
);

grant insert (image_path) on public.direct_messages to authenticated;

create or replace function public.direct_inbox()
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
    select m.recipient_id as peer_id, m.id, m.sender_id, m.body, m.image_path, m.created_at, false as unread
    from public.direct_messages m
    where m.sender_id = (select auth.uid())
    union all
    select m.sender_id as peer_id, m.id, m.sender_id, m.body, m.image_path, m.created_at, m.read_at is null as unread
    from public.direct_messages m
    where m.recipient_id = (select auth.uid())
  ),
  latest as (
    select distinct on (t.peer_id)
      t.peer_id, t.id, t.sender_id, t.created_at,
      left(case
        when t.image_path is null then t.body
        when t.body = '' then 'Ảnh'
        else 'Ảnh · ' || t.body
      end, 160) as preview,
      count(*) filter (where t.unread) over (partition by t.peer_id) as unread_count
    from timeline t
    order by t.peer_id, t.id desc
  )
  select l.peer_id, p.name, l.id, l.sender_id, l.preview, l.created_at, l.unread_count
  from latest l
  join public.profiles p on p.id = l.peer_id
  order by l.id desc;
$$;

commit;
