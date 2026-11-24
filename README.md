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

The **Team messages · Under development** tab uses Supabase Auth, Postgres, and Realtime. Google sign-in is used; only approved parents and coaches can read or send messages, and coaches can remove messages. Designated admins approve users in the messaging page without editing SQL.

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor.
2. In Supabase Auth, enable Google and add the local and production app URLs to the allowed redirect URLs.
3. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the frontend. On the server only, set `SUPABASE_SERVICE_ROLE_KEY` and `MESSAGES_ADMIN_EMAILS` (comma-separated, lowercase email addresses). Never expose the service-role key as a `VITE_` variable.
4. For an existing project, run [`supabase/admin-messaging-setup.sql`](supabase/admin-messaging-setup.sql) once in the SQL Editor. For a new project, `schema.sql` already includes the setup. Add `paulius.meskauskas@gmail.com` to `MESSAGES_ADMIN_EMAILS` to enable the initial admin panel. Users must sign in once before they appear in the panel.

Messages are shared only with approved beta members. Do not use the beta for sensitive information or emergencies.
