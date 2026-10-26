# Build context is the repository root (see railway.json), so the shared package is available.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies for the server and shared workspaces only.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server --workspace shared --include-workspace-root=false

COPY shared shared
COPY server server

EXPOSE 8080
CMD ["npm", "start", "--workspace", "server"]
