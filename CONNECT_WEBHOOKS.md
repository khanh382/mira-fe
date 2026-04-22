# Connect Webhooks — LLM công khai cho bên thứ ba

Tài liệu mô tả module **Connect Webhooks**: cho phép nền tảng bên ngoài gọi **LLM** qua **Smart Router** (`ModelRouterService`) và **ProvidersService**, **không** lưu lịch sử hội thoại, **không** dùng skill/tool-calling từ phía client.

- **Mã nguồn**: `src/modules/connect-webhooks/`
- **Schema SQL (migration thủ công)**: `schema.sql`
- **Đăng ký module**: `ConnectWebhooksModule` trong `app.module.ts` (khi cấu hình database đầy đủ)

---

## Mục tiêu thiết kế

| Hành vi | Mô tả |
|--------|--------|
| Chỉ LLM | Mỗi request là stateless: chỉ gửi `messages`, server chọn model qua router rồi gọi provider. |
| Không lưu history | Không ghi `chat_messages` / thread; không cập nhật thói quen người dùng qua luồng này. |
| Không skill / tools | Body chỉ cho phép role `system`, `user`, `assistant`. Không gửi `tools` xuống provider. Nếu model vẫn trả `tool_calls` → **400**. |
| Bảo mật | `Bearer` secret; trong DB lưu **SHA-256 hex** của secret (cột `cw_api_key`). Secret plaintext chỉ hiện khi **create** hoặc **rotate-key**. |
| Giới hạn domain | So khớp host từ header `Origin` hoặc `Referer` với `cw_domain` đã chuẩn hóa; tùy chọn cho phép subdomain. |
| Rate + hàng đợi | Token bucket: refill **~10 token/giây**, burst tối đa **50** token / tracker (`cw:<cwId>`). Vượt capacity thì request **chờ**; chờ tối đa **3 phút** rồi **429** nếu vẫn không lấy được slot. |
| Thống kê (owner) | Mỗi lần chat thành công ghi một dòng `connect_webhook_usage_events` qua **`setImmediate`** (không `await` trước khi trả body). Xóa API key → **CASCADE** xóa usage. |

---

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `CONNECT_WEBHOOK_ROUTING_USER_ID` | `0` | `uid` truyền vào `ModelRouterService.resolveModel` (0 = user không tồn tại → tier kiểu **client**). Có thể đặt `uid` owner nếu muốn policy routing giống owner. |
| `CONNECT_WEBHOOK_REQUIRE_ORIGIN` | `true` | `false`: bỏ kiểm tra `Origin`/`Referer` (chỉ nên dùng khi dev / mạng nội bộ tin cậy). |
| `CONNECT_WEBHOOK_RATE_PER_SEC` | `10` | Số token refill mỗi giây (định tốc độ “~request/s” được phép vào xử lý). |
| `CONNECT_WEBHOOK_BURST` | `50` | Số token tối đa tích lũy (burst). |
| `CONNECT_WEBHOOK_QUEUE_MAX_WAIT_MS` | `180000` | Thời gian chờ tối đa trong hàng đợi (ms), mặc định **3 phút**; hết hạn → **429**. |

Base URL API: cùng host HTTP của backend Nest (ví dụ `https://api.example.com`).

---

## Cơ sở dữ liệu: bảng `connect_webhooks`

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `cw_id` | `SERIAL` PK | |
| `cw_api_key` | `VARCHAR(128)` UNIQUE | **Hash SHA-256 (64 hex)** của secret Bearer, không lưu plaintext. |
| `cw_domain` | `VARCHAR(512)` | Host đã chuẩn hóa (ví dụ `partner.com`), không gồm `https://` hay path. |
| `cw_use_subdomains` | `BOOLEAN` | `true`: cho phép host dạng `*.partner.com` (suffix `.partner.com`). |
| `cw_expired` | `TIMESTAMPTZ` NULL | Hết hạn → **403** khi gọi API công khai. |
| `cw_status` | enum `active` \| `inactive` | `inactive` → **403**. |
| `create_at` | `TIMESTAMPTZ` | |

