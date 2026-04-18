# Contributing to Rush Markets

Thanks for wanting to contribute. This is a focused product; PRs that make markets safer, the app clearer, or the Agent API easier to use are always welcome.

## Ground Rules

- **Open an issue first** for anything that is not a trivial fix. A 2-line description of the problem and the intended approach prevents wasted work.
- **One change per PR.** Mixing a bug fix with a refactor makes review much harder.
- **Keep the UI surface stable.** Smart contracts are immutable once deployed; changes that affect how users interact with them need extra scrutiny.
- **No new dependencies** in the hot path without discussing it first.

## Repository Layout

This is a pnpm + Turbo monorepo:

```
contracts/        Solidity (Foundry). Market.sol, MarketFactory.sol, 52 tests
packages/shared/  Types, ABIs, Drizzle schemas
apps/api/         Hono backend + indexer + oracle signer + WebSocket
apps/web/         Next.js 14 frontend (wagmi v2, canvas step-charts)
migrations/       Drizzle SQL migrations
scripts/          Dev helpers
```

## Development Setup

```bash
# Prereqs: Node >=20, pnpm, Docker, Foundry
git clone https://github.com/rushgamebase-dev/mktpredct.git
cd mktpredct
cp .env.example .env

docker compose up -d           # Postgres
pnpm install
pnpm db:migrate

# Local chain + contracts (in another terminal)
anvil --chain-id 8453 --block-time 2
cd contracts
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast

# API + web
pnpm dev                       # API on :3000, web on :3001
```

## What a Good PR Looks Like

- **Title:** `<area>: <what changed>` — e.g. `web: fix step-chart jitter at 30fps` or `contracts: gas-optimize claim loop`
- **Description:**
  - What the problem was (one paragraph, link the issue if applicable)
  - What the change does (one paragraph)
  - How you tested it (commands, screenshots, or a short screencast)
- **Small and reviewable:** under ~300 lines changed when possible
- **No unrelated reformats.** Run `pnpm lint:fix` / `forge fmt` on files you actually edited, not on everything.

## Smart Contracts

- All new functionality needs Foundry unit tests (both regular and adversarial where relevant). Follow patterns in `contracts/test/Market.t.sol` and `Adversarial.t.sol`.
- Use custom errors or clear revert reasons — never a silent return on failure.
- External calls must respect the checks-effects-interactions pattern.
- Run `slither src/` locally before submitting. New findings need to be explained in the PR description.
- Any change that touches the public contract interface requires a coordinated deployment plus an ABI update in `packages/shared` in the same PR.

## API (Hono + Drizzle)

- Validate every incoming payload with Zod at the route boundary; do not trust the indexer's state either.
- Errors must return the `{ code, detail }` shape documented in [AGENT_API.md](AGENT_API.md).
- Do not query-loop inside a tight event handler; use the indexer + EventEmitter patterns already in `apps/api/src/indexer` and `apps/api/src/ws`.
- New env vars: add to `.env.example`, validate in `apps/api/src/env.ts`, document in the PR.

## Frontend (Next.js + wagmi)

- TypeScript strict, no `any` in new code.
- `wagmi` v2 requires `parseAbi()` on every ABI string — do not pass raw strings.
- Charts are **always step-charts** (escada) — no smoothing, no bezier.
- Odds are 0–100 integers end to end. Never multiply by 100.
- Monetary values are strings in wei. Never floats.

## Documentation

- If you change user-visible behavior, update the relevant doc (`README.md`, `AGENT_API.md`) in the same PR.
- Keep examples runnable — no placeholder addresses, no "coming soon" sections.

## Security

Never commit a private key, API key, or unredacted `.env`. Run `git diff --staged` before pushing. If you discover a vulnerability, please do **not** file a public issue — see [SECURITY.md](SECURITY.md).

## License

All contributions are licensed under the MIT license of this repository. By opening a PR you confirm you have the right to contribute the code under that license.
