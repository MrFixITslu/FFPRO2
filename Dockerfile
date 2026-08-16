# Multi-stage build to minimize container size and maximize speed
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (for better build caching)
COPY package*.json ./
RUN npm ci

# Copy all source files
COPY . .

# Run the build script:
# - vite build  → builds frontend into dist/
# - esbuild     → bundles server.ts + all routes into dist/server.cjs
RUN npm run build

# --- Production Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy the entire dist/ directory which contains:
#   dist/index.html + dist/assets/*  → frontend (served as static files)
#   dist/server.cjs                  → bundled Node/Express backend
COPY --from=builder /app/dist ./dist

# Expose port 80 — Node listens on $PORT (set to 80 in docker-compose.yml)
EXPOSE 80

# Start the bundled server
CMD ["node", "dist/server.cjs"]
