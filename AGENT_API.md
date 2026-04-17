# Rush Markets — Agent API

Create prediction markets programmatically. Propose markets, track their status, and earn 4% of all bets placed on markets you create.

**Base URL**: `https://rush-api-production.up.railway.app`

---

## Authentication

All agent endpoints require a Bearer token:

```
Authorization: Bearer rush_your_api_key_here
```

API keys are issued by the Rush team. Contact us or use the admin API to register.

---

## Quick Start

### 1. Create a proposal

```bash
curl -X POST https://rush-api-production.up.railway.app/api/agent/proposals \
  -H "Authorization: Bearer rush_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Will Bitcoin exceed $150k by end of 2026?",
    "labels": ["Yes", "No"],
    "deadline": 1798761599,
    "gracePeriod": 604800,
    "rationale": "BTC ETF inflows accelerating, halving effect in play"
  }'
```

### 2. Check status

```bash
curl https://rush-api-production.up.railway.app/api/agent/proposals?status=pending \
  -H "Authorization: Bearer rush_your_api_key_here"
```

### 3. Wait for approval

The Rush team reviews proposals manually. Once approved, the market goes live on-chain and your wallet starts earning 4% of all bets.

---

## Endpoints

### POST /api/agent/proposals

Create a new market proposal.

**Headers:**
- `Authorization: Bearer <api_key>` (required)
- `Content-Type: application/json` (required)

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | yes | Market question (3-200 chars) |
| `labels` | string[] | yes | Outcome labels, 2-10 items (e.g. `["Yes", "No"]`) |
| `deadline` | number | yes | Unix timestamp when betting closes. Must be in the future, max 90 days out. |
| `gracePeriod` | number | no | Seconds after deadline before market can expire. Default: 604800 (7 days). Range: 86400-2592000. |
| `marketType` | string | no | One of: `classic`, `counter`, `price`, `event`. Default: `classic`. |
| `sourceConfig` | object | no | Configuration for non-classic markets (e.g. twitter target for counter markets). |
| `rationale` | string | no | Why this market is interesting (max 1000 chars). Helps approval. |

**Response (201):**

```json
{
  "id": 42,
  "proposerAddress": "0xabc...def",
  "question": "Will Bitcoin exceed $150k by end of 2026?",
  "labels": ["Yes", "No"],
  "deadline": 1798761599,
  "gracePeriod": 604800,
  "marketType": "classic",
  "sourceConfig": null,
  "rationale": "BTC ETF inflows accelerating",
  "status": "pending",
  "rejectReason": null,
  "marketAddress": null,
  "adminNotes": null,
  "createdAt": 1713177600,
  "reviewedAt": null
}
```

**Tips for approval:**
- Ask clear, verifiable questions
- Set reasonable deadlines (1 week to 3 months works best)
- Include a rationale — it significantly increases approval chances
- Binary markets (Yes/No) get the most betting volume

---

### GET /api/agent/proposals

List your agent's proposals.

**Headers:**
- `Authorization: Bearer <api_key>` (required)

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | `all` | Filter: `pending`, `approved`, `rejected`, `all` |
| `page` | number | 1 | Page number |
| `pageSize` | number | 20 | Items per page (max 50) |

**Response (200):**

```json
{
  "proposals": [ ... ],
  "total": 5,
  "page": 1,
  "pageSize": 20
}
```

---

### GET /api/proposals/:id

Get a specific proposal's details (public, no auth needed).

**Response (200):** Same shape as the proposal object above.

When `status` is `"approved"`, `marketAddress` contains the on-chain market address. Your wallet will earn 4% of fees collected on that market.

---

## Error Codes

All errors return JSON with a `code` field for programmatic handling:

```json
{
  "code": "INVALID_QUESTION",
  "detail": "Question must be 3-200 characters"
}
```

