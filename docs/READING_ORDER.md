# Reading order / execution map

1. `AGENTS.md`: guardrails.
2. `prompts/MASTER_PROMPT.md`: product contract and delivery requirements.
3. `design/UI_SPEC.md` + `design/SCREENS.md` + `design/TOKENS.json`: visual system, navigation and states.
4. `design/preview.html`: static visual reference; **not** production code.
5. `docs/ARCHITECTURE.md`: app/server boundaries, suggested folder layout.
6. `database/README.md`, `database/001_initial_schema.sql`: schema starter. Inspect all SQL and existing repo first.
7. `docs/PAYMENTS_AND_ORDERS.md`: transactional rules and QRIS caveat.
8. `docs/SECURITY.md`, `docs/NOTIFICATIONS.md`: RLS, authenticated operations and delivery.
9. `docs/TEST_PLAN.md` + `examples/ACCEPTANCE.md`: measurable Definition of Done.
10. `examples/.env.example`: required configuration (no credentials).

Implementation: deliver in vertical slices. During context resets, reopen `AGENTS.md` and `IMPLEMENTATION_LOG.md`.
