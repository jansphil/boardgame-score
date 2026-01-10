# Boardgame Score Tracker

A minimal, frontend-only web app to track scores for board games.

- Add players
- Rename players by clicking their name
- Remove players
- Add positive or negative scores
- Data persists locally (IndexedDB)
- No login, no backend

Built for fast use at the table.

## Tech Stack

- **Svelte + Vite**
- **TypeScript**
- **Tailwind CSS**
- **IndexedDB** (via Dexie)
- **GitHub Pages** for hosting

## Development

Install dependencies and start the dev server:

```bash
bun install
bun run dev
```

You can build the project with:

```bash
bun run build
```

Preview the production build locally:

```bash
bun run preview
```

Formatting is done via prettier:

```bash
bun run format
```

## Notes

- Data is stored per browser/device.
- Clearing site data will reset all scores.
