FROM node:24-bookworm-slim

WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile

EXPOSE 8080