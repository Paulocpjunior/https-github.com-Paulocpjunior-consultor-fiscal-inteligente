# ─── Proxy Backend — Consultor Fiscal ───────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Instala dependências primeiro (cache layer)
COPY package*.json ./
RUN npm install --omit=dev
# Copia código fonte
COPY src/ ./src/

# Cloud Run usa porta 8080
EXPOSE 8080

# Usuário não-root (segurança)
USER node

CMD ["node", "src/server.js"]
