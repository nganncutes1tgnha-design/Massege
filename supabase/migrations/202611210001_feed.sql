begin;

create table public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 2000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now()
);

create table public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 1000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now()
);

create table public.feed_likes (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);

create index feed_posts_order on public.feed_posts (created_at desc, id desc);
create index feed_comments_order on public.feed_comments (post_id, created_at, id);
create index feed_posts_author on public.feed_posts (author_id);
create index feed_comments_author on public.feed_comments (author_id);
create index feed_likes_user on public.feed_likes (user_id);

alter table public.feed_posts enable row level security;
alter table public.feed_comments enable row level security;
alter table public.feed_likes enable row level security;

create policy posts_read on public.feed_posts for select to authenticated
  using ((select auth.uid()) is not null);
create policy posts_create on public.feed_posts for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy posts_edit on public.feed_posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy posts_delete on public.feed_posts for delete to authenticated
  using (author_id = (select auth.uid()));

create policy comments_read on public.feed_comments for select to authenticated
  using ((select auth.uid()) is not null);
create policy comments_create on public.feed_comments for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy comments_edit on public.feed_comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy comments_delete on public.feed_comments for delete to authenticated
  using (author_id = (select auth.uid()));

create policy likes_read on public.feed_likes for select to authenticated
  using ((select auth.uid()) is not null);
create policy likes_create on public.feed_likes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy likes_delete on public.feed_likes for delete to authenticated
  using (user_id = (select auth.uid()));

create view public.feed_entries with (security_invoker = true) as
select post.id, post.author_id, profile.name as author_name, post.body, post.created_at,
  (select count(*) from public.feed_likes l where l.post_id = post.id) as like_count,
  exists (select 1 from public.feed_likes l where l.post_id = post.id and l.user_id = (select auth.uid())) as liked,
  (select count(*) from public.feed_comments c where c.post_id = post.id) as comment_count
from public.feed_posts post
join public.profiles profile on profile.id = post.author_id;

revoke all on public.feed_posts, public.feed_comments, public.feed_likes, public.feed_entries
  from public, anon, authenticated;
grant select on public.feed_posts, public.feed_comments, public.feed_likes, public.feed_entries to authenticated;
grant insert (body), update (body), delete on public.feed_posts to authenticated;
grant insert (post_id, body), update (body), delete on public.feed_comments to authenticated;
grant insert (post_id), delete on public.feed_likes to authenticated;

commit;