Chuẩn hóa domain khi **tạo/sửa** và khi đọc `Origin`/`Referer`: chấp nhận input dạng `abc.com`, `http://abc.com`, `https://abc.com/path` → lưu / so sánh theo **hostname** chữ thường.

---

## API công khai (Bearer + domain)

Tất cả endpoint dưới đây dùng guard `ConnectWebhookBearerGuard` rồi `ConnectWebhookQueueGuard` (token bucket + chờ tối đa theo env).

### Headers bắt buộc / khuyến nghị

| Header | Bắt buộc | Mô tả |
|--------|----------|--------|
| `Authorization` | Có | `Bearer <api_key_plain>` — key do owner nhận lúc create/rotate. |
| `Origin` hoặc `Referer` | Có (khi `CONNECT_WEBHOOK_REQUIRE_ORIGIN=true`) | URL đầy đủ; host sau khi normalize phải khớp `cw_domain` (và quy tắc subdomain). Server-to-server nên gửi ví dụ `Origin: https://partner.com`. |
| `Content-Type` | Khuyến nghị | `application/json` |

### `POST /connect-webhooks/v1/chat`

Hoặc alias cùng body/response:

### `POST /connect-webhooks/v1/webhook/chat`

**HTTP status thành công**: `200`

#### Request body

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|--------|
| `messages` | mảng | Có | Mỗi phần tử: `{ "role": "system" \| "user" \| "assistant", "content": string }`. Tối đa **40** tin; tổng độ dài nội dung tối đa **120.000** ký tự. |
| `temperature` | number | Không | Truyền xuống provider (nếu hỗ trợ). |
| `maxTokens` | number | Không | Truyền xuống provider. |
| `model` | string | Không | Nếu có: **ép** model cụ thể (bỏ qua bước chọn model của router). |

Ví dụ request tối thiểu:

```http
POST /connect-webhooks/v1/chat HTTP/1.1
Host: api.example.com
Authorization: Bearer mira_cw_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Origin: https://partner.com
Content-Type: application/json
```

```json
{
  "messages": [
    { "role": "system", "content": "You reply briefly in Vietnamese." },
    { "role": "user", "content": "2+2 equals?" }
  ],
  "temperature": 0.3,
  "maxTokens": 256
}
```

#### Response body (200)

Cấu trúc cố định từ service (không bọc `{ data: ... }`):

```json
{
  "model": "openrouter/deepseek/deepseek-chat",
  "content": "2 + 2 = 4.",
  "usage": {
    "promptTokens": 42,
    "completionTokens": 8,
    "totalTokens": 50
  },
  "finishReason": "stop",
  "routing": {
    "intent": "reasoning",
    "tier": "skill",
    "reason": "intent=reasoning, user=client",
    "fallback": false
  }
}
```

| Trường | Kiểu | Mô tả |
|--------|------|--------|
| `model` | string | Model thực tế provider dùng (có thể khác “ý định” nếu có fallback OpenRouter). |
| `content` | string | Nội dung assistant (text). |
| `usage` | object | `promptTokens`, `completionTokens`, `totalTokens` — giá trị phụ thuộc provider. |
| `finishReason` | string | Một trong: `stop`, `length`, `tool_calls`, `error` (connect không mong `tool_calls`; nếu có tool_calls từ model → **400**). |
| `routing.intent` | string | Heuristic: `smalltalk`, `tool_call`, `big_data`, `reasoning` (bên thứ ba **không** gọi tool; đây chỉ là nhãn routing). |
| `routing.tier` | string | Tier đã chọn: `cheap`, `skill`, `processor`, `expert`. |
| `routing.reason` | string | Lý do ngắn từ router. |
| `routing.fallback` | boolean | `true` nếu đi qua nhánh fallback (ví dụ OpenRouter). |

#### Lỗi thường gặp (REST)

