/** Helper UI → cron 5-field (phút giờ ngày tháng thứ) — server timezone theo backend. */

export type CronBuilderMode = "everyMinutes" | "dailyTimes" | "hourly" | "custom";

export type CronBuilderState = {
  mode: CronBuilderMode;
  /** Khoảng cách tổng (phút nguyên ≥ 1). Chỉ map được sang cron khi 1–59 hoặc bội của 60 (mỗi N giờ tại :00). */
  everyMinutes: number;
  /** Ví dụ: "7:00, 12:15, 20:55" — chỉ gộp một cron khi mọi mốc cùng phút (phút trong giờ). */
  dailyTimesText: string;
  /** Phút M trong mỗi giờ (cron: M, star, star, star, star). */
  hourlyMinute: number;
  customCron: string;
};

export function defaultCronBuilderState(): CronBuilderState {
  return {
    mode: "dailyTimes",
    everyMinutes: 15,
    dailyTimesText: "9:00",
    hourlyMinute: 0,
    customCron: "0 9 * * *",
  };
}

export type ClockTime = { h: number; m: number };

/** Hiển thị khoảng thời gian từ tổng số phút (vd 95 → "1h 35m"). */
export function formatEveryMinutesDuration(totalMin: number): string {
  const n = Math.floor(Math.abs(Number(totalMin)));
  if (!Number.isFinite(n) || n < 1) return "";
  const d = Math.floor(n / 1440);
  const h = Math.floor((n % 1440) / 60);
  const m = n % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

/** Parse một token "7", "7:00", "07:15". */
export function parseClockToken(token: string): ClockTime | null {
  const s = token.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = m[2] != null && m[2] !== "" ? Math.min(59, Math.max(0, parseInt(m[2], 10))) : 0;
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return { h, m: min };
}

/** Parse danh sách thời gian trong ngày (phân tách bằng dấu phẩy hoặc chấm phẩy). */
export function parseDailyTimesList(text: string): ClockTime[] {
  const parts = text.split(/[,;]/);
  const out: ClockTime[] = [];
  for (const p of parts) {
    const t = parseClockToken(p);
    if (t) out.push(t);
  }
  return out.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
}

/** Gom các mốc theo phút-trong-giờ; nếu nhiều nhóm → không gộp được một cron 5-field chuẩn. */
export function groupDailyTimesByMinute(times: ClockTime[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const { h, m } of times) {
    const existing = map.get(m);
    if (existing) {
      if (!existing.includes(h)) existing.push(h);
    } else {
      map.set(m, [h]);
    }
  }
  for (const hours of map.values()) hours.sort((a, b) => a - b);
  return map;
}

/** Cron every-N phút: 1–59 là step phút; bội 60 (1–23 giờ) là phút 0 và bước giờ; 1440 phút ≈ mỗi ngày lúc 0:00. */
export function tryBuildEveryMinutesCron(totalMin: number): string | null {
  const n = Math.floor(Math.abs(Number(totalMin)));
  if (!Number.isFinite(n) || n < 1) return null;
  if (n <= 59) return `*/${n} * * * *`;
  if (n % 60 !== 0) return null;
  const H = n / 60;
  if (H === 24) return `0 0 * * *`;
  if (H >= 1 && H <= 23) return `0 */${H} * * *`;
  return null;
}

/** Một cron cho các mốc trong ngày; chỉ khi cùng phút (vd 7:15 và 12:15 → phút 15). */
export function tryBuildDailyTimesCron(times: ClockTime[]): string | null {
  if (times.length === 0) return null;
  const byMin = groupDailyTimesByMinute(times);
  if (byMin.size !== 1) return null;
  const [minute, hours] = [...byMin.entries()][0];
  const hs = hours.join(",");
  return `${minute} ${hs} * * *`;
}

export type CronBuilderIssue =
  | { kind: "everyMinutesNotExpressible"; minutes: number }
  | { kind: "dailyTimesMixedMinutes" }
  | { kind: "dailyTimesEmpty" };

/** Kiểm tra trước khi lưu / hiển thị cảnh báo. */
export function getCronBuilderIssues(s: CronBuilderState): CronBuilderIssue[] {
  const issues: CronBuilderIssue[] = [];
  if (s.mode === "everyMinutes") {
    const n = Math.floor(Number(s.everyMinutes) || 0);
    if (tryBuildEveryMinutesCron(n) == null) {
      issues.push({ kind: "everyMinutesNotExpressible", minutes: n });
    }
  }
  if (s.mode === "dailyTimes") {
    const times = parseDailyTimesList(s.dailyTimesText);
    if (times.length === 0) issues.push({ kind: "dailyTimesEmpty" });
    else if (tryBuildDailyTimesCron(times) == null) issues.push({ kind: "dailyTimesMixedMinutes" });
  }
  return issues;
}

function formatDailyTimesForState(times: ClockTime[]): string {
  return times.map(({ h, m }) => (m === 0 ? String(h) : `${h}:${String(m).padStart(2, "0")}`)).join(", ");
}

// Sinh chuỗi cron 5-field từ form: every-N phút / mốc giờ trong ngày / mỗi giờ / custom.
/** Chuỗi rỗng nếu mode everyMinutes/dailyTimes không map được (client phải chặn lưu hoặc chuyển custom). */
export function buildCronExpression(s: CronBuilderState): string {
  switch (s.mode) {
    case "everyMinutes": {
      const n = Math.floor(Number(s.everyMinutes) || 1);
      return tryBuildEveryMinutesCron(n) ?? "";
    }
    case "dailyTimes": {
      const times = parseDailyTimesList(s.dailyTimesText);
      return tryBuildDailyTimesCron(times) ?? "";
    }
    case "hourly": {
      const m = Math.min(59, Math.max(0, Math.floor(Number(s.hourlyMinute) || 0)));
      return `${m} * * * *`;
    }
    case "custom":
    default:
      return (s.customCron || "").trim() || "0 9 * * *";
  }
}

/** Exported để validate form legacy (page có thể gọi parseDailyTimesList). */
export function parseHoursList(text: string): number[] {
  const times = parseDailyTimesList(text);
  return [...new Set(times.map((t) => t.h))].sort((a, b) => a - b);
}

/** Đọc cron từ API → form (best-effort; không khớp thì custom). */
export function parseCronExpression(cron: string): CronBuilderState {
  const base = defaultCronBuilderState();
  const t = (cron || "").trim();
  if (!t) return base;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length !== 5) {
    return { ...base, mode: "custom", customCron: t };
  }
  const [a, b, c, d, e] = parts;

  if (a.startsWith("*/")) {
    const n = parseInt(a.slice(2), 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 59 && b === "*" && c === "*" && d === "*" && e === "*") {
      return { ...base, mode: "everyMinutes", everyMinutes: n, customCron: t };
    }
  }

  if (a === "0" && b.startsWith("*/")) {
    const H = parseInt(b.slice(2), 10);
    if (!Number.isNaN(H) && H >= 1 && H <= 24 && c === "*" && d === "*" && e === "*") {
      const everyMinutes = H === 24 ? 1440 : H * 60;
      return { ...base, mode: "everyMinutes", everyMinutes, customCron: t };
    }
  }

  if (a === "0" && b === "0" && c === "*" && d === "*" && e === "*") {
    return {
      ...base,
      mode: "dailyTimes",
      dailyTimesText: "0:00",
      customCron: t,
    };
  }

  if (b === "*" && c === "*" && d === "*" && e === "*" && !a.includes("*")) {
    const m = parseInt(a, 10);
    if (!Number.isNaN(m) && m >= 0 && m <= 59) {
      return { ...base, mode: "hourly", hourlyMinute: m, customCron: t };
    }
  }

  if (c === "*" && d === "*" && e === "*" && !a.includes("*") && !b.includes("*")) {
    const minute = parseInt(a, 10);
    if (!Number.isNaN(minute) && minute >= 0 && minute <= 59) {
      const hourParts = b.split(",").map((x) => parseInt(x.trim(), 10));
      if (hourParts.every((h) => !Number.isNaN(h) && h >= 0 && h <= 23)) {
        const times: ClockTime[] = hourParts.map((h) => ({ h, m: minute }));
        return {
          ...base,
          mode: "dailyTimes",
          dailyTimesText: formatDailyTimesForState(times),
          customCron: t,
        };
      }
    }
  }

  return { ...base, mode: "custom", customCron: t };
}
