FROM node:22-alpine

WORKDIR /app

# build context มาได้ 2 แบบ — รองรับทั้งคู่:
#   - root ของ repo   : Dokploy หลังอัปเดต (09/2569) ส่ง context เป็น root แม้ Build Path = /server
#                       → package.json อยู่ที่ /src/server (มี .dockerignore ที่ root ส่งมาเฉพาะ server/)
#   - โฟลเดอร์ server/ : docker build ในเครื่อง / Dokploy รุ่นเก่า → package.json อยู่ที่ /src
COPY . /src
RUN set -e; \
    if [ -f /src/server/package.json ]; then SRC=/src/server; else SRC=/src; fi; \
    cp -a "$SRC"/. /app/; \
    rm -rf /src /app/node_modules; \
    npm ci --omit=dev

# Persistent volume mount target (sqlite db + WAL)
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV PORT=3200
ENV HOST=0.0.0.0
EXPOSE 3200

CMD ["node", "server.js"]
