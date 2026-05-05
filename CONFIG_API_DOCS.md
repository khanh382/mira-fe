# Config API Docs

Tai lieu mo ta API module `config`.

## Tong quan

- Base route (app): **`/api/v1/config`** (prefix toàn cục `api/v1`).
- Auth: bat buoc JWT
- Phan quyen: chi `owner` duoc truy cap (`Only owner can manage config`)
- Endpoint: `GET /view`, `POST /set`, **`GET /get-time-now`** (đồng hồ theo múi giờ scheduler).
- Chuẩn hoá thời gian user-input → UTC trước khi lưu `timestamptz`: **`GlobalConfigService.normalizeUserTemporalToUtcForDb`** — xem **`docs/SCHEDULER_DATETIME_PERSISTENCE.md`**.

## Format response

Thanh cong:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {}
}
```

Loi:

```json
{
  "statusCode": 403,
  "message": "Only owner can manage config"
}
```

## Data model (Config)

Truong chinh:

- API keys:
  - `openaiApiKey`
  - `openaiOAuth` (jsonb, tùy chọn): `{ accessToken, refreshToken?, expiresAt? (ISO 8601), tokenType? }` — Bearer OAuth; backend ưu tiên khi token còn hạn, sau đó mới `openaiApiKey` / env. Owner có thể lấp đầy qua chat: `/openai_oauth_link` → `/openai_oauth_finish <url>` (Codex OAuth giống OpenClaw) hoặc `/openai_oauth_set {...}`.
  - `geminiApiKey`
  - `anthropicApiKey`
  - `openrouterApiKey`
  - `deepseekApiKey`
  - `kimiApiKey`
  - `zaiApiKey`
  - `perplexityApiKey`
  - `braveApiKey`
  - `firecrawlApiKey`
  - `deepgramApiKey`
  - `kieApiKey` — API key từ [kie.ai](https://kie.ai); bật skill `image_generate` (gọi KIE gpt4o-image / seedream / nano-banana...). Lưu tại `config.cof_kie_api_key`.
  - `vnptAiApiKey` (legacy fallback)
  - `vnptAiAuth` (jsonb, ưu tiên): `{ accessToken, tokenId, tokenKey, apiUrl? }`
- Local providers:
  - `ollama` (jsonb): `{ baseUrl, apiKey? }`
  - `lmStudio` (jsonb): `{ baseUrl, apiKey? }`
- Scheduler:
  - `schedulerMaxRetriesPerTick`
  - `schedulerMaxConsecutiveFailedTicks`
  - `schedulerTimezone` (string IANA, cột `cof_scheduler_timezone`) — múi giờ cho mọi CronJob do `ScheduledTasksService` đăng ký (heartbeat, n8n, workflow schedule). Trống / không hợp lệ → **`UTC`** (+0); không dùng biến `TZ` trong `.env`.

---

## 1) Xem config

`GET /api/v1/config/view`

### Quyen

- Chi `owner`.

### Hanh vi

- Tra config hien tai.
- Cac API key se duoc mask thanh chuoi `*************`.
- `openaiOAuth.accessToken` va `refreshToken` (neu co) bi mask.
- `ollama.apiKey` va `lmStudio.apiKey` neu co cung bi mask.
- **`schedulerTimezone`**: IANA trong DB (không mask); có thể `null` nếu chưa cấu hình — cron khi đó dùng **`UTC`** (xem `getSchedulerTimezone()`).

### Response example

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "id": 1,
    "openaiApiKey": "*************",
    "geminiApiKey": null,
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "apiKey": "*************"
    },
    "lmStudio": null,
    "schedulerMaxRetriesPerTick": 3,
    "schedulerMaxConsecutiveFailedTicks": 3,
    "schedulerTimezone": "Asia/Ho_Chi_Minh"
  }
}
```

### Loi thuong gap

- `403`: khong phai owner

---

## 1.1) Giờ hiện tại theo múi giờ scheduler

`GET /api/v1/config/get-time-now`

### Quyền

- Chỉ `owner`.

### Hành vi

- Trả về thời điểm **hiện tại** (cùng một `epochMs` / `utcIso`) biểu diễn theo **`effectiveSchedulerTimezone`** — đúng múi giờ mà `ScheduledTasksService` dùng cho CronJob (giá trị trong `config.schedulerTimezone` nếu IANA hợp lệ, không thì **`UTC`**).
- `storedSchedulerTimezone`: giá trị đang lưu trong DB (có thể `null` hoặc chuỗi không hợp lệ để UI cảnh báo).
- `localDateTime`: dạng `YYYY-MM-DD HH:mm:ss` theo múi effective.
- `localDateTimeVi`: chuỗi theo locale `vi-VN`.
- `gmtOffsetLabel`: nhãn offset (ví dụ `GMT+7`, `GMT+00:00`) — phụ thuộc engine JS.

