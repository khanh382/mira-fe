# Chuẩn hoá thời gian theo `cof_scheduler_timezone` trước khi lưu DB

## Mục tiêu

- Một **múi giờ nghiệp vụ** toàn hệ thống: cột **`config.cof_scheduler_timezone`** (`schedulerTimezone` / IANA hợp lệ; trống hoặc sai → **`UTC`**).
- Khi API **tạo/sửa (CU)** nhận thời gian do người dùng nhập (chuỗi **không** kèm offset / `Z`), backend phải hiểu đó là **giờ địa phương trong múi đó**, rồi lưu vào PostgreSQL dưới dạng **instant UTC** (`timestamptz` + `Date` UTC trong TypeORM).

Server và DB có thể ở bất kỳ TZ nào; **không** dựa vào timezone của process để đoán chuỗi thiếu offset.

## API dùng trong code

Inject **`GlobalConfigService`** (module đã import `GlobalConfigModule`):

```typescript
// Ví dụ trước khi gán entity.someAt = ...
const at = await this.globalConfigService.normalizeUserTemporalToUtcForDb(dto.startsAt);
entity.startsAt = at; // null hoặc Date (UTC instant)
```

- **`normalizeUserTemporalToUtcForDb(input)`**  
  - `null` / `undefined` / `''` → `null`  
  - Chuỗi có **`Z`** hoặc **`±hh:mm`** → parse đúng instant (không đổi nghĩa theo `cof_scheduler_timezone`).  
  - Chuỗi không offset (vd. `2026-05-02T14:30:00`, `2026-05-02 14:30:00`, `2026-05-02`) → hiểu trong **`cof_scheduler_timezone`**, trả **`Date`** tương ứng UTC.  
  - `Date` / epoch **ms** → giữ nguyên instant (dùng khi client đã gửi đúng millisecond).

Parse chi tiết (Luxon) nằm trong **`src/common/datetime/user-temporal-to-utc.util.ts`** (`userTemporalInputToUtc`).

## Những chỗ **không** được gọi hàm này

| Trường hợp | Lý do |
|------------|--------|
| `expiresAt` / token từ **OAuth** (OpenAI, Google, …) | Thời điểm do **nhà cung cấp** định nghĩa, phải giữ nguyên chuỗi/offset gốc. |
| `@CreateDateColumn` / `@UpdateDateColumn` | TypeORM/server tự ghi UTC. |
| TTL kiểu `new Date(Date.now() + CODE_TTL_MS)` | Instant server, không phải “giờ nhập theo múi config”. |
| Cron expression / `intervalMinutes` | Không phải một mốc `timestamptz` đơn. |

## Rà soát module

Mọi **DTO** có trường ngày-giờ do user nhập (không bắt buộc RFC3339 full offset) cần gọi **`normalizeUserTemporalToUtcForDb`** (hoặc `userTemporalInputToUtc` nếu đã có sẵn `tz`) trước `save` / `update`.

Sau khi đổi `schedulerTimezone` qua `POST /api/v1/config/set`, cache TZ trong `GlobalConfigService` được xóa; lần gọi normalize tiếp theo đọc giá trị mới.

## Liên quan

- Múi giờ cron job: `GlobalConfigService.getSchedulerTimezone()` — cùng nguồn cột `cof_scheduler_timezone`.
- API xem đồng hồ theo múi hiệu lực: **`GET /api/v1/config/get-time-now`** (xem `CONFIG_API_DOCS.md`).
