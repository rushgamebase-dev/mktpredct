import { Hono } from 'hono'
import { parseEventLogs } from 'viem'
import { MarketFactoryABI, MarketABI } from '@rush/shared'
import type { CreateMarketRequest, CreateMarketResponse, ResolveMarketRequest, TxResponse } from '@rush/shared'
import { adminAuth } from '../middleware/auth.js'
import { walletClient, publicClient } from '../services/chain.js'
import { signResolve, signCancel } from '../services/oracle.js'
import { env } from '../env.js'

const app = new Hono()

app.use('/*', adminAuth)

// POST /api/admin/markets
app.post('/markets', async (c) => {
  const body = await c.req.json<CreateMarketRequest>()

  if (!body.question || !body.labels || !body.deadline || !body.gracePeriod) {
    return c.json({ error: 'Missing required fields: question, labels, deadline, gracePeriod' }, 400)
  }

  if (body.labels.length < 2) {
    return c.json({ error: 'At least 2 labels required' }, 400)
  }

  const factoryAddress = env.FACTORY_ADDRESS as `0x${string}`

  const txHash = await walletClient.writeContract({
    address: factoryAddress,
    abi: MarketFactoryABI,
    functionName: 'createMarket',
    args: [
      body.question,
      body.labels,
      BigInt(body.deadline),
      BigInt(body.gracePeriod),
    ],
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

  const parsed = parseEventLogs({
    abi: MarketFactoryABI,
    logs: receipt.logs,
    eventName: 'MarketCreated',
  })

  let marketAddress = ''
  if (parsed.length > 0) {
    marketAddress = (parsed[0].args as any).market
  }

  const response: CreateMarketResponse = {
    txHash,
    marketAddress,
  }

  return c.json(response, 201)
})

// POST /api/admin/markets/:address/resolve
app.post('/markets/:address/resolve', async (c) => {
  const address = c.req.param('address').toLowerCase() as `0x${string}`
  const body = await c.req.json<ResolveMarketRequest>()

  if (body.winningOutcome === undefined || body.winningOutcome === null) {
    return c.json({ error: 'Missing required field: winningOutcome' }, 400)
  }

  const signature = await signResolve(address, body.winningOutcome)

  const txHash = await walletClient.writeContract({
    address: address,
    abi: MarketABI,
    functionName: 'resolve',
    args: [BigInt(body.winningOutcome), signature],
  })

  await publicClient.waitForTransactionReceipt({ hash: txHash })

  const response: TxResponse = { txHash }
  return c.json(response)
})

// POST /api/admin/markets/:address/cancel
app.post('/markets/:address/cancel', async (c) => {
  const address = c.req.param('address').toLowerCase() as `0x${string}`

  const signature = await signCancel(address)

  const txHash = await walletClient.writeContract({
    address: address,
    abi: MarketABI,
    functionName: 'cancel',
    args: [signature],
  })

  await publicClient.waitForTransactionReceipt({ hash: txHash })

  const response: TxResponse = { txHash }
  return c.json(response)
})

export default app