| HTTP | Tình huống (ví dụ message Nest) |
|------|----------------------------------|
| **400** | Body không hợp lệ (`messages` rỗng, role sai, vượt giới hạn kích thước); model trả tool calls. |
| **401** | Thiếu/sai `Authorization: Bearer`. |
| **403** | Key inactive / hết hạn; thiếu Origin/Referer khi bắt buộc; host không khớp domain. |
| **404** | (Ít gặp trên route chat) |
| **429** | Chờ hàng đợi quá `CONNECT_WEBHOOK_QUEUE_MAX_WAIT_MS` (mặc định 3 phút) mà vẫn không đến lượt. |

Ví dụ lỗi validation (400) — dạng chuẩn Nest:

```json
{
  "statusCode": 400,
  "message": "Only system, user, and assistant roles are allowed (no tools)",
  "error": "Bad Request"
}
```

Ví dụ thiếu Origin (403):

```json
{
  "statusCode": 403,
  "message": "Missing Origin or Referer header (required for domain allow-list)",
  "error": "Forbidden"
}
```

---

## API quản trị (chỉ **OWNER**, JWT)

Base path: `/connect-webhooks/admin`

Xác thực: giống các API nội bộ khác — `JwtAuthGuard` (cookie access token hoặc `Authorization: Bearer` JWT). User phải có `level === owner`.

### `GET /connect-webhooks/admin/api-keys`

**Response 200**: mảng các bản ghi (không chứa hash key).

```json
[
  {
    "cwId": 3,
    "cwDomain": "partner.com",
    "cwUseSubdomains": false,
    "cwExpired": "2026-12-31T23:59:59.000Z",
    "cwStatus": "active",
    "createAt": "2026-04-22T10:00:00.000Z"
  }
]
```

### `POST /connect-webhooks/admin/api-keys` — tạo API key cho domain

- Chuẩn hóa domain (`abc.com` ≡ `https://abc.com` ≡ `HTTPS://ABC.COM/`) rồi **unique** trên `cw_domain` — không cho hai key trùng host sau normalize.
- **Chỉ apex**: từ chối hostname kiểu subdomain (`www.`, `app.`, …); ngoại lệ hostname 3 phần hợp lệ kiểu `example.co.uk` (danh sách TLD hai phần cố định trong code).
- **Không path**: từ chối `https://abc.com/xyz` hoặc `abc.com/foo`.
- **`cw_use_subdomains`**: luôn **`false`** khi tạo (không nhận từ body).
- **`cw_expired`**: luôn **`null`** khi tạo (hết hạn chỉ gán khi gọi **refresh**).

**Request body**:

```json
{
  "cwDomain": "https://Partner.COM"
}
```

| Trường | Bắt buộc | Mô tả |
|--------|----------|--------|
| `cwDomain` | Có | Domain/URL gốc (không path); sau chuẩn hóa phải chưa tồn tại trong DB. |

**Response 200**:

