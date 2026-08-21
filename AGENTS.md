# GraphAtlas — Agent & Contributor Guide

## Stack

- **Runtime**: Bun 1.x (TypeScript, ESM) — API + worker + retrieval core.
- **Web**: React 18 + Vite + Tailwind CSS (React Flow added in Day 4).
- **Database**: PostgreSQL 17 + pgvector (local Homebrew `postgresql@17` or
  `docker compose up -d`).
- **Graph build**: Python 3.11 sidecar using `lightrag-hku` (lands Day 2).

## Commands

```bash
bun install              # install all workspaces
bun run setup            # copy .env.example -> .env, start DB, install deps
bun run dev:all          # API (:3001) + web (:3000)
bun run typecheck        # all workspaces
bun test                 # unit/integration tests (bun test)
bun run db:init          # run migrations (packages/db)
```

## Ticket-gated workflow (one ticket = one PR)

- Branch: `feat/<ISSUE>-<kebab-slug>` (e.g. `feat/ZHA-55-repo-scaffold`).
- Commit & PR title prefix: `<ISSUE>: type(scope): description`
  (e.g. `ZHA-55: feat: scaffold monorepo`).
- A ticket is **Done** only after its PR is approved/merged/closed.
- Verification gate before Done: `bun run typecheck`, `bun test`,
  `npm run build` (web) all green; integration/e2e per ticket.

## Conventions

- TypeScript strict mode everywhere (`tsconfig.base.json`).
- One PR per ticket; no unrelated changes in a PR.
- `.env` and `*.local.md` are never committed.
