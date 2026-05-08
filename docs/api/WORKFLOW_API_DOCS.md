# Workflow Engine API Docs

Tai lieu nhanh de tao workflow, them node/edge, va chay workflow qua REST API.

Base path:

- `/agent/workflows`

Auth:

- Tat ca endpoint deu yeu cau JWT (`Authorization: Bearer <token>` hoac cookie auth).
- Backend tu lay `uid` tu JWT. Khong gui `userId` trong body/query.

`toolCode` luon la `skill_code` (khong phai category).
Category chi dung de nhom/filter trong UI.

## 0) Lay danh sach tool cho Node UI select

`GET /agent/workflows/tool-options`

Muc tieu:

- Tra ve danh sach skills duoc phep hien thi de UI select `toolCode` truc quan.
- Tra ve theo group category de dung cho dropdown/tree.
- Chi tra cac skill co `is_display = true`.
- Skill `ownerOnly = true` chi hien cho user level `owner` (colleague/client khong thay).

Categories hien tai:

- `web`
- `runtime`
- `browser`
- `media`
- `memory`
- `messaging`
- `sessions`
- `filesystem`
- `google_workspace`
- `custom`
- `clawhub`

Response mau:

```json
{
  "categories": ["web", "runtime", "browser", "media", "memory", "messaging", "sessions", "filesystem", "google_workspace", "custom", "clawhub"],
  "grouped": [
    {
      "category": "web",
      "tools": [
        {
          "skillCode": "web_fetch",
          "skillName": "Web Fetch",
          "displayName": "Doc noi dung trang web",
          "description": "...",
          "minModelTier": "cheap",
          "ownerOnly": false
        }
      ]
    }
  ],
  "totalTools": 20
}
```

## 1) Tao workflow

`POST /agent/workflows`

Body:

```json
{
  "code": "news_to_web_basic",
  "name": "News To Web Basic",
  "description": "Workflow co ban lay tin, viet lai, tao anh, dang web",
  "inputPayload": {
    "topic": "du lich Cua Lo he 2026",
    "targetWebsite": "https://bookingcualo.com"
  }
}
```

- `inputPayload` (optional): sample payload mac dinh khi chay workflow khong gui `input`.
  Planner tu dong sinh field nay tu `/create_workflow`, user co the cap nhat qua `PATCH`.

## 1.1 Danh sach workflow cua user hien tai

`GET /agent/workflows`

## 1.2 Cap nhat metadata workflow (doi ten/ma/mo ta)

`PATCH /agent/workflows/:workflowId`

Body (gui field can doi):

```json
{
  "code": "news_to_web_v2",
  "name": "News To Web V2",
  "description": "Ban cap nhat",
  "inputPayload": {
    "topic": "bai bien moi o Cua Lo",
    "targetWebsite": "https://bookingcualo.com"
  }
}
```

Luu y:

- Co the doi `code` trong endpoint nay.
- `code` phai unique toan he thong. Neu trung se tra loi (`Workflow code already exists`).
- Khong gui field nao -> backend giu nguyen gia tri cu.
- `inputPayload`: gui `null` de xoa payload mac dinh; gui object de ghi de toan bo; khong gui -> giu nguyen.

## 1.3 Xoa workflow (hard delete, cascade du lieu lien quan)

`DELETE /agent/workflows/:workflowId`

- Chi xoa workflow thuoc user trong JWT (`workflows.uid`).
- Chay trong **transaction**, thu tu an toan FK:
  1. `UPDATE workflows SET entry_node_id = NULL` (giai FK workflow → entry node).
  2. Xoa `workflow_node_runs` (theo `workflow_run_id` cua moi run thuoc workflow).
  3. Xoa `workflow_runs`.
  4. Xoa `workflow_edges`.
  5. Xoa `workflow_nodes`.
  6. Xoa `workflows`.

Response `200`:

```json
{ "deleted": true, "id": "3cddbbec-69ef-4567-84a1-d6a3abf6f73d" }
```

Loi:

- `404`: workflow khong ton tai hoac khong thuoc user hien tai.

## 2) Them node

`POST /agent/workflows/:workflowId/nodes`

### 2.1 Node khong dung tool (`toolCode = null`)

