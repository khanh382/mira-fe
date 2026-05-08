# Workflow Playbook (Mira Backend)

Tai lieu nay la huong dan chi tiet de tao workflow hieu qua trong Mira Backend.
Muc tieu: chi can doc file nay la co the thiet ke, import, chay va debug workflow on dinh.

---

## 1) Tong quan kien truc workflow

Workflow trong he thong la mot do thi co huong:

- `workflow`: metadata (code, name, description, status, inputPayload, entryNodeId)
- `nodes`: cac buoc xu ly
- `edges`: canh dieu huong giua node

Runtime chay theo quy tac:

1. Bat dau tai `entryNodeId`
2. Chay node, ghi output
3. Danh gia `edges` outgoing cua node:
   - canh co `conditionExpr` hop le se duoc chon
   - neu khong canh nao match va co canh default (`isDefault=true`) thi di default
4. Lap lai den khi khong con node tiep theo

Node co the:

- goi skill qua `toolCode` + `commandCode` (uu tien deterministic)
- hoac de LLM xu ly (`toolCode=null`, dung `promptTemplate`)

---

## 2) Dinh dang file backup/import dung chuan

Khi import qua `POST /agent/workflows/import`, file phai dung schema backup:

- Co `schemaVersion`
- `workflow.entryNodeId` la UUID hop le (hoac null)
- Moi `nodes[i].id` la UUID hop le
- `edges` dung `fromNodeId` / `toNodeId` (UUID), khong dung ten node

