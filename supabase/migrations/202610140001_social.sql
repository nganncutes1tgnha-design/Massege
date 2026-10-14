-- Run this complete migration in the Supabase SQL Editor.
-- Repeatable: no existing profiles or connections are deleted.
begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 50),
  role text not null default 'Rất vui được làm quen với bạn' check (char_length(role) <= 80),
  city text not null default 'Chưa cập nhật' check (char_length(city) <= 60),
  bio text not null default '' check (char_length(bio) <= 240),
  interests text[] not null default '{}' check (cardinality(interests) <= 5 and char_length(array_to_string(interests, ',')) <= 160 and coalesce(array_ndims(interests), 1) = 1 and array_position(interests, null) is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create unique index if not exists friend_requests_pair on public.friend_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id));
create index if not exists friend_requests_sender_status on public.friend_requests(sender_id, status);
create index if not exists friend_requests_recipient_status on public.friend_requests(recipient_id, status);

alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists profiles_edit_own on public.profiles;
create policy profiles_edit_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists requests_read_participants on public.friend_requests;
create policy requests_read_participants on public.friend_requests for select to authenticated using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

revoke all on public.profiles, public.friend_requests from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.friend_requests to authenticated;
grant update(name, role, city, bio, interests) on public.profiles to authenticated;

create or replace function public.initialize_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, name) values (new.id, coalesce(nullif(left(btrim(new.raw_user_meta_data->>'full_name'), 50), ''), 'Bạn mới')) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.initialize_profile() from public, anon, authenticated;
drop trigger if exists massege_initialize_profile on auth.users;
create trigger massege_initialize_profile after insert on auth.users for each row execute function public.initialize_profile();
insert into public.profiles(id, name)
select id, coalesce(nullif(left(btrim(raw_user_meta_data->>'full_name'), 50), ''), 'Bạn mới') from auth.users on conflict (id) do nothing;

create or replace function public.touch_profile() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function public.touch_profile() from public, anon, authenticated;
drop trigger if exists massege_touch_profile on public.profiles;
create trigger massege_touch_profile before update on public.profiles for each row execute function public.touch_profile();

create or replace function public.send_friend_request(other_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); affected integer;
begin
  if actor is null or other_user is null or actor = other_user then raise exception 'Invalid friendship request' using errcode = '42501'; end if;
  insert into public.friend_requests(sender_id, recipient_id, status) values (actor, other_user, 'pending')
  on conflict (least(sender_id, recipient_id), greatest(sender_id, recipient_id)) do update
    set sender_id = excluded.sender_id, recipient_id = excluded.recipient_id, status = 'pending', created_at = now(), updated_at = now()
    where public.friend_requests.status = 'declined';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Connection already exists' using errcode = '22023'; end if;
end;
$$;

create or replace function public.accept_friend_request(other_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); affected integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.friend_requests set status = 'accepted', updated_at = now() where sender_id = other_user and recipient_id = actor and status = 'pending';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'No invitation to accept' using errcode = '42501'; end if;
end;
$$;

create or replace function public.reject_friend_request(other_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); affected integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.friend_requests set status = 'declined', updated_at = now() where sender_id = other_user and recipient_id = actor and status = 'pending';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'No invitation to reject' using errcode = '42501'; end if;
end;
$$;

create or replace function public.cancel_friend_request(other_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); affected integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  delete from public.friend_requests where sender_id = actor and recipient_id = other_user and status = 'pending';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'No invitation to cancel' using errcode = '42501'; end if;
end;
$$;

create or replace function public.list_people()
returns table(id uuid, name text, role text, city text, bio text, interests text[], mutual bigint, color text, connection text)
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return query
  select p.id, p.name, p.role, p.city, p.bio, p.interests,
    (select count(*) from (
      select case when a.sender_id = actor then a.recipient_id else a.sender_id end as friend from public.friend_requests a where a.status = 'accepted' and (a.sender_id = actor or a.recipient_id = actor)
      intersect
      select case when b.sender_id = p.id then b.recipient_id else b.sender_id end as friend from public.friend_requests b where b.status = 'accepted' and (b.sender_id = p.id or b.recipient_id = p.id)
    ) shared),
    (array['peach','sage','lavender','yellow','rose','sky'])[1 + ((get_byte(decode(replace(p.id::text, '-', ''), 'hex'), 0)) % 6)],
    case when r.status = 'accepted' then 'friend' when r.status = 'pending' and r.sender_id = actor then 'pending' when r.status = 'pending' and r.recipient_id = actor then 'incoming' else 'suggested' end
  from public.profiles p
  left join public.friend_requests r on least(r.sender_id, r.recipient_id) = least(actor, p.id) and greatest(r.sender_id, r.recipient_id) = greatest(actor, p.id)
  where p.id <> actor order by p.name, p.id;
end;
$$;

revoke all on function public.send_friend_request(uuid), public.accept_friend_request(uuid), public.reject_friend_request(uuid), public.cancel_friend_request(uuid), public.list_people() from public, anon, authenticated;
grant execute on function public.send_friend_request(uuid), public.accept_friend_request(uuid), public.reject_friend_request(uuid), public.cancel_friend_request(uuid), public.list_people() to authenticated;
notify pgrst, 'reload schema';
commit;
