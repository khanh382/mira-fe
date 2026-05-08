# Workflow Chat Commands & Planner API

Tài liệu này mô tả cách dùng **agent planner** để tạo/ chỉnh/ chạy workflow thông qua:
- **Slash commands** trong chat (Web, Telegram, Discord, Zalo — chỉ owner).
- **REST endpoints** `/api/v1/agent/workflows/plan*` cho frontend.

Base path: `/api/v1` (JwtAuthGuard cookie-based, reset trong file `main.ts`).

---

## 1. Nguyên tắc thiết kế

- **Planner LLM (cao cấp)**: service `WorkflowPlannerService` gọi
  `ModelRouterService.resolveModel(userId, IntentType.REASONING, { skillTier: EXPERT })` để
  nâng tier cho tác vụ suy luận phức tạp:
  - Owner / Colleague: mặc định **EXPERT** (gpt-4o / o3-mini / claude-sonnet — tuỳ
    OAuth/API khả dụng).
  - Client: tự động downgrade về **SKILL** để bảo vệ chi phí.
  - OAuth OpenAI vẫn được ưu tiên nhờ `openAiOAuthUsableNow()` + circuit breaker của router;
    khi OAuth tier bị demote thì fallback sang DeepSeek/OpenRouter.
- **Domain coverage check**: sau khi LLM trả draft, backend tự quét các node
  `http_request` → trích xuất URL/domain và `authCode` → đối chiếu với `http_tokens` của user:
  - Nếu `authCode` chưa tồn tại trong bảng → cảnh báo kèm lệnh `POST /api/v1/http-tokens` mẫu.
  - Nếu domain gọi API không có token nào → cảnh báo để user seed trước.
  - Nếu `authCode` đã có nhưng bind domain khác với URL trong prompt → cảnh báo mismatch.
- **Draft-first**: workflow tạo ra luôn ở trạng thái `draft`. User review bằng `/wf view` rồi
  mới `/wf activate` để chuyển sang `active`.
- **Input schema tự suy diễn**: planner phân tích mô tả để tìm các trường user có thể muốn
  thay đổi (topic, domain, tone, status, ...) và xuất ra:
  - `inputSchema.fields[]` — mô tả từng field (name, type, required, description, example,
    defaultValue, enumValues).
  - `inputSchema.sample` — object JSON đầy đủ để copy-paste khi chạy.
  Schema này được nhúng vào `workflow.description` dưới dạng HTML comment marker
  `<!-- mira:input_schema {...} -->` để `/wf view`, `/wf run` và frontend đọc lại được
  **mà không cần thay đổi DB schema**.
- **promptTemplate tự tham chiếu {input.<name>}**: planner không hardcode giá trị ví dụ vào
  prompt; mọi giá trị động đều được truyền qua runtime input.
- **Không giả lập skill**: chỉ cho phép `toolCode` thuộc `skills catalog` hiện có. Nếu không có
  skill phù hợp (vd. chưa có `image_generate`), node sẽ được đặt `toolCode=null` và mô tả nhiệm
  vụ trong `promptTemplate` để LLM tự xử lý.
