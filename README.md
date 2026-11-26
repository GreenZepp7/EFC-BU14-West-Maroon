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

The **Team messages · Under development** tab uses Supabase Auth, Postgres, and Realtime. Google sign-in is used; only approved parents, coaches, and players can read or send messages, and coaches can remove messages. Designated admins approve users in the messaging page without editing SQL.

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor.
2. In Supabase Auth, enable Google and add the local and production app URLs to the allowed redirect URLs.
3. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the frontend. On the server only, set `SUPABASE_SERVICE_ROLE_KEY` and `MESSAGES_ADMIN_EMAILS` (comma-separated, lowercase email addresses). Never expose the service-role key as a `VITE_` variable.
4. For an existing project, run [`supabase/admin-messaging-setup.sql`](supabase/admin-messaging-setup.sql) in the SQL Editor; rerun it when new member roles are added. For a new project, `schema.sql` already includes the setup. Add `paulius.meskauskas@gmail.com` to `MESSAGES_ADMIN_EMAILS` to enable the initial admin panel. Users must sign in once before they appear in the panel.

Messages are shared only with approved beta members. Do not use the beta for sensitive information or emergencies.

### Push notifications

Push notifications use the installed web app, not a separate native app. Approved members can enable or disable generic notifications from the Team messages page. Notifications never include message text. Android requires a supported browser; iPhone and iPad require iOS 16.4 or newer and the site added to the Home Screen.

1. For an existing Supabase project, run [`supabase/enable-message-push.sql`](supabase/enable-message-push.sql) once. A new project gets the table from `schema.sql`.
2. Generate a VAPID key pair with `npx web-push generate-vapid-keys`. Set the public key as `VITE_VAPID_PUBLIC_KEY` and the private key as `VAPID_PRIVATE_KEY`. Also set `VAPID_SUBJECT` to a `mailto:` address.
3. Generate a long random webhook secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and set it as `MESSAGES_PUSH_WEBHOOK_SECRET`.
4. In Supabase, create a Database Webhook for `public.beta_messages` on `INSERT`, pointing to `https://<your-domain>/api/message-push`. Add the header `x-messages-push-secret` with the same webhook secret.
5. Add these variables to the local `.env` and production hosting environment. Only `VITE_VAPID_PUBLIC_KEY` is client-visible; keep the VAPID private key and webhook secret server-only.

The database webhook sends notifications after messages are inserted, so delivery does not depend on the sender keeping the page open. Local push subscription setup works on `localhost`, but a cloud Supabase webhook cannot reach a local server; end-to-end delivery requires the deployed HTTPS endpoint or a secure public tunnel.