Khung toi thieu:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "workflow": {
    "code": "my_workflow",
    "name": "My Workflow",
    "description": "Mo ta",
    "status": "draft",
    "inputPayload": {},
    "entryNodeId": "11111111-1111-4111-8111-111111111111"
  },
  "nodes": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "b1",
      "toolCode": null,
      "promptTemplate": "Hello",
      "commandCode": null,
      "modelOverride": null,
      "maxAttempts": 3,
      "timeoutMs": 120000,
      "joinMode": "none",
      "joinExpected": null,
      "posX": 100,
      "posY": 100
    }
  ],
  "edges": []
}
```

---

## 3) Chon loai node dung cach

### 3.1 Node deterministic (nen uu tien)

Dung khi tham so da ro rang:

- `http_request`
- `web_fetch`
- `exec`
- `tts`
- `image_generate`
- `n8n_workflow_run`
- `mcp_call`

Mau:

- `toolCode`: skill code
- `commandCode`: JSON string hop le
- `promptTemplate`: ngan (hoac null)

Vi du:

```json
{
  "name": "post_to_api",
  "toolCode": "http_request",
  "commandCode": "{\"url\":\"https://example.com/api/posts\",\"method\":\"POST\",\"authCode\":\"my_token\",\"body\":{\"title\":\"{input.title}\"}}",
  "promptTemplate": "POST data den API"
}
```

### 3.2 Node LLM reasoning

Dung khi can suy luan/noi dung mo:

- tom tat
- viet lai noi dung
- rut trich field phuc tap tu text lon
- phan tich va chuan hoa dau vao khong co schema cung

Mau:

- `toolCode = null`
- `commandCode = null`
- `promptTemplate` ro rang, ep output format neu can

---

## 4) Catalog skill huu dung (thuc chien)

### 4.0 Nguon truth: `database/seeds/skills_registry.sql` va bang `skills_registry`

**Workflow `toolCode` phai trung `skill_code` trong bang `skills_registry`** (skill dang hoat dong, hop le voi catalog). File SQL seed la noi **ghi lai day du** built-in skill mac dinh cua repo.

| Khai niem | Giai thich |
|-----------|------------|
| **File seed** | [`database/seeds/skills_registry.sql`](../database/seeds/skills_registry.sql) — `INSERT INTO skills_registry ... ON CONFLICT DO UPDATE`, chay sau migration, **chay lai an toan**. |
| **Cot quan trong trong seed** | `skill_code` (unique) — day la gia tri **`toolCode`** tren node workflow. `skill_name`, `display_name`, `description`, `file_path` (file `@RegisterSkill`), `category`, `min_model_tier`, `owner_only`, `is_active`, `skill_type`, `is_display`. |
| **`is_display = true`** | Skill **hien** trong catalog UI / `GET /agent/workflows/tool-options` (khi con `is_active` va filter owner). Day la tap skill **nen uu tien** khi thiet ke workflow cho nguoi chon. |
| **`is_display = false`** | Skill **noi bo / bao tri** (vd. `browser_debug_cleanup`) — van co the ton tai trong DB va code, **khong** day vao dropdown workflow thong thuong; chi dung khi biet ro can skill do. |
| **`owner_only`** | Skill chi hien cho user level owner trong tool-options (xem `WORKFLOW_API_DOCS.md`). |
| **`min_model_tier`** | Yeu cau tier LLM toi thieu khi node **khong** co `commandCode` va roi vao nhanh parse bang model (cheap / skill / processor / expert). |
| **Runtime** | Ung dung doc catalog tu **DB** (`skills_registry`), **khong** doc truc tiep file `.sql` luc chay. File SQL la **nguon ban ghi** khi setup / cap nhat moi truong. |
| **Schema DB day du** | Bang co them cot (vd. `parameters_schema`) — xem [`DATABASE_DBML.md`](../reference/DATABASE_DBML.md) muc `Table skills_registry`. Seed co the khong set het cot; migration / PATCH sau bo sung. |

**Quy trinh khi them skill moi (dev):**

1. Implement skill trong `src/agent/skills/...` + `@RegisterSkill` (neu la built-in).
2. Them / cap nhat dong trong **`database/seeds/skills_registry.sql`** (`skill_code`, `is_display`, `category`, ...).
3. Chay migration + seed (hoac pipeline deploy tuong duong) de DB dong bo.
4. Bo sung vi du `commandCode` trong [`SKILL_COMMAND_REFERENCE.md`](../skills/SKILL_COMMAND_REFERENCE.md) neu skill la deterministic.
5. Kiem tra `GET /agent/workflows/tool-options` va chay thu workflow voi `toolCode` moi.

**Khi viet workflow (human / AI):**

- **B1:** Mo file seed hoac goi API tool-options de lay **`skill_code` chinh xac** (khong doan ten).
- **B2:** Doi chieu tham so skill voi `SKILL_COMMAND_REFERENCE.md` + implementation tai `file_path` trong seed.
- **B3:** Planner (`/create_workflow`) cung chi duoc chon `toolCode` thuoc catalog DB — khong duoc bia skill khong ton tai.

---

Duoi day la nhung skill thuong dung cho workflow tu dong hoa (tom tat hanh vi; danh sach day du nam trong seed + DB):

### 4.1 `http_request`

Muc dich:

- Goi REST API
- Dang bai WordPress/custom API
- Goi Facebook Graph API

Tips:

- Dung `authCode` de lay token tu `http_tokens` (khong hardcode token)
- Payload JSON de trong `body`
- Co the dung `facebookPhotoBinaryUpload=true` khi POST `/photos`

### 4.2 `web_fetch`

Muc dich:

- Doc noi dung trang cong khai nhanh va on dinh

Tips:

- Dung `mode=markdown` de lay text de parse
- Tang `maxChars` neu noi dung dai

### 4.3 `web_search`

Muc dich:

- Tim nguon thong tin
- Lay danh sach ket qua theo query

### 4.4 `browser`

Muc dich:

- Tuong tac DOM (navigate/click/type/snapshot/evaluate/scroll)
- Dung cho luong can thao tac web thuc su (login, click, form)

Luu y quan trong:

- `browser` khong phai node "trich xuat bang prompt chung chung"
- Neu engine map sai action (vd. `extract`) se fail
- Khi dung `browser`, can action ro rang theo schema skill

### 4.5 `google_workspace`

Muc dich:

- Tuong tac Gmail/Drive/Sheets/... qua gog

Khi can truc tiep doc Sheet theo API google, nen uu tien skill nay neu auth da san sang.

### 4.6 `exec`

Muc dich:

- Chay shell command co kiem soat

Doi voi workflow, chi dung khi bat buoc; uu tien skill muc tieu hon.

### 4.7 `skills_registry_manage`

Muc dich:

- Quan ly/chay shared skill package
- `run_skill`, `bootstrap_skill`, `list_registry`, ...

Dung khi muon dong goi process de tai su dung.

---

## 5) Thiet ke edge dung pattern (rat quan trong)

Day la nguon loi pho bien nhat.

### 5.1 Tuan tu don gian

- Moi node co 1 outgoing edge default:
  - `conditionExpr = null`
  - `isDefault = true`

### 5.2 If/Else

- Cac nhanh dieu kien: `isDefault=false`, `conditionExpr` cu the
- Nhanh fallback: `isDefault=true`, `conditionExpr=null`

### 5.3 Fan-out song song

Khi tu 1 node tach ra nhieu nhanh doc lap:

- Tat ca edge outgoing:
  - `conditionExpr = null`
  - `isDefault = false`

Khong dung `conditionExpr="true"` de fan-out.

### 5.4 Fan-in (join) dung cach

Khi 1 node can cho nhieu nhanh:

- node dich dat:
  - `joinMode = "wait_all"`
  - `joinExpected = N` (so nhanh can cho)
- moi edge di vao node dich:
  - uu tien `conditionExpr = null`
  - tranh dieu kien cheo tham chieu output nhanh khac

Neu dat dieu kien cheo sai, workflow se "dung im lang" (khong loi nhung khong co edge match).

---

## 6) Quy tac prompt cho node LLM de output on dinh

### 6.1 Neu can output JSON

Phai noi ro:

- chi output JSON object duy nhat
- khong them giai thich
- schema ro rang

Vi du:

```text
Chi output JSON object duy nhat:
{"title":"string","tags":["string"],"canPost":boolean}
Khong them markdown, khong them text ngoai JSON.
```

### 6.2 Neu output la text thuan

Noi ro:

- chi output noi dung can dang
- khong them mo dau/ket luan

Vi du:

```text
Chi output DUY NHAT noi dung bai dang.
Giu nguyen xuong dong va icon.
```

### 6.3 Chuan hoa URL

Neu source co HTML escaped:

- ep thay `&amp;` -> `&`
- chi lay `http/https`

---

## 7) Playbook: Google Sheet -> Facebook Post (da kiem nghiem)

### 7.1 Muc tieu

Input:

- `googleSheetUrl`
- `targetId`
- `pageId`
- `authCode`

Output:

- Dang bai Facebook dung noi dung va anh tu dong ID trong Sheet

### 7.2 So do node khuyen nghi

1. `b1_fetch_sheet` (`web_fetch`)
2. `b2_extract_content` (LLM, text-only output)
3. `b2_extract_image_url` (LLM, output URL first)
4. `b3_post_with_image` (`http_request`, join `wait_all`)
5. (optional) `b4_post_text_fallback` (`http_request`) neu anh fail

### 7.3 Lenh POST anh len Facebook

Node `http_request` dang anh:

```json
{
  "url": "https://graph.facebook.com/v23.0/{input.pageId}/photos",
  "method": "POST",
  "authCode": "{input.authCode}",
  "facebookPhotoBinaryUpload": true,
  "body": {
    "url": "{nodes.b2_extract_image_url.content}",
    "message": "{nodes.b2_extract_content.content}",
    "published": true
  }
}
```

### 7.4 Loi thuong gap trong case nay

1. **Dung `browser` sai cach** -> `Unknown browser action: extract`
2. **Node LLM tra JSON string nhung edge doc nhu object**
3. **Join fan-in dat dieu kien cheo** -> node dich khong bao gio du dieu kien
4. **URL anh con `&amp;`** -> Graph API khong fetch duoc
5. **Link anh anti-hotlink/expired** -> post thanh cong text, fail anh

---

## 8) Checklist debug nhanh (khi workflow "dung im lang")

Kiem tra theo thu tu:

1. Node co `success=true` chua?
2. Edge outgoing co edge nao match khong?
3. Node dich co `joinMode=wait_all` khong? `joinExpected` dung chua?
4. Placeholder co dung field that cua node truoc khong? (`content`, `data`, `body`, ...)
5. `conditionExpr` co dang tham chieu sai path khong?

Neu thay:

- "khong loi nhung dung": thuong la loi edge/join
- "post text duoc nhung khong anh": thuong la URL anh/command photos

---

## 9) Input payload strategy

Nen de `workflow.inputPayload` lam mau default:

```json
{
  "googleSheetUrl": "https://docs.google.com/spreadsheets/d/.../edit?usp=sharing",
  "targetId": "1",
  "pageId": "61570699524691",
  "authCode": "graph_facebook_com_u2"
}
```

Loi ich:

- run thu nhanh ma khong can gui input moi lan
- de handover cho nguoi khac

---

## 10) Quy trinh tao workflow hieu qua (de nguoi moi/Cursor lam lai)

1. Xac dinh input contract
2. Ve graph truoc (node/edge/join)
3. Chon node deterministic toi da
4. Node LLM chi de parse/noi dung
5. Viet prompt ngan, output rang buoc
6. Kiem tra placeholder
7. Kiem tra edge condition
8. Import va chay test voi input that
9. Doc log moi node
10. Chot ban on dinh va luu backup

---

## 11) API/command nen nho

REST:

- `POST /agent/workflows/import`
- `POST /agent/workflows/:workflowId/run`
- `GET /agent/workflows/runs/:runId/summary`
- `GET /agent/workflows/:workflowId/export`

Chat command:

- `/create_workflow ...`
- `/wf view <id|code>`
- `/wf run <id|code> {json}`

---

## 12) Mau prompt "sieu an toan" cho node extract URL

Dung lai duoc cho nhieu bai toan:

```text
Doc input sau: {nodes.prev.content}
Tim gia tri URL anh cho record ID={input.targetId}.
Chi output DUY NHAT 1 URL day du bat dau bang http:// hoac https://.
Neu co &amp; thi doi thanh &.
Khong them bat ky ky tu nao khac URL.
Neu khong co URL hop le thi output chuoi rong.
```

---

## 13) Best practices tong ket

- Uu tien deterministic (`commandCode`) > LLM parsing
- Fan-in/fan-out phai ro rang, dung `joinMode` dung muc dich
- Khong over-condition o edge neu muc tieu la "di tiep"
- Prompt LLM phai rang buoc output format
- Luon co fallback path cho truong hop du lieu xau
- Luu file backup chuan de tai su dung

---

## 14) Planner mode (chat/REST) de tao workflow nhanh

Ngoai cach import backup thu cong, he thong co planner:

- Slash command: `/create_workflow`, `/wf plan`, `/wf activate`, `/wf run`
- REST:
  - `POST /api/v1/agent/workflows/plan`
  - `POST /api/v1/agent/workflows/:workflowId/plan/confirm`

Khi nao nen dung planner:

- Ban mo ta bai toan business level (khong muon ve node tay tu dau)
- Can sinh nhanh graph + input schema + canh bao token

Khi nao nen dung backup/import:

- Can workflow deterministic, da duoc debug ky
- Can handover exact graph cho nguoi khac

Luu y quan trong planner:

- Workflow planner luon tao `draft` truoc (draft-first)
- Co `warnings[]` neu thieu `http_tokens` hoac node deterministic thieu `commandCode`
- `inputSchema` duoc nhung trong `workflow.description` theo marker:
  - `<!-- mira:input_schema {...} -->`

---

## 15) Input schema marker strategy (cho UI/runtime form)

Neu workflow duoc tao boi planner, description co the chua marker input schema.

Tac dung:

- UI co the render form dong truoc khi run
- `/wf run` co the huong dan user dien JSON dung field required

Khuyen nghi:

1. Parse marker tu `workflow.description`
2. Tach phan mo ta user-doc va phan marker ky thuat
3. Render form theo `fields[]` + `sample`
4. Neu user khong nhap, fallback `sample` neu tat ca field optional

---

## 16) Run history & observability (de van hanh dai han)

API lich su can phai dung:

- `GET /agent/workflows/:workflowId/runs`
- `GET /agent/workflows/:workflowId/nodes/:nodeId/runs`
- `GET /agent/workflows/runs/:runId`
- `GET /agent/workflows/runs/:runId/summary`

Nen luu dashboard toi thieu:

- ti le `succeeded/failed` theo workflow
- p50/p95 `lastDurationMs` theo node
- node hay fail nhat (top failed nodes)
- tokens used voi node LLM (neu output co thong tin)

Don dep lich su:

- `DELETE /agent/workflows/:workflowId/runs` (soft-delete toan bo run workflow)
- `DELETE /agent/workflows/:workflowId/nodes/:nodeId/runs` (soft-delete run cua 1 node)

Luu y:

- Records da soft-delete se khong xuat hien trong API lich su thong thuong

---

## 17) Realtime UI tracking (Socket.IO) + fallback polling

Trong luc run, backend phat event realtime:

- `workflow:run:started`
- `workflow:node:started`
- `workflow:node:succeeded`
- `workflow:node:failed` (co `willRetry`)
- `workflow:run:finished`

Khuyen nghi UI:

1. Neu socket connected: cap nhat mau node realtime
2. Neu socket mat ket noi/reload: goi `GET /runs/:runId/summary` de rehydrate state
3. Luon show:
   - node dang `running`
   - `lastError`
   - `attemptNo`

Pattern an toan:

- Realtime de "live feeling"
- Summary polling de "eventual consistency"

---

## 18) Bulk save graph, versioning, va xung dot nhieu tab

UI editor nen uu tien:

- `PUT /agent/workflows/:workflowId/graph`

Vi sao:

- Save transaction cho ca graph (nodes + edges + entry)
- Giam loi graph nua save
- Ho tro node moi bang `clientKey`

Ve version:

- `expectedVersion` la advisory, backend van latest-write-wins
- Backend van tang `workflow.version` sau moi lan save

Khuyen nghi de tranh ghi de:

1. Giu `expectedVersion` local
2. Debounce autosave 1.0-1.5s
3. Hien "Unsaved changes"
4. Neu phat hien khac version voi snapshot nguoi dung dang xem, thong bao reload graph

---

## 19) Validation trap list (de tranh loi kho tim)

Danh sach loi can check truoc activate/run:

1. Node khong reachable tu entry
2. Node co hon 1 outgoing default edge
3. Edge noi toi node khong ton tai
4. Placeholder tham chieu sai field
5. Cycle trong graph (khong duoc ho tro)
6. Node deterministic nhung `commandCode` khong phai JSON hop le

Goi y:

- Them preflight check script/step trong UI truoc nut Activate

---

## 20) Placeholder map thuc chien (field hay dung)

Khong phai node nao cung co `content`.
Can map theo tool output that.

Nhanh-go:

- `web_fetch`: `content`, `markdown`, `title`, `text`
- `http_request`: `body`, `data`, `content`
- LLM direct (`toolCode=null`): thuong dung `content`
- `browser`: `content`, `html`, `data.text` (tuy action)
- `exec`: `stdout`, `stderr`, `exitCode`

Rule:

- Neu khong chac field, test rieng node bang `POST /nodes/:nodeId/run`
- Sau do chot placeholder dung theo output that

---

## 21) Test strategy 3 tang (de workflow ben)

Tang 1 - Node unit test:

- Test tung node bang `POST /nodes/:nodeId/run`
- Chot output schema that truoc khi noi node khac

Tang 2 - Path test:

- Chay full workflow voi input dai dien cho moi nhanh (if/else)
- Dam bao edge dieu kien match dung ky vong

Tang 3 - Soak test:

- Chay nhieu lan lien tiep voi input that
- Theo doi thoi gian, retry, va fail pattern

---

## 22) Facebook posting hardening checklist

Cho case Google Sheet -> Facebook:

1. URL anh da unescape `&amp; -> &`
2. URL anh co truy cap cong khai that
3. Dung endpoint phu hop:
   - text: `/feed`
   - co anh: `/photos` + `facebookPhotoBinaryUpload=true`
4. Token map dung `authCode` va domain hop le
5. Co fallback text-only neu post anh fail

Neu can album nhieu anh:

- can flow upload nhieu anh unpublished + attach media (hoac offload qua n8n)

---

## 23) Mau runbook handover cho team

Moi workflow nen co runbook ngan di kem:

1. Purpose: workflow dung de lam gi
2. Required input: field nao bat buoc
3. External dependencies: token/auth/domain nao can co
4. Happy path: ket qua thanh cong mong doi
5. Failure handling: fail thuong gap va cach xu ly
6. Owner: ai chiu trach nhiem bao tri

Mau template:

```text
Workflow: <code>
Purpose: ...
Inputs: ...
Dependencies: http_tokens(authCode=...), external APIs...
Success signal: run.status=succeeded, postId != null
Common failures: ...
On-call action: ...
```

---

## 24) Governance: naming, versioning, release

De scale nhieu workflow:

- Naming `code`: `<domain>_<task>_<vN>` (vd: `sheet_fb_post_v2`)
- Khong sua truc tiep ban dang chay production
- Dung quy trinh:
  1. export backup ban on dinh
  2. import branch moi (code moi)
  3. test
  4. activate ban moi
  5. archive ban cu neu can

---

## 25) Appendix: endpoint map day du

Core CRUD/graph:

- `POST /agent/workflows`
- `GET /agent/workflows`
- `PATCH /agent/workflows/:workflowId`
- `DELETE /agent/workflows/:workflowId`
- `GET /agent/workflows/:workflowId/graph`
- `PUT /agent/workflows/:workflowId/graph`
- `PATCH /agent/workflows/:workflowId/status`
- `PATCH /agent/workflows/:workflowId/entry-node`

Node/Edge:

- `POST /agent/workflows/:workflowId/nodes`
- `PATCH /agent/workflows/:workflowId/nodes/:nodeId`
- `DELETE /agent/workflows/:workflowId/nodes/:nodeId`
- `POST /agent/workflows/:workflowId/edges`
- `PATCH /agent/workflows/:workflowId/edges/:edgeId`
- `DELETE /agent/workflows/:workflowId/edges/:edgeId`

Run/History:

- `POST /agent/workflows/:workflowId/run`
- `POST /agent/workflows/:workflowId/nodes/:nodeId/run`
- `GET /agent/workflows/runs/:runId`
- `GET /agent/workflows/runs/:runId/summary`
- `GET /agent/workflows/:workflowId/runs`
- `GET /agent/workflows/:workflowId/nodes/:nodeId/runs`
- `DELETE /agent/workflows/:workflowId/runs`
- `DELETE /agent/workflows/:workflowId/nodes/:nodeId/runs`

Backup/import:

- `GET /agent/workflows/:workflowId/export`
- `POST /agent/workflows/import`

Planner/chat:

- `/create_workflow ...`
- `/wf list`
- `/wf view <id|code>`
- `/wf plan <id|code> <natural-language>`
- `/wf activate|pause|archive <id|code>`
- `/wf run <id|code> {input-json}`
- `POST /api/v1/agent/workflows/plan`
- `POST /api/v1/agent/workflows/:workflowId/plan/confirm`

---

## 26) Team guide trong 1 file (khong tach file)

Phan nay giu mot tai lieu duy nhat, nhung chia ro theo doi tuong su dung:

- Team Dev: tap trung kien truc + API + UI implementation
- Team Ops: tap trung van hanh + debug + su co + runbook

Khuyen nghi:

1. Team Dev doc muc `27`
2. Team Ops doc muc `28`
3. Team lead doc ca `27` + `28` de thong nhat quy trinh

---

## 27) WORKFLOW_PLAYBOOK_ARCHITECTURE (nhung trong file nay)

Day la "che do doc nhanh" cho team dev.

### 27.1 Muc tieu phan kien truc

- Hieu runtime workflow
- Dung API dung endpoint
- Implement UI editor va run monitor dung hanh vi backend
- Tranh race condition khi autosave/multi-tab

### 27.2 Pham vi team Dev can quan tam

1. Data model:
   - `workflow`, `node`, `edge`, `run`, `node_run`
2. Graph semantics:
   - sequential, branching, fan-out, fan-in
   - `joinMode`, `joinExpected`
3. Template engine:
   - `{input.xxx}`, `{nodes.xxx.yyy}`
4. Tool execution strategy:
   - deterministic (`commandCode`) truoc
   - fallback prompt neu can

### 27.3 API implementation checklist (Dev)

Core:

- CRUD workflow
- CRUD node/edge
- `PUT /graph` cho bulk save
- activate/pause/archive
- set entry node

Runtime:

- run full workflow
- run single node test
- get run detail/summary
- list/cleanup run history

Backup:

- export backup
- import backup
- remap node ids sau import

Planner:

- create/revise bang natural language
- confirm draft -> active
- hien warnings/missingTokens

### 27.4 UI architecture checklist (Dev)

Canvas:

- drag node
- connect/reconnect edge
- edge inspector (condition/default/priority)
- node inspector (tool/prompt/command/join)

State:

- `dirty`, `saving`, `expectedVersion`, `saveError`
- debounce autosave
- conflict warning + reload

Run monitor:

- websocket realtime events
- fallback polling summary
- color node status + retry state

### 27.5 Quy tac coding quan trong (Dev)

- Khong xem vi tri node tren canvas la thu tu thuc thi
- Thu tu thuc thi do entry + edges + conditions + priority quyet dinh
- Moi node toi da 1 outgoing default edge
- Khong tao cycle (backend chan)
- Validate local truoc save de UX tot hon

### 27.6 Gate review truoc merge (Dev)

1. Co test toi thieu cho saveGraph + run
2. Co test cho fan-in wait_all
3. Co test cho import/export backup schema
4. Co test cho edge condition fallback default
5. Co test cho websocket event contract

---

## 28) WORKFLOW_PLAYBOOK_OPERATIONS (nhung trong file nay)

Day la "che do doc nhanh" cho team van hanh (ops/on-call/support).

### 28.1 Muc tieu phan operations

- Van hanh workflow on dinh
- Chan doan nhanh khi workflow dung im lang
- Xu ly su co theo runbook
- Ban giao de nguoi khac co the tiep quan

### 28.2 Monitoring checklist (Ops)

Theo doi toi thieu moi workflow:

1. So run theo ngay
2. Ty le succeeded/failed
3. Node fail nhieu nhat
4. p50/p95 duration theo node
5. Su thay doi dot ngot ve tokens chi phi (neu co thong tin)

### 28.3 Daily health check (Ops)

Moi ngay:

1. Kiem tra run failed 24h gan nhat
2. Loc node fail lap lai > N lan
3. Kiem tra token/auth het han (`authCode`, domain bind)
4. Kiem tra endpoint ngoai co thay doi schema khong
5. Kiem tra workflow dang active co bi drift config khong

### 28.4 Incident triage workflow (Ops)

Khi co su co:

1. Xac dinh `runId` bi loi
2. Mo `GET /runs/:runId/summary`
3. Xac dinh node fail dau tien
4. Xem attempt detail node do
5. Phan loai loi:
   - du lieu dau vao
   - loi edge/join
   - loi token/auth
   - loi API ngoai
   - loi prompt/parse
6. Chon huong xu ly:
   - retry
   - rollback workflow version
   - sua config token
   - sua node prompt/command

### 28.5 "Khong loi nhung dung" playbook (Ops)

Neu run khong fail nhung dung giua chung:

1. Kiem tra edge match sau node truoc do
2. Kiem tra node dich co `wait_all` va `joinExpected` dung khong
3. Kiem tra placeholder tham chieu dung field that khong
4. Kiem tra co edge default fallback khong
5. Chay test rieng node bang `POST /nodes/:nodeId/run`

### 28.6 Incident template (Ops)

Dung mau nay de ghi nhan su co:

```text
Incident ID:
Workflow code:
Started at:
Detected by:
Impact:
Affected runs:
Root cause:
Mitigation:
Permanent fix:
Owner:
Follow-up deadline:
```

### 28.7 Runbook template (Ops)

Moi workflow production nen co:

1. Inputs required
2. Dependencies (token, domain, API)
3. Success signal
4. Common failure signatures
5. Immediate workaround
6. Escalation contact (dev owner)

### 28.8 Change management (Ops)

Quy trinh an toan:

1. Khong sua truc tiep ban production neu khong bat buoc
2. Clone/import thanh version moi
3. Test voi input dai dien
4. Activate version moi
5. Theo doi sat 24h dau
6. Archive version cu khi on dinh

### 28.9 Quyen han va an toan van hanh

- Chi owner/co quyen moi duoc activate/pause/archive
- Khong hardcode token vao workflow JSON
- Dung `authCode` + `http_tokens`
- Luu y cac hanh dong soft-delete run history de tranh mat dau vet dieu tra

---

## 29) Cach su dung theo vai tro (quick start)

### 29.1 Neu ban la Dev

Doc thu tu:

1. Muc 1 -> 6
2. Muc 14 -> 21
3. Muc 27

### 29.2 Neu ban la Ops

Doc thu tu:

1. Muc 7 -> 13
2. Muc 16 -> 23
3. Muc 28

### 29.3 Neu ban la Team lead

Doc:

- Muc 24 (governance)
- Muc 27 + 28
- Chuan hoa runbook theo muc 23 + 28.7

---

## 30) Cursor / Claude Code: chi doc playbook nay co "du" khong?

**Ket luan ngan:** Playbook nay **du de thiet ke dung kien truc** (node/edge/join, import backup, API/UI flow, van hanh). **Khong du mot minh** de dam bao moi `commandCode` skill luon dung 100% field/param — can **doi chieu them** voi catalog skill va sample code thuc te trong repo.

### 30.1 AI agent nen doc them gi (bat buoc khi co tool)

1. [`SKILL_COMMAND_REFERENCE.md`](../skills/SKILL_COMMAND_REFERENCE.md) — schema tham so dung cho `http_request`, `web_fetch`, `google_workspace`, ...
2. [`WORKFLOW_API_DOCS.md`](../api/WORKFLOW_API_DOCS.md) — chi tiet endpoint, response run/summary, websocket
3. [`WORKFLOW_CHAT_COMMANDS.md`](WORKFLOW_CHAT_COMMANDS.md) — planner, `http_tokens` warnings, input schema marker
4. [`WORKFLOW_UI_IMPLEMENTATION_GUIDE.md`](WORKFLOW_UI_IMPLEMENTATION_GUIDE.md) — bulk graph, `clientKey`, version conflict

### 30.2 Mau workflow tham chieu trong repo

- `database/seeds/workflow_sheet_id_to_facebook_post.json` — vi du da debug: `web_fetch` + LLM parse + `wait_all` + Facebook `/photos`

### 30.3 Gioi han thuc te (de dat ky vong dung)

- Model co the **bịa** `toolCode` hoac field khong ton tai → phai cross-check voi [`database/seeds/skills_registry.sql`](../database/seeds/skills_registry.sql) (cot `skill_code`), `GET /agent/workflows/tool-options`, hoac bang `skills_registry` tren DB.
- `commandCode` phai la **JSON string hop le** sau khi render placeholder; neu sai escape se fail im lang hoac fallback LLM-parse.
- Luon co buoc **verify**: import graph → `PATCH .../status` active (validate) hoac chay thu `POST .../run`.

---

## 31) Engine `conditionExpr` — cu phap va hanh vi can biet

Backend dung `WorkflowConditionService`: moi token dang `$.duong.dan.field` trong bieu thuc se duoc **thay bang JSON.stringify(gia tri)** lay tu `context`, sau do chay `Boolean(<bieu thuc da thay>)`.

Vi du hop le:

```text
$.nodes.fetch_news.success == true
$.nodes.b2_prepare_facebook_payload.success == true && $.input.flag == true
```

Luu y:

- Duong dan sau `$.` la **segment ASCII** (`[a-zA-Z0-9_]+` va dau `.`), khong ho tro bracket nhu `urls[0]` trong `conditionExpr` — voi dieu kien phuc tap, hay dua vao node truoc xuat ra boolean `ready` hoac dung edge `null` + join.

### 31.1 Quirk fan-out: canh dieu kien "luon dung" + canh default

Neu tu cung mot node co:

- nhieu canh **khong default** va **tat ca** `conditionExpr` sau khi evaluate deu "trivially true" (rong, `true`, `1`), **va**
- co it nhat mot canh **default** (`isDefault=true`) cung trivial,

thi engine **gom ca canh match + default** de chay **song song** (fan-out), khong phai if/else thuan.

Nguon: logic `resolveNextEdges` trong `workflow-engine.service.ts`.

Khuyen nghi:

- **If/else thuc su:** canh dieu kien phai la bieu thuc that su phan nhanh (khong dung `true`/`1`/`null` gia if).
- **Fan-out song song:** dat tat ca canh `conditionExpr=null`, `isDefault=false` (xem muc 5.3).

### 31.2 Gop nhanh (merge) voi `joinMode=none`

Theo huong dan planner trong code: node co **nhieu hon mot** canh vao van co the phai **cho du** cac nhanh vao truoc khi chay (merge hinh thoi), khong nham lan voi "chi can mot cha".

Khi can ro rang "doi N nhanh": dat `joinMode=wait_all` va `joinExpected=N`.

---

## 32) Meta-prompt san — danh cho Cursor / Claude khi user yeu cau "tao workflow"

Copy khoi prompt sau vao chat agent (sau khi agent da doc `docs/system-flows/WORKFLOW_PLAYBOOK.md`):

```text
Ban la ky su workflow Mira Backend. Chi tuan thu playbook `docs/system-flows/WORKFLOW_PLAYBOOK.md` va cross-check `docs/skills/SKILL_COMMAND_REFERENCE.md` cho moi toolCode.