- **Tool-deterministic vs LLM-reasoning** (mới):
  - Engine có hai đường chạy tool: nếu node có `commandCode` là **chuỗi JSON hợp lệ**,
    `executeWithTool` parse thẳng thành `parameters` và gọi skill — **không qua LLM**, nhanh và
    chính xác. Nếu chỉ có `promptTemplate`, engine phải dùng LLM để suy luận params → tốn
    token + rủi ro sai field.
  - Planner giờ được yêu cầu dùng **`commandCode` JSON** cho các skill deterministic:
    `http_request`, `exec`, `image_generate`, `wordpress_content_api`, `n8n_workflow_run`,
    `webshare_proxy`, `tts`, `mcp_call`. `promptTemplate` có thể để `null` (hoặc note ngắn
    nếu muốn LLM thêm nội dung phụ).
  - `commandCode` được hỗ trợ chèn placeholder `{input.<name>}`, `{nodes.<clientKey>.<field>}`
    (engine render trước khi parse JSON). Ví dụ `http_request` body lấy content từ bước viết bài:
    ```json
    {
      "method": "POST",
      "url": "https://bookingcualo.com/api/v1/admins/news",
      "authCode": "bookingcualo_admin",
      "headers": {"Content-Type": "application/json"},
      "body": {
        "title": "{nodes.b2_rewrite.title}",
        "content": "{nodes.b2_rewrite.content}",
        "thumbnail_url": "{nodes.b3_image.urls[0]}",
        "tags": {nodes.b4_seo.tags}
      }
    }
    ```
  - `promptTemplate` chỉ nên được dùng chính cho các node cần LLM reasoning (viết bài SEO,
    tóm tắt, dịch, tạo tag, phân tích content, trả lời câu hỏi mở…). Với những node này,
    để `toolCode=null` và `commandCode=null`.
  - Nếu node deterministic thiếu `commandCode`, planner sẽ xuất **warning** trong response
    (trường `warnings[]`) để user biết node đang rơi về LLM-parse và có thể sửa lại.
- **Tôn trọng `http_tokens`**: prompt của node gọi API ngoài bắt buộc nêu `authCode` để skill
  `http_request` nạp token từ bảng `http_tokens`, không hỏi lại credentials.
- **Không thay đổi schema DB**: toàn bộ tận dụng bảng `workflows`, `workflow_nodes`,
  `workflow_edges`, `workflow_runs`, `workflow_node_runs` đang có.

---

## 2. Slash commands

Toàn bộ lệnh chỉ xử lý khi người gửi là **owner** của hệ thống (đã đăng nhập web hoặc đúng bot
user). Bot hoặc client user chat sẽ không kích hoạt.

### 2.1 `/create_workflow <mô tả>`
Tạo draft workflow từ mô tả tự nhiên. Phản hồi liệt kê nodes/edges/entry node kèm warnings (vd.
các `http_tokens` còn thiếu).

Ví dụ:

```text
/create_workflow
B1: tìm kiếm bài viết mới nhất về du lịch Cửa Lò trên các trang tin tức
B2: viết lại 1 bài viết SEO cho nền tảng bookingcualo.com (phân tích site trước để lấy tone)
B3: tạo thumbnail phù hợp với website bookingcualo.com
B4: đăng bài qua POST bookingcualo.com/api/v1/hotels/create
     với body { title, content, thumbnail } — dùng http_token "wp_bookingcualo"
```

Phản hồi mẫu:

```text
✅ Đã tạo draft workflow `cualo_seo_post` (id: 8f3e..., status: draft).
Nodes (4):
- `b1_search` Tìm bài viết [web_search]
- `b2_rewrite` Viết lại SEO [browser]
- `b3_thumb` Tạo thumbnail [LLM]
- `b4_post` Đăng bài [http_request]
Edges (3): b1_search → b2_rewrite → b3_thumb → b4_post
Entry: `b1_search`

Input schema:
- `topic` (string, required) — Chủ đề bài viết
- `max_articles` (number, optional) (default: `5`) — Số bài tham khảo
- `tone` (enum(formal|friendly|marketing), optional) (default: `"marketing"`)
- `publish_status` (enum(publish|draft|future), optional) (default: `"publish"`)

Sample input:
```json
{
  "topic": "du lịch Cửa Lò mùa hè 2026",
  "max_articles": 5,
  "tone": "marketing",
  "publish_status": "publish"
}
```

⚠️ Cảnh báo:
- Cần tạo http_tokens code="wp_bookingcualo" trước khi chạy workflow. Gọi `POST /api/v1/http-tokens` với body: {"code":"wp_bookingcualo","domain":"bookingcualo.com","authType":"bearer","token":"<paste_token>"}.
- Node "Đăng bài" gọi domain "bookingcualo.com" nhưng bạn chưa có http_tokens nào cho domain này.

→ Xem lại: /wf view cualo_seo_post
→ Kích hoạt: /wf activate cualo_seo_post
→ Chạy thử: /wf run cualo_seo_post {"topic":"du lịch Cửa Lò mùa hè 2026",...}
→ Sửa lại: /wf plan cualo_seo_post <mô tả mới>
```

