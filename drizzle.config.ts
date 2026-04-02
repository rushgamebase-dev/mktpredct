import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	schema: './packages/shared/src/db/schema.ts',
	out: './migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
})