```json
{
  "row": {
    "cwId": 4,
    "cwDomain": "partner.com",
    "cwUseSubdomains": false,
    "cwExpired": null,
    "cwStatus": "active",
    "createAt": "2026-04-22T11:30:00.000Z"
  },
  "apiKey": "mira_cw_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Lưu ý**: `apiKey` chỉ trả **một lần**; cần lưu an toàn phía owner.

### `POST /connect-webhooks/admin/api-keys/:cwId/refresh` — làm mới API key

- Tạo secret mới (hash lưu DB).
- Đặt **`cw_expired` = UTC hiện tại + 3 tháng** (tính bằng `setUTCMonth`).

Không có body.

**Response 200**: giống tạo mới — `row` + `apiKey` mới (plaintext một lần).

**404** nếu `cwId` không tồn tại.

### `PATCH /connect-webhooks/admin/api-keys/:cwId` — cập nhật cờ

Chỉ cho phép **`cwUseSubdomains`** và **`cwStatus`**. Phải gửi ít nhất một trường.

**Request body** (ví dụ):

```json
{
  "cwUseSubdomains": true,
  "cwStatus": "inactive"
}
```

**Response 200**: một object `row` (không có `apiKey`).

**404** nếu `cwId` không tồn tại.

### `DELETE /connect-webhooks/admin/api-keys/:cwId` — xóa API key

Không có body. PostgreSQL **`ON DELETE CASCADE`**: mọi dòng trong `connect_webhook_usage_events` gắn `cw_id` sẽ **tự xóa** cùng lúc với API key.

**Response 200**:

```json
{
  "deleted": true,
  "cwId": 4
}
```

**404** nếu `cwId` không tồn tại.

### Thống kê usage (owner) — token đã dùng & số lần gọi webhook theo domain

**Một domain đã đăng ký** (`cw_domain`) ứng với **một** bản ghi API key (`cw_id`). Mọi thống kê usage gắn với **`cw_id` đó** — tức là thống kê cho **một domain** (một partner / một key).

**Nguồn dữ liệu**: sau mỗi lần **`POST …/v1/chat`** hoặc **`POST …/v1/webhook/chat`** **thành công** (`200`), server enqueue **một dòng** vào bảng `connect_webhook_usage_events` bằng **`setImmediate`** (ghi DB **sau** khi chuẩn bị xong body trả về — không `await` insert trước khi trả JSON cho bên thứ ba). Nếu insert lỗi chỉ ghi log, **không** làm fail response. Xóa API key → **CASCADE** xóa hết usage của `cw_id` đó.

#### Tổng quan API thống kê (JWT owner)

| Mục đích | Phương thức | Endpoint | Kết quả chính |
|----------|----------------|----------|----------------|
| **Tổng token** (prompt / completion / total) trong khoảng thời gian | `GET` | `/connect-webhooks/admin/api-keys/:cwId/usage/summary` | `promptTokens`, `completionTokens`, `totalTokens` |
| **Số lần gọi webhook / chat thành công** trong cùng khoảng thời gian | `GET` | `.../usage/summary` | `totalCalls` (= số event ghi nhận trong khoảng) |
| **Chi tiết từng lần gọi** (từng request, token, model) | `GET` | `/connect-webhooks/admin/api-keys/:cwId/usage/events` | Mảng `items`; `total` = tổng bản ghi trong khoảng (phân trang `limit` / `offset`) |

**Lưu ý về lọc thời gian**

- Tham số query **`from`** và **`to`** (ISO 8601, inclusive) áp dụng lên **thời điểm ghi nhận sự kiện usage** — trường **`createdAt`** của từng dòng trong `connect_webhook_usage_events` (thời điểm “mỗi lần gọi webhook thành công” được ghi).
- **Không** có tham số tên `create_at` trên URL; nếu bạn muốn “chỉ thống kê từ lúc tạo key”, lấy `createAt` của key từ **`GET /connect-webhooks/admin/api-keys`** rồi truyền **`from`** = giá trị đó (và tùy chọn **`to`** = `now` hoặc ISO cuối ngày).

**Mặc định khoảng thời gian**: nếu **không** gửi `from` và `to`, API dùng **30 ngày** gần nhất tới thời điểm hiện tại.

---

#### `GET /connect-webhooks/admin/api-keys/:cwId/usage/summary`

**Ý nghĩa**: một response gộp **tổng token đã tiêu** và **tổng số lần gọi** (webhook/chat thành công) trong khoảng thời gian đã chọn — **theo một domain / một `cwId`**.

Query (tùy chọn):

| Tham số | Mô tả |
|---------|--------|
| `from` | ISO 8601 (inclusive) — mốc bắt đầu lọc theo **`createdAt`** của sự kiện usage. |
| `to` | ISO 8601 (inclusive) — mốc kết thúc. |

- **Bỏ cả hai**: mặc định **30 ngày** gần nhất tới `now`.
- **Có cả hai**: khoảng tối đa **366 ngày**; `from` ≤ `to`.

**Response 200** (ví dụ):

```json
{
  "cwId": 4,
  "from": "2026-03-23T12:00:00.000Z",
  "to": "2026-04-22T12:00:00.000Z",
  "totalCalls": 128,
  "promptTokens": 45000,
  "completionTokens": 12000,
  "totalTokens": 57000
}
```

| Trường | Ý nghĩa |
|--------|---------|
| `totalCalls` | **Số lần** gọi webhook/chat **thành công** có ghi usage trong khoảng `[from, to]` — dùng để thống kê **số lần gọi** của **một domain** (một `cwId`). |
| `promptTokens` / `completionTokens` / `totalTokens` | **Tổng token LLM** đã dùng (cộng dồn mọi request trong khoảng). |

**Ví dụ** (JWT owner qua cookie hoặc `Authorization: Bearer`):

```http
GET /connect-webhooks/admin/api-keys/4/usage/summary?from=2026-04-01T00:00:00.000Z&to=2026-04-22T23:59:59.999Z HTTP/1.1
Host: api.example.com
Authorization: Bearer <jwt_owner>
```

---

#### `GET /connect-webhooks/admin/api-keys/:cwId/usage/events`

**Ý nghĩa**: danh sách **từng lần gọi** đã ghi nhận — chi tiết token và model theo request. Lọc **`from` / `to`** giống summary (theo **`createdAt`** của event).

Query:

| Tham số | Mô tả |
|---------|--------|
| `from`, `to` | Giống summary — lọc theo thời gian **ghi event** (mặc định 30 ngày nếu bỏ cả hai). |
| `limit` | Mặc định `50`, tối đa `200`. |
| `offset` | Mặc định `0`. |

**Response 200** (rút gọn):

```json
{
  "cwId": 4,
  "from": "2026-03-23T12:00:00.000Z",
  "to": "2026-04-22T12:00:00.000Z",
  "limit": 50,
  "offset": 0,
  "total": 128,
  "items": [
    {
      "id": 9001,
      "createdAt": "2026-04-22T10:01:02.000Z",
      "promptTokens": 120,
      "completionTokens": 45,
      "totalTokens": 165,
      "model": "openrouter/…"
    }
  ]
}
```

Trường **`total`** trong response events là **tổng số bản ghi** trong khoảng `[from, to]` (ứng với **tổng số lần gọi webhook thành công** có trong khoảng đó cho domain đó); `items` là một **trang** nhờ `limit` / `offset`.

### Lỗi quản trị

| HTTP | Nguyên nhân |
|------|-------------|
| **403** | User không phải owner. |
| **400** | Domain không hợp lệ; có path; hostname là subdomain (vd `www.x.com`); PATCH không gửi field nào; `from`/`to` usage không hợp lệ hoặc khoảng > 366 ngày. |
| **409** | Domain đã có key (trùng sau chuẩn hóa). |

---

## Gợi ý tích hợp phía bên thứ ba (server)

```bash
curl -sS -X POST "https://api.example.com/connect-webhooks/v1/chat" \
  -H "Authorization: Bearer mira_cw_..." \
  -H "Origin: https://partner.com" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

