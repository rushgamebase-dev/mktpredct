# rushpredmkt

## O que é este projeto

Prediction market platform on-chain (Base L2). Parimutuel, multi-outcome, ETH-only.

> **Estado atual**: DEPLOYED NA BASE MAINNET. Contratos verificados. Frontend e backend prontos. Falta hosting de produção (API + DB + domínio).

### Filosofia central

> **"Legacy as reference, never as authority."**

---

## Regras fundamentais para o modelo

### Anti-alucinação

1. **NUNCA invente arquivo, função, classe ou endpoint que não existe.** Use `Glob`/`Grep` pra confirmar.
2. **NUNCA assuma que uma dependência está instalada.** Verifique `package.json`.
3. **Leia antes de editar.** Sempre `Read` o arquivo antes de mudar.
4. **Odds são 0-100 inteiros.** NUNCA multiplicar por 100. Já são porcentagem.
5. **Step-chart SEMPRE.** Todas as linhas de gráfico são step (escada), nunca smooth/bezier.

### Qualidade de código

6. **Não adicione código que não foi pedido.**
7. **Não crie abstrações prematuras.**
8. **Erre pelo lado simples.**

---

## Estado atual

- **Fase**: PRODUÇÃO — Contratos deployed e verificados na Base mainnet
- **Smart contracts**: 52/52 testes (31 core + 21 adversarial) + Slither clean
- **Backend API**: 16 arquivos, Hono + Drizzle + viem, 8 endpoints
- **Frontend**: 29 arquivos, Next.js 14, canvas charts Polymarket-style
- **Deploy**: Factory + 1 Market live na Base

### Contratos on-chain (Base Mainnet)

```
MarketFactory: 0x09257F570c77EdabfAcb7243712fFa8CcB0599f8
  BaseScan:    https://basescan.org/address/0x09257f570c77edabfacb7243712ffa8ccb0599f8
  Status:      ✅ VERIFIED
  Owner:       0x20E344f36Bc7c61CF925A23D6a51C02bFeaB888C
  Signer:      0x20E344f36Bc7c61CF925A23D6a51C02bFeaB888C
  FeeRecipient:0x20E344f36Bc7c61CF925A23D6a51C02bFeaB888C
  Fee:         5% (500 bps)

Market #1:   0x0880B8f8114a5a4b852a900826731E3F5A2500E4
  BaseScan:    https://basescan.org/address/0x0880b8f8114a5a4b852a900826731e3f5a2500e4
  Status:      ✅ VERIFIED
  Question:    "Will Bitcoin hit 200k by end of 2026?"
  Outcomes:    Yes / No
  Deadline:    2026-12-31 23:59:59 UTC
  Grace:       7 days
  Pool:        0 ETH (awaiting bets)
```

### O que existe

```
rushpredmkt/
├── package.json              # pnpm workspace root (pnpm@10.33.0)
├── pnpm-workspace.yaml
├── turbo.json
├── biome.json
├── tsconfig.base.json
├── docker-compose.yml        # postgres:16 (port 5435)
├── drizzle.config.ts
├── .env.example
├── .env                      # local dev (Anvil)
├── .env.production           # mainnet config (NÃO COMMITAR)
├── CLAUDE.md
│
├── contracts/                # Foundry
│   ├── src/Market.sol        # Parimutuel multi-outcome (immutable vars, min bet 0.001 ETH)
│   ├── src/MarketFactory.sol # Factory (onlyOwner, OwnershipTransferred event)
│   ├── test/Market.t.sol     # 31 tests
│   ├── test/Adversarial.t.sol # 21 adversarial tests (reentrancy, replay, dust, etc)
│   ├── script/DeployMainnet.s.sol
│   └── SPEC.md
│
├── packages/shared/          # @rush/shared
│   └── src/
│       ├── abi/              # Market + Factory ABIs (as const)
│       ├── types/            # market.ts, api.ts, ws.ts
│       ├── db/schema.ts      # 5 tables: markets, bets, claims, fees, sync_state
│       └── config.ts         # CHAIN_ID=8453, OUTCOME_COLORS, STATUS_MAP
│
├── apps/api/                 # @rush/api (Hono)
│   └── src/
│       ├── index.ts          # Server + indexer startup
│       ├── env.ts            # Zod validation + dotenv
│       ├── db.ts             # Drizzle client
│       ├── routes/           # markets, activity, positions, admin
│       ├── services/         # oracle.ts (ECDSA), chain.ts (viem)
│       ├── ws/               # WebSocket handler + EventEmitter broadcast
│       ├── indexer/          # factory-indexer + market-indexer (2s poll, 5-block confirm)
│       └── middleware/       # auth (API key), error handler
│
├── apps/web/                 # @rush/web (Next.js 14)
│   ├── app/
│   │   ├── page.tsx          # Landing: hero chart + ticker + hot markets + quick bet + how it works
│   │   └── markets/[address]/page.tsx  # Detail: chart + narrative + countdown + YES/NO + activity
│   ├── components/
│   │   ├── home/             # HeroChart, MarketSelector, LiveActivitySidebar
│   │   ├── market/           # InteractiveChart, MarketCard, BetForm, PositionsPanel, ActivityFeed, OddsBar
│   │   └── layout/           # Header (glass nav + categories)
│   ├── hooks/                # useMarkets, useBet, useClaim, useMarketFeed, useChart, etc (9 hooks)
│   └── lib/                  # wagmi, api, format, animations
│
├── modelo/                   # Legado — REFERÊNCIA VISUAL APENAS (não tocar)
├── migrations/               # Drizzle SQL migrations
└── scripts/dev.sh
```

