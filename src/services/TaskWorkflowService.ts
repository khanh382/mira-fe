import axiosClient from "@/utils/axiosClient";
import type { ApiResponse } from "@/services/AuthService";

export type OnFailure = "stop" | "skip" | "continue";
export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type RunTrigger = "manual" | "cron" | "chat";
export type RunTaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface TaskSummary {
  id: number;
  userId?: number;
  taskCode: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

type TaskSummaryRaw = {
  id?: number;
  taskId?: number;
  task_id?: number;
  userId?: number;
  uid?: number;
  taskCode?: string;
  task_code?: string;
  name?: string;
  description?: string | null;
  enabled?: boolean;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
};

export interface WorkflowTask {
  id: number;
  workflowId: number;
  taskId: number;
  taskOrder: number;
  onFailure: OnFailure;
  task?: TaskSummary;
}

export interface Workflow {
  id: number;
  userId: number;
  name: string;
  description?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  workflowTasks: WorkflowTask[];
}

export interface WorkflowRunTask {
  id: string;
  workflowRunId: string;
  taskId: number;
  taskOrder: number;
  taskRunId: string | null;
  status: RunTaskStatus;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface WorkflowRun {
  id: string;
  workflowId: number;
  userId: number;
  status: RunStatus;
  trigger: RunTrigger;
  currentTaskOrder: number;
  error?: string | null;
  summary?: string | null;
  context?: Record<string, unknown> | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  runTasks?: WorkflowRunTask[];
  workflow?: Workflow;
}

export interface WorkflowTaskPayloadItem {
  taskId: number;
  taskOrder: number;
  onFailure?: OnFailure;
}

export interface SkillCatalogItem {
  id?: number;
  displayName: string;
  skillCode: string;
  description?: string | null;
  category?: string | null;
  ownerOnly?: boolean;
}

type SkillCatalogRaw = {
  id?: number;
  display_name?: string;
  displayName?: string;
  skill_code?: string;
  skillCode?: string;
  description?: string | null;
  category?: string | null;
  owner_only?: boolean;
  ownerOnly?: boolean;
  is_display?: boolean;
};

const normalizeTaskSummary = (raw: TaskSummaryRaw): TaskSummary | null => {
  const id = Number(raw.id ?? raw.taskId ?? raw.task_id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    userId: raw.userId ?? raw.uid,
    taskCode: String(raw.taskCode ?? raw.task_code ?? `task_${id}`),
    name: String(raw.name ?? `Task #${id}`),
    description: raw.description ?? null,
    enabled: raw.enabled,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  };
};

export const listTasks = async () => {
  const response = await axiosClient.get<ApiResponse<unknown>>("/tasks");
  const data = response.data?.data as unknown;

  const source: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { items?: unknown[] })?.items)
      ? ((data as { items?: unknown[] }).items as unknown[])
      : [];

  const normalized = source
    .map((item: unknown) => normalizeTaskSummary((item || {}) as TaskSummaryRaw))
    .filter((item: TaskSummary | null): item is TaskSummary => Boolean(item));

  return {
    ...response.data,
    data: normalized,
  };
};

export const createTask = async (payload: {
  name: string;
  code: string;
  description?: string;
  enabled?: boolean;
  steps?: Array<{
    stepOrder: number;
    name: string;
    executorType: "internal" | "openclaw";
    skillCode?: string;
    prompt: string;
    retryCount?: number;
    timeoutMs?: number;
    onFailure?: "stop" | "skip" | "continue";
  }>;
}) => {
  const response = await axiosClient.post<ApiResponse<any>>("/tasks", {
    name: payload.name,
    code: payload.code,
    description: payload.description,
    enabled: payload.enabled ?? true,
    steps: payload.steps,
  });
  const created = normalizeTaskSummary((response.data?.data || {}) as TaskSummaryRaw);
  return {
    ...response.data,
    data: created,
  } as ApiResponse<TaskSummary | null>;
};

