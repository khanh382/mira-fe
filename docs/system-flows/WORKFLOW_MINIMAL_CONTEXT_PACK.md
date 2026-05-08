# Workflow Minimal Context Pack (1 page)

Muc tieu: dua file nay cho Cursor/Claude de sinh workflow JSON dung chuan, khong can doc `docs/api/*`.

## 1) Contract can nho (bat buoc)

- Workflow la graph co huong: `workflow` + `nodes` + `edges`.
- Node deterministic: `toolCode != null`, uu tien `commandCode` JSON string hop le.
- Node LLM: `toolCode = null`, `commandCode = null`, dung `promptTemplate`.
- Edge:
  - If/else: edge dieu kien (`isDefault=false`) + 1 edge fallback (`isDefault=true`).
  - Fan-out song song: nhieu edge `conditionExpr=null`, `isDefault=false`.
- Fan-in/gop nhanh:
  - Dat node dich `joinMode="wait_all"` + `joinExpected=<so nhanh>`.
- Placeholder:
  - `{input.someKey}`
  - `{nodes.<nodeName>.field}` hoac `{nodes.<nodeId>.field}`
- Trang thai workflow hop le: `draft | active | paused | archived`.

## 2) Dinh dang JSON import chuan

Model phai output theo schema backup/import:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "workflow": {
    "code": "my_workflow_code",
    "name": "My Workflow",
    "description": "Mo ta ngan",
    "status": "draft",
    "inputPayload": {},
    "entryNodeId": "11111111-1111-4111-8111-111111111111"
  },
  "nodes": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "b1_fetch",
      "toolCode": "web_fetch",
      "promptTemplate": "Doc noi dung URL {input.url}",
      "commandCode": "{\"url\":\"{input.url}\",\"mode\":\"markdown\"}",
      "modelOverride": null,
      "maxAttempts": 3,
      "timeoutMs": 120000,
      "joinMode": "none",
      "joinExpected": null,
      "posX": 120,
      "posY": 120
    }
  ],
  "edges": []
}
```

Rang buoc:

- `nodes[].id`, `workflow.entryNodeId`, `edges[].fromNodeId`, `edges[].toNodeId` deu la UUID.
- `commandCode` la string JSON hop le (escape dung).
- Khong dung field khong ton tai trong schema tren.

## 3) ToolCode an toan thuong dung

- `web_fetch`
- `http_request`
- `web_search`
- `google_workspace`
- `browser` (chi khi action DOM ro rang)
- `message_send`
- `exec` (chi khi that su can)

Ghi chu: `toolCode` phai la `skill_code` that (khong phai category).

## 4) Prompt mau de dua cho Cursor/Claude

```text
Ban la workflow engineer cho Mira Backend.
Hay tao workflow JSON IMPORT-RUNNABLE theo dung schema:
schemaVersion, workflow, nodes, edges.

Yeu cau:
1) Uu tien node deterministic (toolCode + commandCode), chi dung LLM node khi can.
2) Neu co split/merge phai dat edge/join dung quy tac.
3) Placeholder chi dung {input.*} va {nodes.*.*}.
4) Output DUY NHAT 1 JSON object hop le, khong them giai thich.

Sau JSON, tra them checklist 5 dong de verify:
- import
- activate
- run
- run summary
- node fail point
```

## 5) Checklist verify sau khi model sinh JSON

1. `code` unique, `status=draft`.
2. Co `entryNodeId` va ton tai trong `nodes`.
3. Moi edge tham chieu node hop le.
4. `commandCode` parse duoc thanh JSON object.
5. Neu co merge, da dat `joinMode=wait_all` + `joinExpected`.

