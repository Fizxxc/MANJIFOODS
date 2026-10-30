# MANJI FOOD — CODEX ENTRY POINT

**Run Codex from the actual Next.js repository root.** Extract this ZIP into the repo (or place this folder beside it) and send Codex:

> Read `manji-food-kit/START_HERE.md`, `manji-food-kit/AGENTS.md`, and every document referenced by `manji-food-kit/docs/READING_ORDER.md`. Inspect the current repo before changing files. Implement MANJI FOOD according to those specs in the EXISTING project, end-to-end, using Supabase. Do not stop at a mockup. Track verified progress and blockers in `IMPLEMENTATION_LOG.md`. Run tests, typecheck and production build, and report what actually works. Never invent credentials or pretend static QRIS is automated.

If you extracted the contents directly into the repository root instead, omit the `manji-food-kit/` prefix.

## What is in this bundle?
- `AGENTS.md`: persistent Codex rules and execution priority.
- `prompts/MASTER_PROMPT.md`: complete implementation specification.
- `docs/`: workflow, routes, architecture, security, payments, tests, handoff.
- `design/`: tokens, UI wireframes, component states, standalone HTML design reference.
- `database/`: Supabase schema starter, RLS guidance, implementation notes.
- `examples/`: environment variables and acceptance matrix.

**Important:** This is a *complete implementation-specification kit*, not a claim that the production app has already been implemented. Static HTML design reference is deliberately not the production app. SQL migration is a starter and must be reviewed and completed with atomic server-side RPC functions before launch.
