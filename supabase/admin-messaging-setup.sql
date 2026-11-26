alter type public.beta_role add value if not exists 'player';

alter table public.beta_members add column if not exists email text;
alter table public.beta_members alter column active set default false;
revoke select on public.beta_members from authenticated;
grant select (user_id, display_name, role, active, created_at) on public.beta_members to authenticated;

update public.beta_members as member
set email = auth_user.email
from auth.users as auth_user
where member.user_id = auth_user.id
  and member.email is distinct from auth_user.email;

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

drop trigger if exists on_auth_user_created on auth.users;
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
