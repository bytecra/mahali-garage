ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-bullseye AS base

ENV PNPM_HOME=/pnpm \
    NODE_ENV=production
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 make g++ git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies separately for better caching
FROM base AS deps

COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* ./ 

# Prefer pnpm/yarn if lockfile exists, otherwise npm
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Build stage
FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the Electron app (renderer + main)
RUN npm run build

# Optional: create distributables (uncomment if you want packaging inside Docker)
# RUN npm run make

# Runtime image for running CLI tasks or building artifacts
# NOTE: Electron is a desktop app; this container is mainly useful for CI/builds,
# not for running the full GUI.
FROM base AS runner

WORKDIR /app

COPY --from=build /app ./

# Default command: open a shell. Override with `docker run ... npm run make` etc.
CMD [\"bash\"]

