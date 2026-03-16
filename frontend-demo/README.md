# Mahali Garage – Frontend Demo

Browser-only demo of **Mahali Garage** with no backend. All data is stored in **localStorage** and can be reset from the demo banner.

## Quick start

```bash
cd frontend-demo
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Log in with:

- **Username:** `owner` or `owner@mahali.com`
- **Password:** any (e.g. `demo`)

## Build & deploy

```bash
npm run build
npm run preview   # local preview of production build
```

Deploy the `dist/` folder to any static host (e.g. Vercel, Netlify).

## Features

- Same UI as the full Mahali Garage app (Dashboard, Job Cards, Vehicles, Customers, Parts, Expenses, Tasks, Reports, Settings, etc.)
- Data persists in the browser via `localStorage`
- **Reset Demo** in the yellow banner restores default mock data
- No backend, database, or API required
- Works offline after first load

## Project structure

- `src/lib/mockData.ts` – in-memory data and localStorage load/save
- `src/lib/demoElectronAPI.ts` – `window.electronAPI` implementation used by the app
- `src/main.tsx` – initializes mock data and installs the demo API before rendering
