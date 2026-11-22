# Eastside FC BU14 West Maroon Dashboard

A 2026/27 Regional Club League dashboard with live fixtures, results, standings, and season statistics from SportsAffinity.

## Run locally

```sh
npm install
npm run dev
```

Fixtures load automatically from the SportsAffinity iCalendar feed. Results and standings refresh automatically from SportsAffinity when the dashboard opens and every 15 minutes; the included season snapshot is used if the results feed is unavailable.

Create a production build with `npm run build`, then serve the built app and calendar proxy together with `npm start`.

## Parent and coach messaging beta

The **Team messages · Under development** tab uses Supabase Auth, Postgres, and Realtime. Google sign-in is used; only accounts explicitly approved as active parents or coaches can read or send messages, and coaches can remove messages.

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor.
2. In Supabase Auth, enable Google and add the local and production app URLs to the allowed redirect URLs.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` for local work and in the production hosting environment. These are client-side values; never put a Supabase service-role key in the app.
4. Each parent or coach signs in once. An administrator then approves them by inserting their Supabase Auth user ID into `public.beta_members` from the SQL Editor:

   ```sql
   insert into public.beta_members (user_id, display_name, role)
   select id, 'Display Name', 'parent'
   from auth.users
   where lower(email) = lower('parent@example.com')
   on conflict (user_id) do update
   set display_name = excluded.display_name, role = excluded.role, active = true;
   ```

   Use `coach` for a coach account. To revoke access, set that member's `active` value to `false`.

Messages are shared with all approved beta members. Do not use the beta for sensitive information or emergencies.
