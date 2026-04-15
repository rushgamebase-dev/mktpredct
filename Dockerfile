FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm@10.33.0

# Copy workspace manifests and lockfile so pnpm can resolve deterministically.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Frozen lockfile prevents silent drift between local and production builds.
# Scope install to @rush/api + its transitive deps — the web app is built on Vercel.
RUN pnpm install --frozen-lockfile \
	--filter @rush/api \
	--filter @rush/shared

# Copy source
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

EXPOSE 3000

CMD ["pnpm", "--filter", "@rush/api", "dev"]
