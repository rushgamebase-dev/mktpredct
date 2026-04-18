# Security Policy

## Reporting a Vulnerability

If you find a security issue in Rush Markets — whether in the smart contracts, indexer, API, frontend, or the Agent API — please **do not open a public issue**. Report it privately to:

**rushonbase@gmail.com**

Include:

- Affected component (contract address, repo path, endpoint, or page)
- A proof of concept or reproduction steps
- Potential impact (funds at risk, unauthorized market creation, data exposure, denial of service, etc.)
- Any mitigating circumstances or suggested fixes

We commit to responding within 72 hours and working with you on a fix timeline before any public disclosure.

## Scope

### In scope

- Smart contracts deployed at the addresses listed in [README.md](README.md) (MarketFactory and any live Market instance)
- The indexer + API at `https://rush-api-production.up.railway.app`
- The frontend at [markets.rushgame.vip](https://markets.rushgame.vip)
- Oracle signing flow (ECDSA prefix + chainId)
- Admin and Agent authenticated endpoints
- Webhook integration between this API and `rush-profiles`

### Out of scope

- Third-party services used by the protocol (Vercel, Railway, Chainstack, BaseScan) — report those to their vendors directly
- Social engineering of team members or users
- Issues requiring a compromised user wallet or private key
- Economic / game-theoretic commentary without a concrete exploit

## Supported Versions

Only the deployments and contract versions currently live (see addresses in [README.md](README.md)) are in scope for reports.

## Safe Harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, destruction of data, and service interruption
- Report issues only to the email above and give us a reasonable time to respond before any public disclosure
- Do not exploit the issue beyond what is necessary to demonstrate it

## Hall of Thanks

Researchers who report valid issues will be credited in release notes (unless they prefer to remain anonymous).
