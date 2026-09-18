# Build context is the repo root (see docker-compose.yml) so this can also
# copy db/*.sql, which lives outside the backend/ directory.
FROM node:24-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev

COPY backend/src ./src
COPY db /app/db

ENV NODE_ENV=production
ENV MIGRATIONS_DIR=/app/db
EXPOSE 4000

CMD ["node", "src/server.js"]
