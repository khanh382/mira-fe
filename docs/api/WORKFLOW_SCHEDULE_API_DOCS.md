# Workflow Schedule API Docs

Tai lieu nay tom tat API scheduler cho workflow.

Controller: `src/agent/scheduler/workflow-schedule.controller.ts`

Base route: `/agent/scheduled-workflows` (JWT required).

## Danh sach endpoint

- `GET /agent/scheduled-workflows`
- `POST /agent/scheduled-workflows`
- `GET /agent/scheduled-workflows/:taskId`
- `PATCH /agent/scheduled-workflows/:taskId`
- `DELETE /agent/scheduled-workflows/:taskId`

Status actions:

- `POST /agent/scheduled-workflows/:taskId/activate`
- `POST /agent/scheduled-workflows/:taskId/pause`
- `POST /agent/scheduled-workflows/:taskId/disable`

Payload rows:

- `GET /agent/scheduled-workflows/:taskId/payloads`
- `POST /agent/scheduled-workflows/:taskId/payloads`
- `GET /agent/scheduled-workflows/:taskId/payloads/:payloadId`
- `PATCH /agent/scheduled-workflows/:taskId/payloads/:payloadId`
- `DELETE /agent/scheduled-workflows/:taskId/payloads/:payloadId`

Runs:

- `GET /agent/scheduled-workflows/:taskId/runs`

## Luu y

- API tu dong scope theo user trong JWT (`req.user.uid`).
- Route payloads/runs duoc dang ky truoc route `:taskId` de tranh shadow.
- Chi tiet payload flow va datetime persistence xem:
  - `docs/system-flows/WORKFLOW_SCHEDULE_PAYLOAD_FLOW.md`
  - `docs/system-flows/SCHEDULER_DATETIME_PERSISTENCE.md`
