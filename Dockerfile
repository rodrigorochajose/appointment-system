# ---- Builder ----
FROM node:20-slim AS builder

WORKDIR /app

# Instala todas as dependências (inclui dev, necessárias para o build)
COPY package*.json ./
RUN npm ci

# Compila o projeto
COPY . .
RUN npm run build

# Remove as devDependencies para enxugar o node_modules de produção
RUN npm prune --omit=dev

# ---- Runner ----
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copia apenas o necessário para rodar
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# As migrations são arquivos .sql (não compilados), precisam ir junto
COPY --from=builder /app/src/database/migrations ./src/database/migrations
COPY package*.json ./

EXPOSE 3000

# Roda as migrations e sobe a API
CMD ["sh", "-c", "node dist/src/database/migrate.js && node dist/src/main"]
