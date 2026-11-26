create table if not exists public.beta_push_subscriptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

alter table public.beta_push_subscriptions enable row level security;

drop policy if exists "Members can view their push subscriptions" on public.beta_push_subscriptions;
drop policy if exists "Members can add their push subscriptions" on public.beta_push_subscriptions;
drop policy if exists "Members can update their push subscriptions" on public.beta_push_subscriptions;
drop policy if exists "Members can remove their push subscriptions" on public.beta_push_subscriptions;

create policy "Members can view their push subscriptions"
  on public.beta_push_subscriptions for select to authenticated
  using (user_id = auth.uid() and public.is_beta_member());

create policy "Members can add their push subscriptions"
  on public.beta_push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and public.is_beta_member());

create policy "Members can update their push subscriptions"
  on public.beta_push_subscriptions for update to authenticated
  using (user_id = auth.uid() and public.is_beta_member())
  with check (user_id = auth.uid() and public.is_beta_member());

create policy "Members can remove their push subscriptions"
  on public.beta_push_subscriptions for delete to authenticated
  using (user_id = auth.uid() and public.is_beta_member());

revoke all on public.beta_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.beta_push_subscriptions to authenticated;