Trình duyệt gọi trực tiếp API này sẽ gửi `Origin` tự động; cần **CORS** phù hợp trên backend nếu gọi cross-origin (module này không cấu hình CORS riêng).

---

## Rate limit và hàng đợi

- **Cơ chế**: token bucket theo tracker `cw:<cwId>` (sau Bearer). Mặc định **burst 50** token, refill **10 token/giây** (`CONNECT_WEBHOOK_BURST`, `CONNECT_WEBHOOK_RATE_PER_SEC`).
- **Khi vượt**: request **không bị từ chối ngay**; nó **chờ** trong vòng lặp ngắn cho đến khi có token (kết nối HTTP vẫn mở — client có thể thấy latency tăng).
- **Giới hạn chờ**: nếu sau **3 phút** (cấu hình được bằng `CONNECT_WEBHOOK_QUEUE_MAX_WAIT_MS`) vẫn không lấy được slot → HTTP **429** với message kiểu *"Rate limit: queue wait exceeded (max 3 minutes). Retry later."*
- **Nhiều instance**: bucket nằm **trong bộ nhớ từng process**; scale horizontal cần Redis / hàng đợi tập trung nếu muốn giới hạn toàn cụm.

Ví dụ response **429** (Nest):

```json
{
  "statusCode": 429,
  "message": "Rate limit: queue wait exceeded (max 3 minutes). Retry later.",
  "error": "Too Many Requests"
}
```

