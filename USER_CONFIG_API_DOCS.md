# User config API

Tài liệu mô tả REST API cấu hình **riêng theo user** (bảng `user_config`, module `user-config`).

## Tổng quan

- **Base path:** `/api/v1/user-config` (toàn app có prefix `api/v1`).
- **Auth:** bắt buộc JWT — header `Authorization: Bearer <access_token>` hoặc cookie access token (cùng cơ chế với các API có `JwtAuthGuard`).
- **Phạm vi:** mỗi user đăng nhập chỉ sửa **cấu hình của chính mình** (`ucof_user_id` = `req.user.uid`) — gồm cả **owner** (không cần quyền `owner` như API global `config`). Owner vẫn có thể vừa dùng **`POST /api/v1/config/set`** (global) vừa **`POST /api/v1/user-config/set`** (key riêng theo `uid`).
- **Sau `POST /user-config/set` thành công:** backend **reset ngay** TTL fallback 3 phút (nhóm credential) **và** `ProvidersService.clearProviderKeyCache()` — các request sau không phải chờ hết 3 phút cũng đọc lại key user.

## Hành vi nghiệp vụ (tương lai / pipeline)

- Khi hệ thống resolve key provider hoặc Ollama / LM Studio: **ưu tiên `user_config`**; null hoặc lỗi → fallback **`config`** global (theo nhóm; có TTL fallback — xem code `UserConfigCredentialService`).

Chi tiết schema DBML: **`docs/DATABASE_DBML.md`** (bảng `user_config`).

---

## Định dạng response

Thành công (Interceptor bọc chuẩn):

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {}
}
```

---

## Mô hình dữ liệu (JSON ↔ DB)

Tên thuộc tính trong API dùng **camelCase** (khớp entity TypeORM).

| JSON (API)       | Cột DB           | Ghi chú |
|------------------|------------------|---------|
| `id`             | `ucof_id`        | PK, chỉ đọc |
| `userId`         | `ucof_user_id`   | FK `users.uid`, unique |
| `openaiApiKey`   | `ucof_openai_api_key` | |
| `geminiApiKey`   | `ucof_gemini_api_key` | |
| `anthropicApiKey`| `ucof_anthropic_api_key` | |
| `openrouterApiKey` | `ucof_openrouter_api_key` | |
| `deepseekApiKey` | `ucof_deepseek_api_key` | |
| `kimiApiKey`     | `ucof_kimi_api_key` | |
| `perplexityApiKey` | `ucof_perplexity_api_key` | |
| `braveApiKey`    | `ucof_brave_api_key` | |
| `firecrawlApiKey`| `ucof_firecrawl_api_key` | |
| `kieApiKey`      | `ucof_kie_api_key` | |
| `openaiOAuth`    | `ucof_openai_oauth` | JSONB, giống `config`: `{ accessToken, refreshToken?, expiresAt?, tokenType? }` |
| `ollama`         | `ucof_ollama`    | JSONB: `{ baseUrl, apiKey? }` |
| `lmStudio`       | `ucof_lms`       | JSONB: `{ baseUrl, apiKey? }` (LM Studio) |

---

## 1) Xem cấu hình (đã mask)

`GET /api/v1/user-config/view`

- Trả về một object `UserConfig` **đã che** giá trị nhạy cảm: mọi API key dạng chuỗi khác rỗng → chuỗi mask dài; `openaiOAuth.accessToken` / `refreshToken` (nếu có) bị mask; `ollama.apiKey`, `lmStudio.apiKey` tương tự.
- Nếu user **chưa có** dòng trong `user_config`, `data` thường là `null` (sau wrapper).

---

## 2) Cập nhật từng phần (patch)

`POST /api/v1/user-config/set`

- **Chỉ cập nhật các field có trong body** (so với object gốc: dùng `Object.prototype.hasOwnProperty` / key thật sự gửi lên).
- **Không gửi key** → **không đổi** cột tương ứng trong DB.
- **Gửi key với giá trị `null`** → ghi **NULL** vào DB (xóa giá trị cột đó).

### Các key được phép trong body

`openaiApiKey`, `geminiApiKey`, `anthropicApiKey`, `openrouterApiKey`, `deepseekApiKey`, `kimiApiKey`, `perplexityApiKey`, `braveApiKey`, `firecrawlApiKey`, `kieApiKey`, `openaiOAuth`, `ollama`, `lmStudio`.

### Ví dụ

Chỉ cập nhật OpenAI key, giữ nguyên các cột khác:

```json
{ "openaiApiKey": "sk-..." }
```

Xóa key OpenAI của user (fallback sang global / env sau này):

```json
{ "openaiApiKey": null }
```

Ghi đè toàn bộ block OAuth (object không null thay thế giá trị cột JSONB):

```json
{
  "openaiOAuth": {
    "accessToken": "...",
    "refreshToken": null,
    "expiresAt": "2026-01-01T00:00:00.000Z",
    "tokenType": "Bearer"
  }
}
```

Xóa OAuth user:

```json
{ "openaiOAuth": null }
```

Response của `set` cũng là bản **đã mask** (giống `view`), không trả key thô.

---

## 3) Kết nối ChatGPT OAuth Codex (pi-ai) — lưu vào `user_config`

`POST /api/v1/user-config/connect/chatgpt-oauth`

- **Cùng luồng** với `POST /api/v1/config/connect/chatgpt-oauth` (`mode=start` → `authUrl`, `mode=finish` + `callbackUrlOrCode`, `status`, `cancel`), nhưng token sau khi exchange được ghi vào **`ucof_openai_oauth`** của user đang đăng nhập, **không** ghi bảng `config` global.
- **`mode=status`**: đọc OAuth **trên dòng `user_config`** của user; trường `pendingTarget` cho biết có phiên OAuth đang chờ (`global` | `user_config` | `null`) — dùng để tránh nhầm khi vừa mở flow global vừa flow user.
- **Tránh chồng chéo:** backend chỉ giữ **một phiên OAuth Codex cho mỗi `uid`** tại một thời điểm. Gọi `mode=start` trên endpoint user trong khi đang chờ finish từ endpoint global (cùng user) sẽ **hủy** phiên global trước (và ngược lại); chỉ target của lần `start` **cuối cùng** được áp dụng khi hoàn tất.

---

## Lưu ý triển khai DB

- Bật đồng bộ schema dev: `DB_SYNCHRONIZE=true` (chỉ môi trường phù hợp).
- Production: tạo bảng bằng migration / SQL theo `DATABASE_DBML.md`.
