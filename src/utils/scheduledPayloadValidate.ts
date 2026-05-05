import type { ScheduledPayloadTypeApi } from "@/services/WorkflowScheduleService";

/** Khớp backend: `validatePayloadValue` cho step — chuỗi số nguyên (regex), khác 0. */
const STEP_DELTA_RE = /^[-+]?\d+$/;

export function splitPayloadTokens(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function isValidStepDeltaString(raw: string): boolean {
  const s = raw.trim();
  if (!STEP_DELTA_RE.test(s)) return false;
  try {
    return BigInt(s) !== BigInt(0);
  } catch {
    return false;
  }
}

/** Fixed: nếu trông giống JSON object/array nhưng parse lỗi — chỉ cảnh báo, không chặn lưu (theo API). */
export function getFixedJsonParseIssue(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  const c = t[0];
  if (c !== "{" && c !== "[") return false;
  try {
    JSON.parse(t);
    return false;
  } catch {
    return true;
  }
}

export function validatePayloadValueByType(
  payloadType: ScheduledPayloadTypeApi,
  rawValue: string,
): { ok: true } | { ok: false; key: string; fallback: string } {
  const spValue = rawValue.trim();
  if (!spValue) {
    return {
      ok: false,
      key: "workflowSchedules.payloadValidation",
      fallback: "Enter key name and value.",
    };
  }
  if (payloadType === "step") {
    if (!isValidStepDeltaString(spValue)) {
      return {
        ok: false,
        key: "workflowSchedules.payloadStepValidation",
        fallback: "For step type, use an integer string like 1, -2, or +5 (non-zero). No decimals or scientific notation.",
      };
    }
  }
  if (payloadType === "loop" || payloadType === "random") {
    if (splitPayloadTokens(spValue).length === 0) {
      return {
        ok: false,
        key: "workflowSchedules.payloadListValidation",
        fallback: "For loop/random type, enter at least one item separated by comma or semicolon.",
      };
    }
  }
  return { ok: true };
}
