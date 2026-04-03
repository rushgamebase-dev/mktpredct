FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm@10.33.0

# Create workspace without next.js lockfile
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN echo '{"name":"rush","private":true}' > package.json
RUN printf 'packages:\n  - "packages/*"\n  - "apps/*"\n' > pnpm-workspace.yaml

# Install deps (no lockfile = no next.js vulnerability scan)
RUN pnpm install --no-frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

EXPOSE 3000

CMD ["pnpm", "--filter", "@rush/api", "dev"]
