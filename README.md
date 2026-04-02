# Rush Prediction Market

On-chain prediction market protocol on **Base L2**. Parimutuel, multi-outcome, ETH-only.

> **Live on Base Mainnet** — [Factory on BaseScan](https://basescan.org/address/0x09257f570c77edabfacb7243712ffa8ccb0599f8)

---

## How It Works

1. **Markets** are created with a question and 2–10 outcomes
2. **Users bet** ETH on their predicted outcome
3. **Oracle resolves** the market after the deadline
4. **Winners claim** proportional payouts from the pool (minus 5% fee)

If the oracle disappears, anyone can trigger an **expiration refund** after the grace period. Markets can also be **cancelled** for a full refund.

---

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌──────────────┐
│  Next.js 14 │────▶│ Hono API │────▶│  PostgreSQL   │
│  (frontend) │     │ (backend)│     │  (indexer DB) │
└──────┬──────┘     └────┬─────┘     └──────────────┘
       │                 │
       │    wagmi/viem   │    viem
       │                 │
       ▼                 ▼
┌──────────────────────────────┐
│      Base L2 (EVM)           │
│  MarketFactory → Market(s)   │
└──────────────────────────────┘
```

| Layer | Tech | Description |
|---|---|---|
| **Contracts** | Solidity 0.8.28 / Foundry | MarketFactory + Market, ECDSA oracle, ReentrancyGuard |
| **Backend** | Hono + Drizzle + viem | REST API, event indexer, oracle signing, WebSocket |
| **Frontend** | Next.js 14 + wagmi v2 | Canvas step-charts, live activity feed, wallet integration |
| **Database** | PostgreSQL + Drizzle ORM | Markets, bets, claims, fees, sync state |
| **Chain** | Base (L2) | Low gas, fast finality |

---

## Contracts

| Contract | Address | Status |
|---|---|---|
| MarketFactory | [`0x09257F57...0599f8`](https://basescan.org/address/0x09257f570c77edabfacb7243712ffa8ccb0599f8) | ✅ Verified |
| Market (BTC 200k) | [`0x0880B8f8...2500E4`](https://basescan.org/address/0x0880b8f8114a5a4b852a900826731e3f5a2500e4) | ✅ Verified |

### State Machine

```
Open ──── resolve() ───▶ Resolved  (winners claim, fee collected)
  │
  ├───── cancel() ─────▶ Cancelled (full refund, no fee)
  │
  └───── expire() ─────▶ Expired   (full refund, no fee)
```

### Security

- **52 tests** (31 core + 21 adversarial) — all passing
- **Slither** static analysis — clean
- **ReentrancyGuard** on claim() and withdrawFee()
- **ECDSA signatures** with type prefix + chainId (no replay attacks)
- **Minimum bet**: 0.001 ETH
- **Max outcomes**: 10
- Zero stuck funds across all tested scenarios

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- pnpm
- Docker (for PostgreSQL)
- Foundry (for contracts)

### Local Development

```bash
# Clone
git clone https://github.com/rushgamebase-dev/mktpredct.git
cd mktpredct

# Setup
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate

# Start local blockchain
anvil --chain-id 8453 --block-time 2

# Deploy contracts locally
cd contracts
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
cd ..

# Update .env with factory address, then:
pnpm dev
```

API runs on `http://localhost:3000`, frontend on `http://localhost:3001`.

### Run Tests

```bash
cd contracts
forge test          # 52 tests
slither src/        # static analysis
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/markets` | List markets (pagination, status filter) |
| GET | `/api/markets/:address` | Market detail with odds |
| GET | `/api/markets/:address/activity` | Bet history |
| GET | `/api/markets/:address/chart` | Odds time-series |
| GET | `/api/markets/:address/positions/:user` | User positions + claimable |
| POST | `/api/admin/markets` | Create market (admin) |
| POST | `/api/admin/markets/:address/resolve` | Resolve market (admin) |
| POST | `/api/admin/markets/:address/cancel` | Cancel market (admin) |
| WS | `/ws/:address` | Real-time market feed |

---

## Project Structure

```
├── contracts/          # Solidity (Foundry)
│   ├── src/            # Market.sol, MarketFactory.sol
│   └── test/           # 52 tests (core + adversarial)
├── packages/shared/    # Types, ABIs, DB schema
├── apps/api/           # Hono backend (16 files)
└── apps/web/           # Next.js frontend (29 files)
```

---

## License

MIT