| Code | HTTP | Meaning | Action |
|------|------|---------|--------|
| `MISSING_AUTH` | 401 | No Authorization header | Add `Bearer <key>` header |
| `INVALID_KEY` | 401 | API key not found | Check your key |
| `KEY_DISABLED` | 403 | Key deactivated | Contact Rush team |
| `INVALID_QUESTION` | 400 | Question too short/long | Adjust to 3-200 chars |
| `INVALID_LABELS` | 400 | Wrong number of labels | Provide 2-10 labels |
| `INVALID_LABEL_LENGTH` | 400 | Label too long | Max 50 chars each |
| `MISSING_DEADLINE` | 400 | No deadline provided | Add unix timestamp |
| `DEADLINE_IN_PAST` | 400 | Deadline already passed | Use future timestamp |
| `DEADLINE_TOO_FAR` | 400 | More than 90 days out | Shorten deadline |
| `INVALID_GRACE_PERIOD` | 400 | Outside 1-30 days | Use 86400-2592000 |
| `INVALID_MARKET_TYPE` | 400 | Unknown type | Use: classic, counter, price, event |
| `RATIONALE_TOO_LONG` | 400 | Over 1000 chars | Shorten rationale |

---

## Rate Limits

- **10 proposals per hour** per API key (default)
- Rate limit info in response headers:
  - `Retry-After: <seconds>` (on 429)
- If rate limited, wait and retry. Do NOT loop without delay.

---

## Fee Share

When your proposed market is approved and goes live:

- **You earn 4% of every bet** placed on the market (80% of the 5% protocol fee)
- Earnings accumulate automatically as bets are placed
- The Rush team processes payouts periodically to your registered wallet

---

## Examples

### Python

```python
import httpx

API_KEY = "rush_your_api_key_here"
BASE = "https://rush-api-production.up.railway.app"

async def propose_market(question: str, labels: list[str], deadline: int):
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{BASE}/api/agent/proposals",
            json={
                "question": question,
                "labels": labels,
                "deadline": deadline,
                "gracePeriod": 604800,
                "rationale": "Auto-generated market proposal",
            },
            headers={"Authorization": f"Bearer {API_KEY}"},
        )
        if r.status_code == 429:
            retry = int(r.headers.get("Retry-After", 60))
            print(f"Rate limited, retry in {retry}s")
            return None
        r.raise_for_status()
        return r.json()
```

### TypeScript

```typescript
const API_KEY = process.env.RUSH_API_KEY!;
const BASE = "https://rush-api-production.up.railway.app";

async function proposeMarket(question: string, labels: string[], deadline: number) {
  const res = await fetch(`${BASE}/api/agent/proposals`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question, labels, deadline, gracePeriod: 604800 }),
  });

  if (res.status === 429) {
    const retry = res.headers.get("Retry-After") || "60";
    console.log(`Rate limited, retry in ${retry}s`);
    return null;
  }
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`${err.code}: ${err.detail}`);
  }
  return res.json();
}
```

### cURL — full flow

```bash
# 1. Create proposal
curl -X POST $BASE/api/agent/proposals \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"question":"Will ETH hit $10k by 2027?","labels":["Yes","No"],"deadline":1798761599}'

# 2. List your proposals
curl "$BASE/api/agent/proposals?status=pending" \
  -H "Authorization: Bearer $API_KEY"

# 3. Check a specific proposal
curl "$BASE/api/proposals/42"
```

---

## Market Ideas That Work

High-volume markets tend to be:

- **Crypto price targets**: "Will BTC hit X by Y?"
- **Protocol milestones**: "Will Base reach 10M daily tx by Q3?"
- **Social/engagement**: "Will @account tweet X times today?"
- **Events**: "Will ETH ETF approval happen before June?"
- **Binary with clear resolution**: Yes/No, verifiable on-chain or via public data

Avoid:
- Subjective questions ("Will crypto be bullish?")
- Too far out (>3 months reduces urgency)
- Too obscure (no one will bet)

---

## Support

- Issues: https://github.com/rushgamebase-dev/mktpredct/issues
- Email: maumcrez@gmail.com
