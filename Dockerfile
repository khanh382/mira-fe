# Build static export (next.config.mjs: output: 'export')
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* chỉ có hiệu lúc `npm run build` (static export). Ưu tiên: file `frontend/.env.local`
# trong build context (xem .dockerignore: !.env.local). Nếu không có .env.local, truyền build-arg:
#   docker build --build-arg NEXT_PUBLIC_API_URL=https://example.com ...
# ARG trống + không có .env → bundle thiếu URL → Socket/API client không chạy.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_APP_DESCRIPTION
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_APP_DESCRIPTION=$NEXT_PUBLIC_APP_DESCRIPTION

RUN npm run build

# Serve the `out` directory (static HTML/CSS/JS)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3500

RUN npm install -g serve@14

COPY --from=builder /app/out ./out

EXPOSE 3500

# Có thể ghi đè PORT khi chạy container (ví dụ -e PORT=8080)
CMD ["sh", "-c", "serve out -l tcp://0.0.0.0:${PORT:-3500}"]