### O que funciona

- `forge test` — 52/52 (31 core + 21 adversarial)
- `slither` — clean (findings são do OZ)
- `pnpm check` — zero TS errors em todos os packages
- E2E no Anvil — 26/26 cenários (create, bet, resolve, claim, cancel, expire, zero-winner)
- Factory deployed + verified na Base mainnet
- Market #1 deployed + verified na Base mainnet

### O que falta para produção completa

- [ ] Hosting da API (Railway, Fly.io, VPS)
- [ ] PostgreSQL de produção (Neon, Supabase, Railway)
- [ ] Domínio real + HTTPS
- [ ] Setar NEXT_PUBLIC_API_URL e NEXT_PUBLIC_WS_URL com domínio real
- [ ] Build do frontend (`next build`) e hosting (Vercel)
- [ ] Criar mais markets via admin API

---

## Decisões de arquitetura

- `[2026-04-01]` Legado (`modelo/`) é referência visual apenas
- `[2026-04-01]` Parimutuel multi-outcome (2-10), ETH-only, Base L2
- `[2026-04-01]` State machine: Open → Resolved | Cancelled | Expired (terminais)
- `[2026-04-01]` ECDSA signatures com type prefix ("resolve"/"cancel") + chainid
- `[2026-04-01]` Backend: Hono (minimal) + Drizzle (type-safe) + viem
- `[2026-04-01]` Frontend: Next.js 14 + wagmi v2 + React Query
- `[2026-04-01]` Indexer: poll-based (2s), 5-block confirmation
- `[2026-04-01]` Real-time: WebSocket via EventEmitter in-memory
- `[2026-04-01]` Monetary values: sempre string wei
- `[2026-04-02]` Charts: canvas custom, step-chart SEMPRE (nunca smooth)
- `[2026-04-02]` Odds: 0-100 inteiros (API e frontend)
- `[2026-04-02]` Minimum bet: 0.001 ETH (anti-spam)
- `[2026-04-02]` Deploy direto na Base mainnet (sem testnet)
- `[2026-04-02]` Open source: SEGURO — contratos verificados no BaseScan
- `[2026-04-02]` Mesma wallet pra owner, signer e feeRecipient (pode separar depois)
- `[2026-04-02]` feeRecipient pode ser trocado via Factory.setFeeRecipient() sem redeploy

---

## Convenções

- **Idioma do código**: Inglês
- **Formatting**: Biome (tabs, single quotes, no semicolons)
- **Testes contratos**: Foundry (forge test)
- **Monetary values**: sempre string wei (nunca float)
- **Odds**: 0-100 inteiros (nunca 0-1 decimal)
- **Charts**: step-chart (escada) sempre

---

## Comandos úteis

```bash
# Dev local (Anvil)
docker compose up -d          # PostgreSQL
anvil --chain-id 8453         # EVM local
pnpm db:migrate               # criar tabelas
pnpm dev                      # API (3000) + Web (3001)

# Contratos
cd contracts
forge test                    # 52 testes
forge test --match-contract AdversarialTest  # só adversariais
slither src/                  # static analysis

# Type-check
pnpm check                   # todos os packages

# Deploy (mainnet)
PRIVATE_KEY=0x... forge script script/DeployMainnet.s.sol --rpc-url https://mainnet.base.org --broadcast

# Criar market (via API)
curl -X POST http://localhost:3000/api/admin/markets \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ADMIN_API_KEY" \
  -d '{"question":"...","labels":["Yes","No"],"deadline":1798761599,"gracePeriod":604800}'

# Resolver market (via API)
curl -X POST http://localhost:3000/api/admin/markets/$ADDR/resolve \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ADMIN_API_KEY" \
  -d '{"winningOutcome": 0}'
```

---

## Segurança — checklist verificado

- [x] Divisão por zero → refund automático (zero-winner)
- [x] Claim duplo → `claimed[msg.sender]` before transfer
- [x] Resolve uma vez → `require(status == Open)`
- [x] Deadline hard lock → `require(timestamp < deadline)`
- [x] Signature com chainid + type prefix → no replay
- [x] Cancel/Refund flow → 3 caminhos de saída (cancel, expire, zero-winner)
- [x] Fee não quebra pool → calculada antes, sem underflow
- [x] Reentrancy → nonReentrant + CEI pattern
- [x] Gas edge case → loop max 10 outcomes
- [x] Minimum bet → 0.001 ETH
- [x] Max outcomes → 10
- [x] Direct ETH transfer → no receive/fallback
- [x] Unauthorized creation → onlyOwner
- [x] Slither → clean
- [x] 52/52 Foundry tests → passing

---

## Checklist de retomada de sessão

1. [ ] Leia este `CLAUDE.md`
2. [ ] Leia `MEMORY.md` do projeto
3. [ ] Rode `git status` e verifique estado atual
4. [ ] Verifique se contratos on-chain estão ok: `cast call --rpc-url https://mainnet.base.org 0x09257F570c77EdabfAcb7243712fFa8CcB0599f8 "marketCount()(uint256)"`
5. [ ] Verifique se há Tasks pendentes
