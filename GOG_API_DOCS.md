# GOG REST API Docs

Tai lieu nay mo ta module REST `/gog` de cau hinh va xac thuc Google Workspace thu cong (khong can goi agent skill).

## Tong quan

- Base URL: `/api/v1/gog`
- Auth: JWT bat buoc (`Authorization: Bearer <token>`)
- Response thanh cong duoc wrap boi `ResponseInterceptor`:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {}
}
```

## Luong ket noi de frontend implement

1) Luu Google OAuth client JSON:
- `POST /api/v1/gog/credentials`

2) Ket noi lan dau (remote step1):
- `POST /api/v1/gog/connect/start`

3) User mo link, dang nhap Google, cap quyen, copy URL callback

4) Hoan tat ket noi lan dau (remote step2):
- `PATCH /api/v1/gog/connect/finish`

5) Khi da tung ket noi, ket noi lai:
- `POST /api/v1/gog/reconnect/start`
- `PATCH /api/v1/gog/reconnect/finish`

6) Kiem tra ket qua:
- `GET /api/v1/gog/status`

Neu can ep xac thuc lai token moi:
- goi `POST /api/v1/gog/reconnect/start` voi `forceReauth=true`

---

## 1) GET `/api/v1/gog/status`

Lay trang thai gog + ket noi google hien tai cua user.

### Request

- Method: `GET`
- Body: khong co

### Response (example)

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "gogAvailable": true,
    "connection": {
      "hasConnectionRow": true,
      "googleEmail": "user@gmail.com",
      "hasConsoleCredentialsJson": true,
      "hasGogState": true
    },
    "authList": {
      "success": true,
      "data": {
        "accounts": [
          {
            "email": "user@gmail.com"
          }
        ]
      }
    },
    "tokenProbe": {
      "ok": true,
      "reason": "usable"
    }
  }
}
```

### `tokenProbe.reason` y nghia

- `usable`: token dang dung duoc
- `usable_but_auth_list_empty`: token dung duoc qua probe thuc te, nhung `gog auth list` khong hien account (edge-case)
- `expired_or_revoked`: token het han/bi revoke (can re-auth)
- `probe_failed`: loi khac khi probe (network/scope/service)
- `no_saved_auth`: chua co auth da luu
- `not_checked`: chua du dieu kien de check (vd chua co credentials)

### `tokenProbe.checks`

Status API probe da dich vu (gmail/drive/sheets/docs):

- `gmail`: `gog gmail labels list --max 1`
- `drive`: `gog drive ls --max 1`
- `sheets`: `gog sheets list --max 1`
- `docs`: `gog docs list --max 1`

Backend chi tra `tokenProbe.ok = false` khi **tat ca** probe tren deu fail.

---

## 2) POST `/api/v1/gog/credentials`

Luu OAuth client JSON (Google Console credentials) vao DB cho user hien tai.

### Request body

```json
{
  "consoleCredentialsJson": "{ \"installed\": { \"client_id\": \"...\", \"client_secret\": \"...\" } }",
  "email": "user@gmail.com"
}
```

Rule moi:
- Neu user **chua co gia tri ket noi** trong `google_connections` (khong email/json/state), `email` la **bat buoc** va phai hop le.
- Neu user **da co gia tri ket noi**, API se **bo qua email trong request** (khong cap nhat email), chi cap nhat `consoleCredentialsJson`.

### Response (example)

```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "ok": true,
    "message": "Google Console OAuth credentials saved",
    "hasConsoleCredentialsJson": true,
    "emailUpdated": true,
    "googleEmail": "user@gmail.com"
  }
}
```

### Loi thuong gap

- `400`: `consoleCredentialsJson is required`
- `400`: `email is required and must be valid when no google connection value exists`
- `401`: JWT khong hop le

---

## 3) POST `/api/v1/gog/connect/start`

Bat dau remote auth step1 de lay link cap quyen Google cho user chua co gia tri ket noi.

### Request body

```json
{
  "email": "user@gmail.com"
}
```

Ghi chu:
- API nay chi dung cho lan dau: chi hop le khi user chua co gia tri ket noi trong `google_connections`.
- `email` optional neu da luu truoc do trong `google_connections.google_email`.

### Response (example thanh cong)