Yeu cau user:
1) Mo ta tung buoc (B1, B2...) va input can thay doi.
2) Skill/API nao bat buoc (neu co).

Quy tac thiet ke:
- Uu tien tool deterministic + commandCode JSON hop le; LLM chi cho parse/viet noi dung.
- Neu can fan-in: joinMode wait_all + joinExpected dung; edge vao join uu tien conditionExpr=null.
- Neu if/else: 1 default + cac canh dieu kien that su (khong dung conditionExpr="true" de fan-out).
- Khong dung browser de "extract" neu khong co action ro rang trong skill browser.
- Khong hardcode token; dung authCode + http_tokens.
- Xuat ket qua cuoi dung 1 trong 2 dinh dang:
  A) File backup import duoc: schemaVersion, workflow, nodes[].id UUID, edges fromNodeId/toNodeId UUID, entryNodeId.
  B) Hoac mo ta graph + JSON tung node de user paste vao UI (neu khong tao file).

Sau khi sinh graph: liet ke checklist verify (activate, run, xem summary).
```

---

## 33) Checklist "xong moi noi workflow dung" (cho AI va nguoi)

1. Graph validate: activate hoac dry-run import
2. Moi node `http_request`/`web_fetch` co `commandCode` da match sample trong `docs/skills/SKILL_COMMAND_REFERENCE.md`
3. Placeholder `{nodes.<name>.field}` da verify bang run 1 node
4. Edge khong tao dead-end / join sai
5. Co fallback khi du lieu xau (token het han, URL anh loi)
6. Ghi `inputPayload` mau trong workflow de handover

---

Neu can mo rong tiep:

- Dang nhieu anh (album) thay vi 1 anh dau tien
- Validate URL anh truoc khi post (HEAD/GET check content-type)
- Add fallback auto text-only neu post anh that bai

