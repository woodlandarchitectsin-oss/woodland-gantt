# Woodland Project Schedule (Gantt)

Online project scheduling for Woodland Architects, built the same way as Woodland Project OS:
a plain web page on GitHub Pages, with the data kept in a Google Sheet through a Google Apps Script back end.
Installable on phones and PCs. React + Vite + TypeScript + Tailwind.

## Where things are

- **App link:** https://woodlandarchitectsin-oss.github.io/woodland-gantt/
- **Data:** the Google Sheet "Woodland Gantt — data" (Projects, Phases, Milestones tabs), in the owner's Drive.
- **Back end:** `backend/Code.gs` (Apps Script web app, address in `src/config.ts`).
- **Sign-in:** two PINs in Apps Script > Project Settings > Script Properties: `ADMIN_PIN` (can change the chart) and `TEAM_PIN` (view only). Never write PINs in code or Git.
- **Link to Project OS:** Script Property `LINK_KEY` (a copy of Project OS's). Then **Bring in from Project OS** on the Projects screen lists projects in process and adds the ones you tick.

## First-time setup (owner, once)

1. Apps Script editor for the back end: run `setPins` once, accept the permissions Google asks for, then read both PINs in Project Settings > Script Properties.
2. Add the Script Property `LINK_KEY` (copy of the one in Project OS).
3. Optional: move projects from the old PC version with `node scripts/migrate-local.cjs` (asks for the admin PIN).

## Update

```
npm test            # back end tests
cd backend && clasp push --force && clasp deploy --deploymentId AKfycbw680kUZJVJaHs2Q8xSNntaqW_DVi28T23AK7pFG5YamW-ppR1W6i0gRWpKYcqCwuy6 --description "<what changed>"   # only when backend/Code.gs changed
npm run deploy      # builds and publishes the page to GitHub Pages
```

Never run `clasp create` again in `backend/`: it overwrites the manifest. Always redeploy to the same deployment ID so the address never changes.

## Using it

- **Projects** – cards show % complete = phases whose end date has passed ÷ all phases.
- **New project** – *Interior fit-out template* (12 phases scaled to your dates, fixed site order) or *Blank*.
- **Gantt** – drag a bar to move it, drag an edge to resize, click it for category / colour / dates / reorder / remove.
- **Assigned / Material in-charge** – type under any phase; saved when you leave the field.
- **Milestones**, **Notes**, **Export** (print, PDF, copy image, PNG) as before.
- **Theme** – System / Light / Dark.

## Default interior fit-out sequence

Defined in `shared/template.ts`; the array order is the site order and is deliberately not sorted:
structure & material finalisation, material procurement, preliminary putty & paper (before ceiling, electrical,
carpentry so dust can't spoil walls), false ceiling, electrical, plumbing, carpentry, final paint, polish / duco
(with cure buffer), hardware fixing, curtains, snagging & handover.

## Layout

```
backend/  Apps Script API (Code.gs) + manifest
shared/   Types, date helpers and the template
src/      React app (components/Gantt.tsx is the chart)
public/   manifest, icons, service worker
test/     back end tests (npm test)
scripts/  deploy-pages, make-icons, migrate-local
```

`_local-version/` (git-ignored) holds the old PC-only version and its exported data.
