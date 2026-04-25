# Module `memories` — RAG (`memory_rags`), file `MEMORY.md`, & API

Tài liệu mô tả: **module `memories`**: bảng `memory_rags` (TypeORM + REST), **file `MEMORY.md`** trong workspace (`BRAIN_DIR/<identifier>/workspace/`) qua REST, **inject runtime** `@<code>` (chat + workflow).

---

## 1. Mục đích & ý nghĩa từng loại

| Trường / khái niệm | Ý nghĩa |
|--------------------|---------|
| **`mr_type = text`** | `mr_value` được hiểu như **chuỗi text / markdown** mô tả ngữ cảnh (tương tự một file `.md` mô tả). |
| **`mr_type = json`** | `mr_value` là **chuỗi JSON hợp lệ** (object/array) — có thể mô tả ngữ cảnh dạng cấu trúc hoặc “bảng” logic trong JSON. |
| **`mr_code`** | Mã **duy nhất toàn hệ thống** (slug), dùng để tham chiếu ổn định từ app hoặc sau này từ agent. |
| **`mr_name`** | Tên hiển thị / mô tả ngắn cho người dùng. |
| **`mr_status`** | `active` \| `inactive` — tắt mềm khi chưa muốn xóa. |

Dữ liệu **gắn với user** qua `mr_user_id` → `users.uid` (xóa user có thể cascade xóa bản ghi RAG).

---

## 2. Code & schema trong repo

| Thành phần | Đường dẫn |
|-------------|-----------|
| Entity + enum | `src/modules/memories/entities/memory-rag.entity.ts` |
| Module Nest | `src/modules/memories/memories.module.ts` |
| Service | `src/modules/memories/memories.service.ts` |
| Controller RAG | `src/modules/memories/memories.controller.ts` |
| Controller `MEMORY.md` | `src/modules/memories/memories-workspace-memory.controller.ts` |
| DTO ghi file | `src/modules/memories/dto/update-workspace-memory.dto.ts` |
| DTO | `src/modules/memories/dto/create-memory-rag.dto.ts`, `update-memory-rag.dto.ts` |
| Mention + boundary rules | `src/modules/memories/memory-rag-mention.util.ts` |
| Đăng ký app | `src/app.module.ts` — `MemoriesModule` (khi có cấu hình database) |
| DBML (ERD / dbdiagram) | `DATABASE_DBML.md` — block `Table memory_rags` |

Bảng Postgres: **`memory_rags`**. Tạo bảng bằng migration SQL riêng hoặc bật **`DB_SYNCHRONIZE=true`** chỉ trên môi trường dev (không khuyến nghị production).

---

## 3. REST API

**Prefix toàn cục:** `api/v1`  

**Xác thực:** JWT — cookie access token (web) hoặc header `Authorization: Bearer <token>`.

**Quyền:** chỉ **`owner`** và **`colleague`**. User **`client`** nhận `403 Forbidden`.

### Nhóm endpoint

| Nhóm | Base path | Mục đích |
|------|-----------|----------|
| **RAG (SQL)** | `api/v1/memories/rags` | CRUD bản ghi `memory_rags`. |
| **Bộ nhớ file** | `api/v1/memories/workspace-memory` | Đọc / ghi đè **`MEMORY.md`** của chính user (workspace trên disk). |

### 3.1 Danh sách

```http
GET /api/v1/memories/rags
GET /api/v1/memories/rags?status=active
GET /api/v1/memories/rags?status=inactive
```

Trả về tối đa **200** bản ghi của **đúng user đang đăng nhập**, sắp xếp `id` giảm dần.

### 3.2 Chi tiết một bản ghi

```http
GET /api/v1/memories/rags/:id
```

Chỉ trả bản ghi có `mr_user_id` trùng `uid` JWT.

### 3.3 Tạo

```http
POST /api/v1/memories/rags
Content-Type: application/json
```

**Body (JSON):**

| Field | Bắt buộc | Mặc định | Ghi chú |
|-------|----------|----------|---------|
| `name` | Có | — | Chuỗi không rỗng, tối đa 255 ký tự. |
| `code` | Có | — | Chuỗi không rỗng, tối đa 120 ký tự, **unique global**. |
| `type` | Không | `text` | `text` hoặc `json`. |
| `value` | Không | `null` | Nếu `type=json` và có giá trị → phải parse được JSON. |
| `status` | Không | `active` | `active` hoặc `inactive`. |

**Lỗi thường gặp:**

- `409 Conflict` — trùng `code` với bản ghi khác (mọi user).
- `400 Bad Request` — `type=json` nhưng `value` không phải JSON hợp lệ.

### 3.4 Cập nhật

```http
PATCH /api/v1/memories/rags/:id
Content-Type: application/json
```

Body: bất kỳ subset của `name`, `code`, `type`, `value`, `status`. Sau cập nhật vẫn kiểm tra JSON khi `type=json`.

### 3.5 Xóa

```http
DELETE /api/v1/memories/rags/:id
```

Xóa **cứng** (`DELETE` SQL). Chỉ xóa được bản ghi thuộc user hiện tại.

### 3.6 Hình dạng response (thành công)

Interceptor chuẩn của backend bọc `{ statusCode, message, data }`. Trong `data`, mỗi bản ghi dạng:

