create type public.beta_role as enum ('parent', 'coach');

create table public.beta_members (
  user_id uuid primary key references auth.users (id) on delete restrict,
  email text,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  role public.beta_role not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.beta_members (user_id, email, display_name, role, active)
  values (
    new.id,
    new.email,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Google user'
    ), 80),
    'parent'::public.beta_role,
    false
  )
  on conflict (user_id) do update
  set email = excluded.email, display_name = excluded.display_name;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_auth_user();

insert into public.beta_members (user_id, email, display_name, role, active)
select
  id,
  email,
  left(coalesce(
    nullif(btrim(raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(email, ''), '@', 1), ''),
    'Google user'
  ), 80),
  'parent'::public.beta_role,
  false
from auth.users
on conflict (user_id) do update
set email = excluded.email, display_name = excluded.display_name;

create table public.beta_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.beta_members (user_id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index beta_messages_created_at_idx on public.beta_messages (created_at);

create or replace function public.is_beta_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.beta_members
    where user_id = auth.uid() and active
  );
$$;

create or replace function public.is_beta_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.beta_members
    where user_id = auth.uid() and active and role = 'coach'
  );
$$;

revoke all on function public.is_beta_member() from public, anon;
revoke all on function public.is_beta_coach() from public, anon;
grant execute on function public.is_beta_member() to authenticated;
grant execute on function public.is_beta_coach() to authenticated;

alter table public.beta_members enable row level security;
alter table public.beta_messages enable row level security;

create policy "Approved members can view member names"
  on public.beta_members for select to authenticated
  using (user_id = auth.uid() or public.is_beta_member());

create policy "Approved members can view messages"
  on public.beta_messages for select to authenticated
  using (public.is_beta_member());

create policy "Approved members can send messages as themselves"
  on public.beta_messages for insert to authenticated
  with check (public.is_beta_member() and sender_id = auth.uid());

create policy "Coaches can remove messages"
  on public.beta_messages for delete to authenticated
  using (public.is_beta_coach());

revoke all on public.beta_members, public.beta_messages from anon, authenticated;
grant select (user_id, display_name, role, active, created_at) on public.beta_members to authenticated;
grant select, insert, delete on public.beta_messages to authenticated;
grant usage, select on sequence public.beta_messages_id_seq to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'beta_messages'
  ) then
    alter publication supabase_realtime add table public.beta_messages;
  end if;
end
$$;
