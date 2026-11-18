create type public.beta_role as enum ('parent', 'coach');

create table public.beta_members (
  user_id uuid primary key references auth.users (id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  role public.beta_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

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
grant select on public.beta_members to authenticated;
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