```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "ok": true,
    "message": "Auth step1 created. Open returned URL, then call PATCH /gog/connect/finish with authUrl.",
    "email": "user@gmail.com",
    "authUrl": "http://127.0.0.1:.../callback?code=...",
    "result": {
      "success": true,
      "data": {
        "authUrl": "http://127.0.0.1:.../callback?code=..."
      },
      "stderr": ""
    }
  }
}
```

### FE xu ly

- Link cap quyen co san o `data.authUrl`.
- Backup: frontend van nen doc them `data.result.data` (tuy version `gog` co the field ten khac nhau).
- Frontend nen hien thi toan bo `result.data` de debug neu khong tim thay truong link co ten co dinh.

### Loi thuong gap

- `400`: `Missing email. Provide email or configure one first.`
- `403`: `Connection already exists. Use reconnect API instead.`
- `200/201` voi `data.ok=false`: step1 that bai, xem `data.result.error`/`data.result.stderr`.

---

## 4) PATCH `/api/v1/gog/connect/finish`

Hoan tat remote auth cho lan dau bang callback URL user da copy sau khi cap quyen.

### Request body

```json
{
  "authUrl": "http://127.0.0.1:.../callback?code=...",
  "email": "user@gmail.com"
}
```

- `authUrl` bat buoc.
- `email` optional neu da co email luu san.

### Response (example)

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "ok": true,
    "message": "Auth step2 completed",
    "email": "user@gmail.com",
    "result": {
      "success": true,
      "data": {
        "account": "user@gmail.com"
      }
    }
  }
}
```

### Loi thuong gap

- `400`: `authUrl is required`
- `400`: `Missing email. Provide email or configure one first.`
- `403`: `Connection already exists. Use reconnect API instead.`
- `200` voi `data.ok=false`: step2 that bai, xem `data.result.error`/`stderr`.

---

## 5) POST `/api/v1/gog/reconnect/start`

Bat dau reconnect step1 (chi hop le khi da co gia tri ket noi).

### Request body

```json
{
  "email": "user@gmail.com",
  "forceReauth": true
}
```

### Response (example)

```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "ok": true,
    "message": "Auth step1 created. Open returned URL, then call PATCH /gog/connect/finish with authUrl.",
    "email": "user@gmail.com",
    "authUrl": "http://127.0.0.1:.../callback?code=...",
    "result": {
      "success": true,
      "data": {
        "authUrl": "http://127.0.0.1:.../callback?code=..."
      }
    }
  }
}
```

### Loi thuong gap

- `403`: `No existing connection. Use connect API first.`

---

## 6) PATCH `/api/v1/gog/reconnect/finish`

Hoan tat reconnect bang callback URL.

### Request body

```json
{
  "authUrl": "http://127.0.0.1:.../callback?code=...",
  "email": "user@gmail.com"
}
```

### Loi thuong gap

- `403`: `No existing connection. Use connect API first.`

---

## 7) PATCH `/api/v1/gog/connect/manual`

Flow manual auth (tuong duong mode `manual` trong skill).

### Request body

```json
{
  "email": "user@gmail.com"
}
```

### Response (example)

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "ok": true,
    "message": "Manual auth completed",
    "email": "user@gmail.com",
    "result": {
      "success": true,
      "data": {}
    }
  }
}
```

---

## 8) DELETE `/api/v1/gog/connect`

Reset gia tri ket noi cua user trong bang `google_connections` theo cach SET NULL.
API nay bat buoc xac thuc lai password cua user.

### Request body (required)

```json
{
  "password": "current_user_password"
}
```

### Response (example)

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "ok": true,
    "message": "Google connection values cleared for this user"
  }
}
```

---

## Du lieu duoc luu o dau

Bang `google_connections` (1 user = 1 dong):

- `uid`: user id
- `google_email`
- `console_credentials_json`
- `gog_state` (jsonb): file-map base64 cua state token/keyring/config cua gog

---

## Goi y FE (UI/UX)

1. Trang "Google Workspace Connection":
   - Nut `Save Credentials` -> `POST /credentials`
   - Nut `Connect / Reconnect` -> `POST /connect/start`
   - O nhap `Callback URL` + nut `Finish` -> `PATCH /connect/finish`
   - Nut `Reset Auth` -> `DELETE /connect`

2. Sau moi thao tac, goi lai `GET /status` de cap nhat:
   - Connected / Not connected
   - Token usable / expired_or_revoked

3. Neu `tokenProbe.reason = expired_or_revoked`:
   - Hien CTA "Reconnect"
   - Tu dong goi `POST /connect/start` voi `forceReauth=true`.

