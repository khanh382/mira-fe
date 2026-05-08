# Connect Webhooks API Docs

Tai lieu nay mo ta API `connect-webhooks` dang duoc su dung trong he thong.

## Tong quan

- Public LLM endpoint (stateless): `/connect-webhooks/v1/*`
- Admin endpoint (owner-only, JWT): `/connect-webhooks/admin/*`
- Public endpoint dung bearer key rieng, khong dung JWT.
- Module code: `src/modules/connect-webhooks/*`

## Public API

Auth:

- Guard: `ConnectWebhookBearerGuard` + `ConnectWebhookQueueGuard`
- Header: `Authorization: Bearer <connect_webhook_api_key>`
- Co kiem tra domain qua `Origin`/`Referer` (tuy env `CONNECT_WEBHOOK_REQUIRE_ORIGIN`).

Endpoints:

- `POST /connect-webhooks/v1/chat`
- `POST /connect-webhooks/v1/webhook/chat` (alias)

Body toi thieu:

```json
{
  "messages": [
    { "role": "user", "content": "Xin chao" }
  ]
}
```

Response payload (duoc wrap boi response interceptor):

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "model": "openrouter/...",
    "content": "...",
    "usage": {
      "promptTokens": 0,
      "completionTokens": 0,
      "totalTokens": 0
    }
  }
}
```

## Admin API (owner + JWT)

Controller: `ConnectWebhooksAdminController`

Base: `/connect-webhooks/admin`

- `GET /api-keys`
- `POST /api-keys` (body: `{ "cwDomain": "example.com" }`)
- `POST /api-keys/:cwId/refresh`
- `PATCH /api-keys/:cwId` (body: `cwUseSubdomains`, `cwStatus`)
- `DELETE /api-keys/:cwId`
- `GET /api-keys/:cwId/usage/summary`
- `GET /api-keys/:cwId/usage/events`

## Luu y van hanh

- Tao/refresh key se tra plaintext key mot lan.
- Usage events duoc ghi rieng qua `ConnectWebhookUsageService`.
- Queue/rate limit duoc ap dung boi queue guard de tranh dot bien tai.
