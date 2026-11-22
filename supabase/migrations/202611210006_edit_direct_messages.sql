begin;

alter table public.direct_messages
  add column edited_at timestamptz;

create function public.touch_direct_message_edit()
returns trigger
language plpgsql
set search_path = '' as $$
begin
  if new.body is distinct from old.body then
    new.edited_at = now();
  end if;
  return new;
end;
$$;

create trigger direct_messages_mark_edited
before update of body on public.direct_messages
for each row execute function public.touch_direct_message_edit();

create policy messages_edit_own on public.direct_messages for update to authenticated
  using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));

grant update (body) on public.direct_messages to authenticated;

commit;
