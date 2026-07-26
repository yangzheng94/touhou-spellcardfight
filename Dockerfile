FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production && npm cache clean --force

COPY --from=builder /app/packages/engine/src/ ./packages/engine/src/
COPY --from=builder /app/packages/server/src/ ./packages/server/src/
COPY --from=builder /app/packages/client/dist/ ./packages/client/dist/

RUN npm install -g tsx

ENV PORT=8080
EXPOSE 8080

CMD ["tsx", "packages/server/src/prod.ts"]
