# Webhook Channels API Docs

Tai lieu tong hop cac webhook channel inbound dang hoat dong trong backend.

## Telegram

Controller: `src/gateway/webhooks/telegram-webhook.controller.ts`

- `POST /webhooks/telegram/:botToken`
- Chuyen update sang `TelegramUpdateProcessorService`.

## Discord

Controller: `src/gateway/webhooks/discord-webhook.controller.ts`

Endpoints:

- `POST /webhooks/discord/:botToken`
- `POST /webhooks/discord`

Hanh vi chinh:

- Ho tro verify code 6 ky tu hex cho luong cap quyen guest.
- Kiem tra truy cap qua `BotAccessService.checkAccess`.
- Neu deny thi tra noi dung huong dan xin cap quyen.
- Neu allow thi dua tin nhan vao `GatewayService.handleMessage`.

## Zalo

Controller: `src/gateway/webhooks/zalo-webhook.controller.ts`

Endpoints:

- `GET /webhooks/zalo` (ping + huong dan cau hinh)
- `POST /webhooks/zalo/:botToken`
- `POST /webhooks/zalo`

Hanh vi chinh:

- Verify header `X-Bot-Api-Secret-Token` cho event Bot Platform.
- Ho tro verify code cap quyen guest.
- Kiem tra truy cap qua `BotAccessService.checkAccess`.
- Ho tro text va mot so media inbound, roi dua vao `GatewayService.handleMessage`.

## N8N callback

Controller: `src/gateway/webhooks/n8n-callback.controller.ts`

- Endpoint callback rieng cho luong n8n integration.

## Ghi chu chung

- Cac webhook channel khong dung JWT.
- Xac thuc/phan quyen theo token channel + bot access logic.
- Sau khi pass access control, tin nhan deu vao `GatewayService` de dung chung pipeline agent.