export const listSkillCatalog = async (category?: string) => {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  const response = await axiosClient.get<ApiResponse<unknown>>(`/gateway/skill-catalog${query}`);
  const data = response.data?.data as unknown;
  const source: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { items?: unknown[] })?.items)
      ? ((data as { items?: unknown[] }).items as unknown[])
      : [];

  const normalized = source
    .map((item: unknown) => {
      const raw = (item || {}) as SkillCatalogRaw;
      const skillCode = String(raw.skillCode ?? raw.skill_code ?? "");
      if (!skillCode) return null;
      return {
        id: raw.id,
        displayName: String(raw.displayName ?? raw.display_name ?? skillCode),
        skillCode,
        description: raw.description ?? null,
        category: raw.category ?? null,
        ownerOnly: Boolean(raw.ownerOnly ?? raw.owner_only),
      } as SkillCatalogItem;
    })
    .filter((item: SkillCatalogItem | null): item is SkillCatalogItem => Boolean(item));

  return {
    ...response.data,
    data: normalized,
  };
};

export const listWorkflows = async () => {
  const response = await axiosClient.get<ApiResponse<Workflow[]>>("/task-workflows");
  return response.data;
};

export const getWorkflowDetail = async (id: number) => {
  const response = await axiosClient.get<ApiResponse<Workflow>>(`/task-workflows/${id}`);
  return response.data;
};

export const createWorkflow = async (payload: {
  name: string;
  description?: string;
  enabled?: boolean;
  tasks: WorkflowTaskPayloadItem[];
}) => {
  const response = await axiosClient.post<ApiResponse<Workflow>>("/task-workflows", payload);
  return response.data;
};

export const updateWorkflowMeta = async (
  id: number,
  payload: { name?: string; description?: string; enabled?: boolean },
) => {
  const response = await axiosClient.patch<ApiResponse<Workflow>>(`/task-workflows/${id}`, payload);
  return response.data;
};

export const disableWorkflow = async (id: number) => {
  await axiosClient.delete(`/task-workflows/${id}`);
};

export const replaceWorkflowTasks = async (
  id: number,
  payload: { tasks: WorkflowTaskPayloadItem[] },
) => {
  const response = await axiosClient.put<ApiResponse<Workflow>>(`/task-workflows/${id}/tasks`, payload);
  return response.data;
};

export const addWorkflowTask = async (
  id: number,
  payload: { taskId: number; insertAfterOrder?: number; onFailure?: OnFailure },
) => {
  const response = await axiosClient.post<ApiResponse<Workflow>>(`/task-workflows/${id}/tasks`, payload);
  return response.data;
};

export const patchWorkflowTask = async (
  workflowId: number,
  wtId: number,
  payload: { taskId?: number; taskOrder?: number; onFailure?: OnFailure },
) => {
  const response = await axiosClient.patch<ApiResponse<Workflow>>(
    `/task-workflows/${workflowId}/tasks/${wtId}`,
    payload,
  );
  return response.data;
};

export const deleteWorkflowTask = async (workflowId: number, wtId: number) => {
  const response = await axiosClient.delete<ApiResponse<Workflow>>(
    `/task-workflows/${workflowId}/tasks/${wtId}`,
  );
  return response.data;
};

export const runWorkflow = async (id: number) => {
  const response = await axiosClient.post<ApiResponse<{ runId: string }>>(`/task-workflows/${id}/run`);
  return response.data;
};

export const listWorkflowRuns = async (workflowId?: number) => {
  const query = workflowId ? `?workflowId=${workflowId}` : "";
  const response = await axiosClient.get<ApiResponse<WorkflowRun[]>>(`/task-workflows/runs${query}`);
  return response.data;
};

export const getWorkflowRunDetail = async (runId: string) => {
  const response = await axiosClient.get<ApiResponse<WorkflowRun>>(`/task-workflows/runs/${runId}`);
  return response.data;
};
