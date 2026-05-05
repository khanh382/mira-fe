import type { ApiResponse } from "@/services/AuthService";
import { listWorkflows } from "@/services/WorkflowEngineService";

export type WorkflowPickerOption = {
  id: string;
  name: string;
  code: string;
};

/** Chuẩn hóa một dòng từ GET /agent/workflows (cùng logic tổng quát với màn Workflows). */
export function normalizeWorkflowPickerRow(raw: Record<string, unknown>): WorkflowPickerOption | null {
  const id = String(raw.id ?? "");
  if (!id) return null;
  const nameRaw = raw.name ?? raw.workflow_name ?? raw.workflowName;
  return {
    id,
    code: String(raw.code ?? ""),
    name: typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : "Untitled workflow",
  };
}

function unwrapListPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown[] }).items)) {
    return (data as { items: unknown[] }).items;
  }
  return [];
}

/** Tải danh sách workflow cho combobox. */
export async function fetchWorkflowPickerOptions(): Promise<WorkflowPickerOption[]> {
  const res = (await listWorkflows()) as ApiResponse<unknown>;
  const rows = unwrapListPayload(res?.data);
  const out: WorkflowPickerOption[] = [];
  for (const item of rows) {
    const opt = normalizeWorkflowPickerRow((item || {}) as Record<string, unknown>);
    if (opt) out.push(opt);
  }
  return out;
}