```json
{
  "name": "rewrite_content",
  "toolCode": null,
  "promptTemplate": "Viet lai bai viet sau: {nodes.fetch_news.content}",
  "modelOverride": null,
  "maxAttempts": 5,
  "joinMode": "none",
  "posX": 320,
  "posY": 140
}
```

### 2.2 Node co tool

```json
{
  "name": "publish_post",
  "toolCode": "http_request",
  "commandCode": "{\"method\":\"POST\",\"url\":\"{input.websiteApiUrl}\",\"body\":{\"title\":\"{input.title}\",\"content\":\"{nodes.rewrite_content.content}\"}}",
  "promptTemplate": "Dang bai len website voi title={input.title} va content={nodes.rewrite_content.content}",
  "maxAttempts": 5,
  "joinMode": "none",
  "posX": 980,
  "posY": 140
}
```

Quy tac thuc thi khi `toolCode != null`:

1. Thu `commandCode` truoc.
2. Neu loi hoac rong, fallback sang `promptTemplate`.
3. Retry toi da `maxAttempts` (engine gioi han max 5).

### Join mode tren node (cho node gop nhanh)

- `joinMode = "none"`: node chay ngay khi co nhanh dau tien toi node.
- `joinMode = "wait_any"`: y nghia tuong tu `none`, de doc ro logic.
- `joinMode = "wait_all"`: doi den khi du nhanh truoc khi chay.
- `joinExpected`: so nhanh can doi (nullable).
  - neu null + `wait_all` -> backend dung so incoming edges cua node.

## 2.3 Cap nhat node (phuc vu UI keo-tha)

`PATCH /agent/workflows/:workflowId/nodes/:nodeId`

```json
{
  "name": "rewrite_content",
  "posX": 420,
  "posY": 220
}
```

## 2.4 Xoa node

`DELETE /agent/workflows/:workflowId/nodes/:nodeId`

Luu y:

- He thong tu dong xoa edge lien quan den node.
- Neu node bi xoa la entry node, he thong tu chon node dau tien con lai lam entry.

## 3) Them edge (phan nhanh)

`POST /agent/workflows/:workflowId/edges`

Body:

```json
{
  "fromNodeId": "node-a-uuid",
  "toNodeId": "node-b-uuid",
  "conditionExpr": "$.nodes.fetch_news.success == true",
  "priority": 10,
  "isDefault": false
}
```

Edge mac dinh (fallback):

```json
{
  "fromNodeId": "node-a-uuid",
  "toNodeId": "node-fallback-uuid",
  "isDefault": true,
  "priority": 999
}
```

## 3.1 Cap nhat edge

`PATCH /agent/workflows/:workflowId/edges/:edgeId`

```json
{
  "conditionExpr": "$.nodes.fetch_news.success == true",
  "priority": 5,
  "isDefault": false
}
```

## 3.2 Xoa edge

`DELETE /agent/workflows/:workflowId/edges/:edgeId`

## 4) Kich hoat workflow

`PATCH /agent/workflows/:workflowId/status`

Body:

```json
{
  "status": "active"
}
```

Gia tri hop le:

- `draft`
- `active`
- `paused`
- `archived`

## 4.1 Dat entry node

`PATCH /agent/workflows/:workflowId/entry-node`

```json
{
  "entryNodeId": "node-entry-uuid"
}
```

Luu y:

- `entryNodeId` phai la UUID cua node da luu trong DB (khong dung client id tam cua UI).
- Neu UI dang tao/sua graph bang `clientKey`, dat entry qua `PUT /agent/workflows/:workflowId/graph` voi `entryNodeClientKey`.

## 5) Chay workflow

`POST /agent/workflows/:workflowId/run`

Luu y:

- Cho phep chay thu khi workflow dang `draft` hoac `active`.
- Neu workflow dang `paused` hoac `archived` thi backend se tu choi.
- `threadId` la optional. Khong gui hoac gui gia tri bat ky deu khong bi validate ton tai.
- `input` la optional. Khi khong gui `input`, backend fallback sang cot `workflows.input_payload` (sample do planner sinh hoac user cap nhat qua `PATCH /agent/workflows/:workflowId`).
- Neu `input` dung JSON mau sau thi backend se luu `input_payload = null`:
  - `{"newsUrl":"https://example.com/news","title":"Daily update","websiteApiUrl":"https://api.example.com/posts"}`

