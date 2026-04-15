import { config } from 'dotenv'
import { resolve } from 'node:path'
import { z } from 'zod'

// Load .env from monorepo root
config({ path: resolve(process.cwd(), '../../.env') })
// Also try cwd (for when running from root)
config({ path: resolve(process.cwd(), '.env') })

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RPC_URL: z.string().min(1),
  WS_RPC_URL: z.string().min(1).optional(),
  CHAIN_ID: z.coerce.number().int().positive(),
  FACTORY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  // Bloco de deploy da factory — usado como ponto de partida quando não há
  // syncState (restart após dump/migration). Sem isso, o indexer varre desde 0.
  FACTORY_DEPLOY_BLOCK: z.coerce.number().int().nonnegative().optional(),
  SIGNER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  OWNER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  ADMIN_API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  // CORS: domínio do frontend. Opcional; default é markets.rushgame.vip em produção.
  FRONTEND_URL: z.string().url().optional(),
  // TwitterAPI.io key para counter markets. Opcional (counter markets ficam sem dados se ausente).
  TWITTER_API_KEY: z.string().min(1).optional(),
})

export const env = envSchema.parse(process.env)
export type Env = z.infer<typeof envSchema>
