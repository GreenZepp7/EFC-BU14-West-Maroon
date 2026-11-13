# Eastside F.C. BU14 West Maroon Dashboard

A 2026/27 Regional Club League dashboard with live fixtures from SportsAffinity and imported results, standings, and season statistics.

## Run locally

```sh
npm install
npm run dev
```

Fixtures load automatically from the SportsAffinity iCalendar feed. Results and standings start from the included season snapshot; use **Update stats** to import a newer saved SportsAffinity results page as HTML.

Create a production build with `npm run build`, then serve the built app and calendar proxy together with `npm start`.