Body:

```json
{
  "threadId": "manual-run-001",
  "input": {
    "newsUrl": "https://example.com/news/latest",
    "websiteApiUrl": "https://example.com/wp-json/custom/v1/posts",
    "title": "Tin tuc moi nhat"
  }
}
```

Luu y:

- `threadId` la optional. Khong gui van chay binh thuong.

Response (format FE-friendly — giong `GET /runs/:runId/summary`):

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "run": {
      "id": "…",
      "workflowId": "…",
      "status": "succeeded | failed | running",
      "currentNodeId": "…",
      "error": null,
      "startedAt": "…",
      "finishedAt": "…",
      "finalOutput": { "...": "..." }
    },
    "nodeStatuses": {
      "<nodeId>": {
        "nodeId": "…",
        "nodeName": "B1 Search news",
        "status": "pending | running | succeeded | failed",
        "lastAttemptNo": 1,
        "lastError": null,
        "lastOutput": { "success": true, "data": {"...": "..."} },
        "lastDurationMs": 2345,
        "attempts": [
          { "attemptNo": 1, "status": "succeeded", "error": null, "durationMs": 2345, "createdAt": "…" }
        ]
      }
    }
  }
}
```

FE dung `nodeStatuses[nodeId].status` de to mau node tren canvas (pending/grey, running/blue, succeeded/green, failed/red) va mo `lastError` khi failed.

## 5.1 Chay thu 1 node

`POST /agent/workflows/:workflowId/nodes/:nodeId/run`

Muc tieu:

- Chay rieng 1 node de test prompt/tool nhanh, khong can chay full graph.
- Van tao `workflow_run` + `workflow_node_runs` de theo doi lich su.

Body:

```json
{
  "threadId": "manual-node-test-001",
  "input": {
    "content": "Noi dung can test"
  }
}
```

## 6) Xem workflow graph

`GET /agent/workflows/:workflowId/graph`

Tra ve:

- `workflow`
- `nodes`
- `edges`

### 6.1 Xuat file JSON backup (toan bo graph + canvas + prompt/command)

`GET /agent/workflows/:workflowId/export`

- Response: file JSON (`Content-Type: application/json; charset=utf-8`, `Content-Disposition: attachment`).
- Ten file gom `workflow-<code>-backup.json` (code duoc lam sach ky tu khong hop le).
- Noi dung co `schemaVersion: 1`, `exportedAt`, `workflow` (code, name, description, status, inputPayload, entryNodeId), `nodes` (gom `id` node cu — dung lam khoa remap khi import), `edges` (fromNodeId / toNodeId theo id node trong file).

FE nut **Tai ban sao**: `window.open` / `fetch` + blob + `<a download>` voi URL co JWT (hoac fetch kem header Authorization roi tao object URL).

### 6.2 Nhap / chay lai tu file backup (workflow + node id moi)

`POST /agent/workflows/import`

Body:

```json
{
  "backup": { "...": "noi dung file export hoac object parse san" },
  "code": "optional_ma_moi_unique",
  "name": "Optional ten hien thi",
  "restoreStatus": false
}
```

- `backup`: bat buoc — object JSON dung format export (`schemaVersion`, `workflow`, `nodes`, `edges`).
- `code` (optional): neu bo trong, backend sinh `<code_goc>_import_<timestamp>` va tu them hau to neu trung unique.
- `name` (optional): mac dinh `"<ten_goc> (copy)"`.
- `restoreStatus` (optional, default false): neu `true`, sau khi luu graph se dat lai `status` giong file (vd `active`) — se chay validation giong luc activate; neu false, workflow moi luon bat dau o `draft`.

Ket qua: giong response bulk save graph: `workflow`, `nodes`, `edges`, `nodeKeyMap` (map **id node trong file** -> **id node moi** trong DB). Prompt template, `command_code`, `condition_expr` duoc rewrite tu id cu sang id moi (va clientKey/UUID trong `{nodes....}`) trong cung transaction `saveGraph`.

Neu import loi sau khi da tao row workflow, backend xoa workflow do (cleanup best-effort).

## 7) Xem chi tiet run

`GET /agent/workflows/runs/:runId`

Tra ve:

- `run`
- `nodeRuns` (log tung attempt cua tung node)

Luu y:

- API lich su khong tra cac record co `status = delete`.

### 7.0 Xem tong hop trang thai node cua 1 run (cho canvas FE)

`GET /agent/workflows/runs/:runId/summary`

Muc tieu:

- Dung khi FE reload trang hoac vao sau khi workflow da chay xong — khong can lien ket tung attempt.
- Tra ve `run` + `nodeStatuses` dang map theo `nodeId`, kem moi node 1 mang `attempts` chi tiet.

Response:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "run": { "id": "...", "status": "failed", "error": "…", "...": "..." },
    "nodeStatuses": {
      "<nodeId-a>": { "status": "succeeded", "lastDurationMs": 2100, "attempts": [ { "...": "..." } ], "...": "..." },
      "<nodeId-b>": { "status": "failed", "lastError": "KIE task abc123 failed…", "attempts": [ { "...": "..." } ], "...": "..." },
      "<nodeId-c>": { "status": "pending", "attempts": [] }
    }
  }
}
```