### Response example

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "storedSchedulerTimezone": "Asia/Ho_Chi_Minh",
    "effectiveSchedulerTimezone": "Asia/Ho_Chi_Minh",
    "epochMs": 1746201234567,
    "utcIso": "2026-05-02T14:00:34.567Z",
    "localDateTime": "2026-05-02 21:00:34",
    "localDateTimeVi": "21:00:34 2/5/2026",
    "gmtOffsetLabel": "GMT+7"
  }
}
```

### Lỗi thường gặp

- `403`: không phải owner

---

## 2) Cap nhat config

`POST /api/v1/config/set`

### Quyen

- Chi `owner`.

### Body

- Body la `Partial<Config>`, co the gui 1 hoac nhieu field.
- Neu chua co ban ghi config thi se tao moi.
- Neu da co ban ghi thi se merge va save.
- Có thể gửi **`schedulerTimezone`** (string IANA, ví dụ `"Asia/Ho_Chi_Minh"`, `"UTC"`) để đổi múi giờ cron; chuỗi không hợp lệ sẽ bị bỏ qua lúc chạy cron (fallback `UTC`) — nên kiểm tra bằng **`GET /config/get-time-now`** sau khi lưu.

### Request example

```json
{
  "openaiApiKey": "sk-xxx",
  "kieApiKey": "kie-xxxxxxxxxxxxxxxx",
  "openaiOAuth": {
    "accessToken": "eyJ...",
    "refreshToken": null,
    "expiresAt": "2026-06-01T12:00:00.000Z",
    "tokenType": "Bearer"
  },
  "ollama": {
    "baseUrl": "http://localhost:11434",
    "apiKey": null
  },
  "schedulerMaxRetriesPerTick": 5,
  "schedulerTimezone": "Asia/Ho_Chi_Minh"
}
```

### Response

- `200` + config da luu (khong mask o endpoint set). Phản hồi gồm đủ các cột entity, kể cả **`schedulerTimezone`**.

### Loi thuong gap

- `403`: khong phai owner

---

## 3) Ket noi ChatGPT OAuth truc tiep cho frontend

`POST /config/connect/chatgpt-oauth`

### Quyen

- Chi `owner`.

### Muc tieu

- Frontend tu ket noi ChatGPT OAuth ma khong can user go command qua agent.
- Dung 1 endpoint voi `mode` de dieu phoi toan bo flow.

### Body schema

```json
{
  "mode": "start | finish | status | cancel",
  "callbackUrlOrCode": "optional (required for finish)"
}
```

`mode` mac dinh: `start`.

---

### 3.1) Start flow

Request:

```json
{
  "mode": "start"
}
```

Response:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "mode": "start",
    "authUrl": "https://chatgpt.com/....",
    "message": "Open this URL in your browser, complete ChatGPT login/consent, then call this API again with mode=finish and callbackUrlOrCode."
  }
}
```

Frontend:

1. Goi `mode=start`.
2. Mo `authUrl` bang `window.open(...)` hoac redirect.
3. Sau khi user dang nhap xong, lay URL callback (hoac code) de gui ve `mode=finish`.

---

### 3.2) Finish flow

Request:

```json
{
  "mode": "finish",
  "callbackUrlOrCode": "http://localhost:1455/auth/callback?code=...&state=..."
}
```

Response thanh cong:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "mode": "finish",
    "ok": true,
    "message": "ChatGPT OAuth connected and saved successfully.",
    "oauth": {
      "accessToken": "*********************************************",
      "refreshToken": "*********************************************",
      "expiresAt": "2026-06-01T12:00:00.000Z",
      "tokenType": "Bearer"
    }
  }
}
```

Neu thieu `callbackUrlOrCode`, API tra:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "mode": "finish",
    "ok": false,
    "message": "callbackUrlOrCode is required. Paste full callback URL (or code) from browser."
  }
}
```

---

### 3.3) Kiem tra trang thai

Request:

```json
{
  "mode": "status"
}
```

Response:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "mode": "status",
    "connected": true,
    "usable": true,
    "expiresAt": "2026-06-01T12:00:00.000Z",
    "tokenType": "Bearer",
    "pendingTarget": "global"
  }
}
```

`pendingTarget`: `global` | `user_config` | `null` — phiên OAuth Codex dang cho paste/callback (neu co). **Chi mot phien cho moi uid:** neu user mo `/user-config/connect/chatgpt-oauth` mode=start khi dang cho finish global, phien global bi huy.

---

### 3.4) Huy flow dang cho

Request:

```json
{
  "mode": "cancel"
}
```

Response:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "mode": "cancel",
    "cancelled": true,
    "message": "OAuth pending flow cancelled."
  }
}
```

---

### Ghi chu frontend quan trong

- Day la OAuth codex/chatgpt qua `pi-ai`; token duoc luu DB trong `config.openaiOAuth`.
- UI nen trien khai state machine:
  1. `start` -> mo `authUrl`
  2. user xong -> `finish` (gui callback URL/code)
  3. poll `status` de xac nhan `usable=true`
- De bao mat, backend chi tra token da mask.
- Neu user dong popup hoac dung giua chung, co the goi `cancel` roi `start` lai.

---

## Ghi chu frontend

- Neu can hien thi form config, nen:
  1. Goi `GET /config/view` de lay ban mask.
  2. Khi submit, chi gui field thay doi den `POST /config/set`.
- Khong nen overwrite toan bo object neu form chi sua 1 phan.

