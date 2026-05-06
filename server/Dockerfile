FROM node:22-alpine

WORKDIR /app

# Install deps first (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Persistent volume mount target (sqlite db + WAL)
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV PORT=3200
ENV HOST=0.0.0.0
EXPOSE 3200

CMD ["node", "server.js"]