### 7.0.1 Realtime workflow events qua WebSocket

Trong khi workflow dang chay, backend emit 5 event qua Socket.IO (namespace `/webchat`, room `user:<uid>` tu auto-join khi login socket):

| Event                    | Trigger                                       | Payload chinh                                                                                         |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `workflow:run:started`   | Khi run vua duoc tao, status=running          | `{ runId, workflowId, status:'running', entryNodeId, startedAt, input }`                              |
| `workflow:node:started`  | Ngay truoc moi attempt cua node               | `{ runId, workflowId, nodeId, nodeName, attemptNo, startedAt }`                                       |
| `workflow:node:succeeded`| Khi attempt succeeded                         | `{ runId, workflowId, nodeId, nodeName, attemptNo, durationMs, output }`                              |
| `workflow:node:failed`   | Khi attempt failed (`willRetry` bao con retry)| `{ runId, workflowId, nodeId, nodeName, attemptNo, durationMs, error, willRetry }`                    |
| `workflow:run:finished`  | Khi run ket thuc (succeeded/failed/cancelled) | `{ runId, workflowId, status, error, finishedAt, finalOutput }`                                       |

FE pattern:

```ts
const socket = io(`${API_URL}/webchat`, { auth: { token: jwt } });

socket.on('workflow:run:started',    (p) => setActive(p.runId, p.entryNodeId));
socket.on('workflow:node:started',   (p) => setNodeStatus(p.nodeId, 'running'));
socket.on('workflow:node:succeeded', (p) => setNodeStatus(p.nodeId, 'succeeded', p.output));
socket.on('workflow:node:failed',    (p) => setNodeStatus(p.nodeId, p.willRetry ? 'running' : 'failed', null, p.error));
socket.on('workflow:run:finished',   (p) => finalizeRun(p));
```

Khi chua co socket (reload trang, lazy-open canvas...) → fallback goi `GET /runs/:runId/summary` de lay snapshot va bao mau node.

## 7.1 Danh sach runs cua 1 workflow

`GET /agent/workflows/:workflowId/runs?status=failed&limit=20&offset=0`

Query:

- `status` (optional): `pending | running | succeeded | failed | cancelled`
- `limit` (optional, default 20, max 200)
- `offset` (optional, default 0)

Response:

- `items`: danh sach `workflow_runs`
- `total`, `limit`, `offset`

## 7.2 Lich su chay cua 1 node

`GET /agent/workflows/:workflowId/nodes/:nodeId/runs?runId=<optional>&limit=20&offset=0`

Query:

- `runId` (optional): loc theo 1 lan chay workflow cu the
- `limit` (optional, default 20, max 200)
- `offset` (optional, default 0)

Response:

- `items`: danh sach `workflow_node_runs` (attempt-level logs)
- `total`, `limit`, `offset`

## 7.3 Xoa mem toan bo lich su (status -> delete)

Xoa mem toan bo lich su cua 1 workflow:

`DELETE /agent/workflows/:workflowId/runs`

