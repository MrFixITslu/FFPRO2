# Multi-stage build to minimize container size and maximize speed
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies first (for better build caching)
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci || npm install; else npm install; fi

# Copy all source files
COPY . .

# Run the build script:
# - vite build  → builds frontend into dist/
# - esbuild     → bundles server.ts + all routes into dist/server.cjs
RUN npm run build

# --- Production Stage ---
FROM node:20-slim AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev || npm install --omit=dev; else npm install --omit=dev; fi

# Copy the entire dist/ directory which contains:
#   dist/index.html + dist/assets/*  → frontend (served as static files)
#   dist/server.cjs                  → bundled Node/Express backend
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/data

# Expose container port 3010
EXPOSE 3010

# Start the bundled server
CMD ["node", "dist/server.cjs"]

