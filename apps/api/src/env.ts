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
  CHAIN_ID: z.coerce.number().int().positive(),
  FACTORY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  SIGNER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  OWNER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  ADMIN_API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
})

export const env = envSchema.parse(process.env)
export type Env = z.infer<typeof envSchema>