---

## Song song và nhiều người dùng cuối (FAQ)

### Một domain có gọi webhook / API song song được không?

**Có.** Mỗi request HTTP là độc lập: nhiều kết nối **cùng lúc** từ cùng domain (cùng `Origin`), cùng một `Authorization: Bearer …`, đều được xử lý song song **trong giới hạn token bucket**.

Giới hạn hiện tại gắn với **một API key** (`cw_id`), không phải “chỉ một request tại một thời điểm”. Ví dụ burst 50 cho phép tối đa khoảng **50 lần “vào hàng” rất nhanh** trước khi phải chờ refill; sau đó tốc độ vào hàng trung bình theo `CONNECT_WEBHOOK_RATE_PER_SEC`. Các request đã qua guard vẫn có thể **gọi LLM song song** (tải lên provider phụ thuộc cấu hình server và provider).

### Bên thứ ba muốn nhiều người khác nhau cùng gọi một lúc — có được không?

**Có về mặt kỹ thuật HTTP**, nhưng **về hạn mức** hiện tại:

- Mọi request dùng **cùng một Bearer key** (cùng một dòng `connect_webhooks`) đều dùng **chung một token bucket** (`cw:<cwId>`).
- Nghĩa là: 100 người dùng cuối, nếu backend đối tác **chuyển tiếp** tất cả lên Mira bằng **một key**, thì 100 người đó **chia sẻ** cùng burst / refill — không có tách bucket theo từng người dùng tự động.

**Cách làm thực tế nếu cần tách hoặc tăng throughput:**

1. **Tăng env** `CONNECT_WEBHOOK_BURST` và `CONNECT_WEBHOOK_RATE_PER_SEC` cho key đó (đủ cho tổng lưu lượng mong muốn).
2. **Nhiều API key / nhiều dòng** `connect_webhooks` (ví dụ mỗi tenant / mỗi app con một domain + key) — mỗi key một bucket riêng.
3. **Backend đối tác** làm hàng đợi / gộp / giới hạn phía họ rồi gọi Mira — tránh một key bị quá tải do burst người dùng.
4. **Không khuyến nghị** lộ Bearer cho trình duyệt từng user; key nên chỉ nằm trên server đối tác.

*(Tách bucket theo header kiểu “user id” từ client không ký được dễ bị lạm dụng nếu key lộ; nếu sau này cần “partition” an toàn có thể thiết kế HMAC hoặc key phụ lưu DB — chưa có trong module hiện tại.)*

---

## Liên hệ code

| Thành phần | File |
|------------|------|
| Controller công khai | `connect-webhooks-public.controller.ts` |
| Controller admin | `connect-webhooks-admin.controller.ts` |
| Service (chat, CRUD, hash) | `connect-webhooks.service.ts` |
| Guard Bearer + domain | `guards/connect-webhook-bearer.guard.ts` |
| Hàng đợi + token bucket | `connect-webhook-queue.service.ts` |
| Guard hàng đợi (sau Bearer) | `guards/connect-webhook-queue.guard.ts` |
| Chuẩn hóa / so khớp domain | `connect-webhook-domain.util.ts` |
| Entity | `entities/connect-webhook.entity.ts` |
| Entity usage (CASCADE theo `cw_id`) | `entities/connect-webhook-usage-event.entity.ts` |
| Thống kê usage (ghi ngầm + API đọc) | `connect-webhook-usage.service.ts` |