Behavior:

- Cap nhat tat ca `workflow_runs.status` (khac `delete`) thanh `delete`.
- Cap nhat tat ca `workflow_node_runs.status` lien quan thanh `delete`.
- Sau do cac record nay se khong con hien trong cac API lich su.

Xoa mem lich su cua 1 node:

`DELETE /agent/workflows/:workflowId/nodes/:nodeId/runs`

Behavior:

- Cap nhat tat ca `workflow_node_runs.status` cua node (khac `delete`) thanh `delete`.
- Khong tac dong den `workflow_runs`.

## 8) Bulk save graph (cho UI keo-tha)

`PUT /agent/workflows/:workflowId/graph`

Muc tieu:

- Luu toan bo nodes + edges trong 1 request/transaction.
- Ho tro `expectedVersion` dang advisory (latest-write-wins de tranh fail khi autosave/drag-drop gan nhau).
- Ho tro node moi bang `clientKey` de map edge truoc khi co UUID that.
- **Khong dung endpoint nay de doi ten workflow**. Neu payload `nodes` rong se bi reject.

Body:

```json
{
  "expectedVersion": 3,
  "entryNodeClientKey": "node_fetch",
  "nodes": [
    {
      "id": "existing-node-uuid",
      "name": "rewrite_content",
      "posX": 420,
      "posY": 220,
      "toolCode": null,
      "promptTemplate": "Viet lai: {nodes.fetch_news.content}",
      "joinMode": "none"
    },
    {
      "clientKey": "node_fetch",
      "name": "fetch_news",
      "toolCode": "web_fetch",
      "commandCode": "{\"url\":\"{input.newsUrl}\"}",
      "joinMode": "none",
      "posX": 120,
      "posY": 220
    }
  ],
  "edges": [
    {
      "fromClientKey": "node_fetch",
      "toNodeId": "existing-node-uuid",
      "conditionExpr": "$.nodes.fetch_news.success == true",
      "priority": 10
    }
  ]
}
```

Luu y version:

- Backend van tang `workflow.version` sau moi lan save graph.
- `expectedVersion` duoc dung de telemetry/client-state, nhung khong chan cung khi mismatch.

Response co them:

- `nodeKeyMap`: map `clientKey -> node UUID` de UI cap nhat local state.

## Runtime nhanh song song va node gop nhanh

- Neu mot node co nhieu edge condition cung dung, engine fan-out cac nhanh do.
- Cac node ready trong cung mot wave duoc xu ly song song.
- Node gop nhanh dung `joinMode="wait_all"` (+ `joinExpected`) de doi du nhanh roi moi chay tiep.

## Validation graph truoc khi activate/run

Khi chuyen workflow sang `active` hoac khi goi `run`, engine kiem tra:

- Workflow phai co it nhat 1 node.
- `entry_node_id` phai thuoc workflow.
- Moi edge phai noi giua cac node thuoc workflow.
- Moi node chi duoc co toi da 1 default edge (`isDefault=true`).
- Khong cho phep cycle trong graph (hien tai khong ho tro loop vo han).

## Template bien dong `{...}`

Ban co the dung bien dong trong `promptTemplate` va `commandCode`:

- `{input.newsUrl}`
- `{input.title}`
- `{nodes.fetch_news.content}`
- `{nodes.rewrite_content.content}`

Luu y:

- Engine thay the theo dot-path.
- Gia tri object se duoc stringify JSON.
- Gia tri null/undefined se thay bang chuoi rong.

## Vi du curl nhanh

```bash
# 1) Tao workflow
curl -X POST "http://localhost:3000/agent/workflows" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "code": "news_to_web_basic",
    "name": "News To Web Basic"
  }'
```

```bash
# 2) Kich hoat workflow
curl -X PATCH "http://localhost:3000/agent/workflows/<workflowId>/status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "status": "active"
  }'
```

```bash
# 3) Chay workflow
curl -X POST "http://localhost:3000/agent/workflows/<workflowId>/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "input": {
      "newsUrl": "https://example.com/news/latest",
      "websiteApiUrl": "https://example.com/wp-json/custom/v1/posts",
      "title": "Tin tuc moi nhat"
    }
  }'
```