Khi chạy `/wf run <code>` mà thiếu JSON: nếu workflow có field `required`, agent sẽ từ chối và
in lại schema + sample để user copy-paste. Nếu tất cả field đều optional, agent dùng `sample`
làm default.

### 2.2 `/wf list`
Liệt kê tối đa 30 workflow gần nhất của user. Hiển thị status icon: 📝 draft · 🟢 active · ⏸️ paused · 🗄️ archived.

### 2.3 `/wf view <id|code>`
Xem chi tiết graph (nodes + edges + entry + version).

### 2.4 `/wf activate <id|code>` · `/wf pause <id|code>` · `/wf archive <id|code>`
Đổi `status`. `activate` chỉ thành công khi graph hợp lệ (engine tự validate).

### 2.5 `/wf run <id|code> [json_input]`
Kick-off run. Tham số thứ 2 (tuỳ chọn) là JSON mapping `{input}` dùng trong
`promptTemplate` (`{input.topic}`, ...).

Ví dụ:

```text
/wf run cualo_seo_post {"topic":"bãi biển mới 2026"}
```

### 2.6 `/wf plan <id|code> <mô tả>`
Revise: chạy lại planner và overwrite graph của workflow đã tồn tại. Giữ nguyên `id`/`code` nếu
có thể, tăng `version` lên 1 sau mỗi lần lưu.

### 2.7 `/wf help`
Hiển thị danh sách lệnh.

---

## 3. REST endpoints

| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/v1/agent/workflows/plan` | Tạo hoặc revise workflow bằng mô tả tự nhiên |
| `POST` | `/api/v1/agent/workflows/:workflowId/plan/confirm` | Chuyển workflow sang active (hoặc status tuỳ chọn) |

### 3.1 `POST /agent/workflows/plan`

Body:
```jsonc
{
  "naturalLanguage": "B1: ... B2: ...",
  "workflowId": "optional-uuid",         // truyền để revise
  "autoActivate": false                   // mặc định false — giữ draft
}
```

Response (200):
```jsonc
{
  "workflowId": "8f3e...",
  "workflowCode": "cualo_seo_post",
  "status": "draft",
  "draft": {
    "workflow": { "code": "cualo_seo_post", "name": "...", "description": "..." },
    "nodes": [
      {
        "clientKey": "b1_search",
        "name": "Tìm bài viết",
        "toolCode": "web_search",
        "promptTemplate": "...",
        "joinMode": "none",
        "maxAttempts": 3,
        "timeoutMs": 120000
      }
    ],
    "edges": [
      { "fromClientKey": "b1_search", "toClientKey": "b2_rewrite", "priority": 100, "isDefault": true }
    ],
    "entryNodeClientKey": "b1_search",
    "inputSchema": {
      "fields": [
        {
          "name": "topic",
          "type": "string",
          "required": true,
          "description": "Chủ đề bài viết",
          "example": "du lịch Cửa Lò mùa hè 2026"
        },
        {
          "name": "max_articles",
          "type": "number",
          "required": false,
          "defaultValue": 5
        },
        {
          "name": "tone",
          "type": "enum",
          "enumValues": ["formal", "friendly", "marketing"],
          "required": false,
          "defaultValue": "marketing"
        }
      ],
      "sample": {
        "topic": "du lịch Cửa Lò mùa hè 2026",
        "max_articles": 5,
        "tone": "marketing"
      },
      "notes": ["POST /agent/workflows/:id/run body: { input: <sample> }"]
    },
    "missingTokens": ["wp_bookingcualo"],
    "notes": ["..."]
  },
  "nodeKeyMap": { "b1_search": "<real-node-uuid>", ... },
  "warnings": ["Cần seed http_tokens code=\"wp_bookingcualo\" trước khi chạy workflow."]
}
```

Các lỗi phổ biến (`400 Bad Request`):
- `naturalLanguage is required`
- `naturalLanguage too long (> 8000 chars)`
- `Workflow planner failed to produce valid JSON: ...` (LLM không trả JSON hợp lệ sau 2 lần thử)
- `Node xxx dùng toolCode không hợp lệ: "..."`
- `Invalid clientKey "..." (snake_case, 3-40 ký tự, bắt đầu bằng chữ)`
- `entryNodeClientKey không tồn tại trong nodes: ...`

### 3.2 `POST /agent/workflows/:workflowId/plan/confirm`

Body (optional):
```json
{ "status": "active" }
```

Mặc định chuyển sang `active` (tiện cho frontend sau khi user xem lại draft).

### 3.3 Chạy & theo dõi

- `POST /agent/workflows/:workflowId/run` — chạy workflow (đã có sẵn).
- `GET /agent/workflows/:workflowId/runs` — list run.
- `GET /agent/workflows/runs/:runId` — xem log đầy đủ.

---

## 4. Flow gợi ý cho frontend

1. Người dùng gõ mô tả → `POST /agent/workflows/plan` với `autoActivate=false`.
2. Frontend render diff preview (nodes/edges) trên UI workflow builder hiện có.
3. Người dùng có thể chỉnh tay (PATCH node/edge) hoặc gửi mô tả mới tới planner kèm
   `workflowId` để revise.
4. Khi user bấm "Publish" → `POST /agent/workflows/:id/plan/confirm`.
5. Chạy qua `POST /agent/workflows/:id/run`.

## 5. Luồng dữ liệu & templating

- Output của mỗi node được ghi vào `ctx.nodes[<nodeName>]` và `ctx.nodes[<nodeId>]`.
- Prompt template có thể dùng `{nodes.b1_search.articles}`, `{input.topic}` — engine render
  bằng `WorkflowTemplateService.render`.
- Với nhánh song song, dùng `joinMode=wait_all` + `joinExpected=N` ở node tổng hợp để đảm bảo
  tất cả nhánh về trước khi chạy.
- **Input schema cho runtime**: frontend/UI có thể đọc `inputSchema` từ trường
  `workflow.description` (parse marker `<!-- mira:input_schema {...} -->`) để render form
  nhập liệu động trước khi POST `/runs`. Backend export helper
  `WorkflowPlannerService.extractInputSchemaFromDescription(desc)` và
  `WorkflowPlannerService.stripInputSchemaMarker(desc)` nếu cần tách phần mô tả "người đọc".

## 6. Giới hạn & cảnh báo

- **Đồ thị (validate-graph)**: mỗi node chỉ được tối đa **một** cạnh outgoing có
  `isDefault=true`. Nếu LLM sinh sai (fork song song cùng default), planner tự
  `sanitize` — giữ một default (priority số nhỏ nhất), gỡ `isDefault` ở các cạnh còn lại
  và ghi log cảnh báo.
- Planner **không** tự tạo `http_tokens` thay user — nếu thiếu, sẽ xuất hiện trong
  `missingTokens` / `warnings`.
- `toolCode` chỉ chấp nhận giá trị từ skills catalog; nếu muốn thêm skill (vd. `image_generate`)
  phải phát triển runner riêng rồi đăng ký vào DB + `skills-module`.
- Khi prompt tự nhiên quá dài (> 8 000 ký tự) → reject; nên chia nhỏ nếu cần.
- Mọi kết quả planner đều đi qua `saveGraph` → được validate bằng
  `validateWorkflowStructure` trước khi ghi DB.
