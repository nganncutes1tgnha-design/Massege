begin;

create table public.direct_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 2000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index direct_messages_sender_recipient on public.direct_messages (sender_id, recipient_id, id desc);
create index direct_messages_recipient on public.direct_messages (recipient_id);

alter table public.direct_messages enable row level security;

create policy messages_read_participants on public.direct_messages for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

create policy messages_send_to_friends on public.direct_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.friend_requests f
      where f.status = 'accepted'
        and least(f.sender_id, f.recipient_id) = least(direct_messages.sender_id, direct_messages.recipient_id)
        and greatest(f.sender_id, f.recipient_id) = greatest(direct_messages.sender_id, direct_messages.recipient_id)
    )
  );

revoke all on public.direct_messages from public, anon, authenticated;
grant select on public.direct_messages to authenticated;
grant insert (recipient_id, body) on public.direct_messages to authenticated;

commit;