```json
{
  "id": 1,
  "userId": 2,
  "name": "Ngữ cảnh dự án X",
  "code": "project_x_context",
  "type": "text",
  "value": "# Tiêu đề\\n...",
  "status": "active",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### 3.7 Gợi ý tích hợp frontend — `MEMORY.md` (mở & sửa thủ công)

**Luồng UI gợi ý**

1. **Màn “Bộ nhớ dài hạn (file)”** — nút “Tải nội dung”: gọi `GET` → đổ `data.content` vào editor (markdown). Hiển thị `data.logicalPath` làm phụ đề (vd. `alice/workspace/MEMORY.md`) để user hiểu file nằm đâu trong cây `BRAIN_DIR`.
2. **Trạng thái file** — `data.exists === false` và `content === ""`: file chưa từng tạo; editor trống; lần `PUT` đầu sẽ tạo file.
3. **Lưu** — `PUT` với body `{ "content": "<toàn bộ nội dung UTF-8>" }` (ghi đè toàn file). Sau lưu thành công có thể cập nhật `updatedAt` từ response.
4. **Giới hạn** — `data.maxBytes` (mặc định **524288**): kiểm tra `Blob`/`TextEncoder` kích thước UTF-8 trước khi gửi; vượt → `400` từ API.
5. **Lỗi 400** — user chưa có `identifier` trong DB → chưa gắn workspace; cần onboarding / admin. Thông báo mẫu: *Tài khoản chưa có workspace identifier…*

**Endpoint**

```http
GET /api/v1/memories/workspace-memory
PUT /api/v1/memories/workspace-memory
Content-Type: application/json
```

**Body `PUT`**

```json
{ "content": "# MEMORY\\n\\n- Ghi chú…" }
```

**Hình dạng `data` sau `GET`** (trong envelope chuẩn `{ statusCode, message, data }`):

| Field | Kiểu | Ý nghĩa |
|-------|------|---------|
| `fileName` | `"MEMORY.md"` | Cố định — API chỉ hỗ trợ file này. |
| `logicalPath` | string | `<identifier>/workspace/MEMORY.md` (không trả đường dẫn tuyệt đối server). |
| `identifier` | string | Thư mục user dưới `BRAIN_DIR`. |
| `content` | string | Nội dung UTF-8 hiện tại (rỗng nếu chưa có file). |
| `exists` | boolean | `true` nếu file đã tồn tại trên disk. |
| `updatedAt` | string \| null | ISO mtime của file; `null` nếu chưa có file. |
| `maxBytes` | number | Ngưỡng bytes tối đa cho `PUT`. |

**`data` sau `PUT`**

| Field | Ý nghĩa |
|-------|---------|
| `ok` | `true` |
| `logicalPath` | Như trên. |
| `updatedAt` | Thời điểm ghi (ISO). |
| `sizeBytes` | Kích thước nội dung đã lưu (UTF-8). |

**Hành vi backend**

- `ensureUserWorkspace(identifier)` trước khi đọc/ghi — đảm bảo thư mục workspace tồn tại.
- Sau `PUT`: `invalidateSystemContextCache` — lượt chat kế tiếp load lại `MEMORY.md` trong system prompt.

---

## 4. Cú pháp `@<code>` & inject vào agent

### 4.1 Khi nào được tính là “mention”

- Chuỗi phải chứa **`@` + đúng `mr_code`** của một bản ghi **`status=active`** thuộc **user đang chạy agent** (JWT / workflow `userId`).
- **`@` không hợp lệ** nếu ký tự ngay trước `@` là chữ, số hoặc `_` (ví dụ `abc@mr_code` → không match `mr_code`).
- **Suffix không hợp lệ**: sau `code` không được dính thêm chữ/số/`_` (ví dụ `@mr_codeABC` không được tính là `mr_code`).
- Nếu không có bản ghi active tương ứng → **bỏ qua**, không chèn tài liệu.

### 4.2 Nội dung chèn

- **`type=text`**: `mr_value` như markdown/text trong khối `### @code — name`.
- **`type=json`**: `mr_value` trong fence ` ```json `.

Ngân sách gần **14k** ký tự tổng, **~8k** mỗi bản ghi (có cắt nếu vượt). Khối có tiêu đề `## Tham chiếu memory RAG (@<code>)` và có thể bị cắt khi vượt `SYSTEM_PROMPT_MAX_CHARS` (cùng cơ chế trim với các block system khác).

### 4.3 Nơi áp dụng

| Luồng | Hành vi |
|--------|---------|
| **Chat web / bot** (pipeline) | Sau hook `BEFORE_PROMPT_BUILD`, quét `processedContent` → append vào **system** đầu tiên (`PreprocessStep` + `MemoriesService.buildActiveRagInjectionBlock`). |
| **Workflow node** | Sau render `promptTemplate` / `commandCode`, quét cả hai → nếu có prompt: ghép block **phía trước** prompt; nếu không có prompt nhưng có command dạng JSON: thêm field **`memoryRagContext`** vào object; nếu command là text thuần: ghép phía trước command. |

---

## 5. Phân biệt `MEMORY.md` và `memory_rags`

- **`MEMORY.md`**: bộ nhớ dài hạn **một file markdown** trong workspace; agent đọc qua `buildAgentSystemContext`; user (owner/colleague) chỉnh qua **`GET/PUT …/workspace-memory`** hoặc qua tool `memory_write` / lệnh `/save_memory` trong chat.
- **`memory_rags`**: **bảng SQL** + mention `@<code>` theo lượt — tài liệu tham chiếu có cấu trúc, không thay thế `MEMORY.md`.

---

## 6. Việc tiếp theo (gợi ý)

- Job embedding / vector index từ `mr_value` theo `mr_user_id`.
- Unique `code` **theo user** thay vì global (đổi constraint DB + service nếu cần).
