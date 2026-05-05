import axiosClient from "@/utils/axiosClient";
import type { ApiResponse } from "@/services/AuthService";

export type WorkflowScheduleStatus = "active" | "paused" | "disabled";

export type ScheduledPayloadTypeApi = "fixed" | "step" | "loop" | "random";

/** Bản ghi lịch workflow (`GET /` một phần tử). */
export type WorkflowScheduleRecord = {
  id: number;
  code: string;
  name: string;
  cronExpression: string;
  workflowId: string;
  workflowSetPayload: boolean;
  scheduleSessionId?: string | null;
  status: WorkflowScheduleStatus;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  consecutiveFailures?: number;
  totalFailures?: number;
  totalSuccesses?: number;
  maxRetries?: number;
  timeoutMs?: number;
  targetType?: string;
  [key: string]: unknown;
};

export type ScheduledPayloadRow = {
  id: number;
  taskWorkflowId: number;
  keyName: string;
  payloadType: ScheduledPayloadTypeApi;
  value: string;
  sp_value: string;
  stepCursor?: number | null;
  [key: string]: unknown;
};

export type WorkflowScheduleDetailResponse = {
  schedule: WorkflowScheduleRecord;
  payloads: ScheduledPayloadRow[];
};

export type CreateWorkflowSchedulePayload = {
  workflowId: string;
  cronExpression: string;
  /** `code` do backend sinh — không gửi từ client. */
  name: string;
  workflowSetPayload?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
};

export type UpdateWorkflowSchedulePayload = Partial<
  Pick<
    CreateWorkflowSchedulePayload,
    "workflowId" | "cronExpression" | "name" | "workflowSetPayload" | "maxRetries" | "timeoutMs"
  >
>;

export type CreateScheduledPayloadBody = {
  keyName: string;
  payloadType: ScheduledPayloadTypeApi;
  sp_value: string;
};

export type UpdateScheduledPayloadBody = Partial<CreateScheduledPayloadBody>;

export type WorkflowRunLogItem = {
  id: number;
  taskWorkflowId?: number;
  sessionId?: string;
  turnInSession?: number;
  output?: unknown;
  error?: string | null;
  createdAt?: string;
  [key: string]: unknown;
};

export type WorkflowRunsPage = {
  items: WorkflowRunLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const unwrap = <T>(res: { data: ApiResponse<T> }) => res.data.data;

export const listWorkflowSchedules = async () => {
  const response = await axiosClient.get<ApiResponse<WorkflowScheduleRecord[]>>("/agent/scheduled-workflows");
  return unwrap(response);
};

export const getWorkflowScheduleDetail = async (taskId: number) => {
  const response = await axiosClient.get<ApiResponse<WorkflowScheduleDetailResponse>>(
    `/agent/scheduled-workflows/${taskId}`,
  );
  return unwrap(response);
};

export const createWorkflowSchedule = async (payload: CreateWorkflowSchedulePayload) => {
  const response = await axiosClient.post<ApiResponse<WorkflowScheduleRecord>>(
    "/agent/scheduled-workflows",
    payload,
  );
  return unwrap(response);
};

export const updateWorkflowSchedule = async (taskId: number, payload: UpdateWorkflowSchedulePayload) => {
  const response = await axiosClient.patch<ApiResponse<WorkflowScheduleRecord>>(
    `/agent/scheduled-workflows/${taskId}`,
    payload,
  );
  return unwrap(response);
};

export const deleteWorkflowSchedule = async (taskId: number) => {
  const response = await axiosClient.delete<ApiResponse<{ ok: boolean }>>(
    `/agent/scheduled-workflows/${taskId}`,
  );
  return unwrap(response);
};

export const activateWorkflowSchedule = async (taskId: number) => {
  const response = await axiosClient.post<ApiResponse<WorkflowScheduleRecord>>(
    `/agent/scheduled-workflows/${taskId}/activate`,
  );
  return unwrap(response);
};

export const pauseWorkflowSchedule = async (taskId: number) => {
  const response = await axiosClient.post<ApiResponse<WorkflowScheduleRecord>>(
    `/agent/scheduled-workflows/${taskId}/pause`,
  );
  return unwrap(response);
};

export const disableWorkflowSchedule = async (taskId: number) => {
  const response = await axiosClient.post<ApiResponse<WorkflowScheduleRecord>>(
    `/agent/scheduled-workflows/${taskId}/disable`,
  );
  return unwrap(response);
};

export const getWorkflowScheduleRuns = async (taskId: number, page = 1, limit = 20) => {
  const response = await axiosClient.get<ApiResponse<WorkflowRunsPage>>(
    `/agent/scheduled-workflows/${taskId}/runs`,
    { params: { page, limit } },
  );
  return unwrap(response);
};

export const listWorkflowSchedulePayloads = async (taskId: number) => {
  const response = await axiosClient.get<ApiResponse<ScheduledPayloadRow[]>>(
    `/agent/scheduled-workflows/${taskId}/payloads`,
  );
  return unwrap(response);
};

export const createScheduledPayload = async (taskId: number, body: CreateScheduledPayloadBody) => {
  const response = await axiosClient.post<ApiResponse<ScheduledPayloadRow>>(
    `/agent/scheduled-workflows/${taskId}/payloads`,
    body,
  );
  return unwrap(response);
};

export const updateScheduledPayload = async (
  taskId: number,
  payloadId: number,
  body: UpdateScheduledPayloadBody,
) => {
  const response = await axiosClient.patch<ApiResponse<ScheduledPayloadRow>>(
    `/agent/scheduled-workflows/${taskId}/payloads/${payloadId}`,
    body,
  );
  return unwrap(response);
};

export const deleteScheduledPayload = async (taskId: number, payloadId: number) => {
  const response = await axiosClient.delete<ApiResponse<unknown>>(
    `/agent/scheduled-workflows/${taskId}/payloads/${payloadId}`,
  );
  return unwrap(response);
};
