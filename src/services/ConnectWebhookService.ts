import axiosClient from "@/utils/axiosClient";
import type { ApiResponse } from "@/services/AuthService";

/**
 * Admin APIs (`/connect-webhooks/admin/api-keys`): key CRUD + read-only usage stats.
 * Public LLM webhook/chat is called by third-party servers, not this frontend.
 */

const BASE = "/connect-webhooks/admin/api-keys";

export type CwStatus = "active" | "inactive";

export interface ConnectWebhookRow {
  cwId: number;
  cwDomain: string;
  cwUseSubdomains: boolean;
  cwExpired: string | null;
  cwStatus: CwStatus;
  createAt: string;
}

export interface CreateConnectWebhookResponse {
  row: ConnectWebhookRow;
  apiKey: string;
}

export interface PatchConnectWebhookPayload {
  cwUseSubdomains?: boolean;
  cwStatus?: CwStatus;
}

/** Admin usage stats (per cwId = per domain) — read-only, JWT owner. */
export interface UsageSummary {
  cwId: number;
  from: string;
  to: string;
  totalCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UsageEventsResponse {
  cwId: number;
  from: string;
  to: string;
  limit: number;
  offset: number;
  total: number;
  items: {
    id: number;
    createdAt: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
  }[];
}

function unwrapData<T>(res: { data?: unknown }): T | undefined {
  const body = res?.data as ApiResponse<T> | T | undefined;
  if (body && typeof body === "object" && "data" in body && (body as ApiResponse<T>).data !== undefined) {
    return (body as ApiResponse<T>).data as T;
  }
  return body as T | undefined;
}

/** GET — list keys (no secrets) */
export const listConnectWebhookKeys = async (): Promise<ConnectWebhookRow[]> => {
  const res = await axiosClient.get(BASE);
  const direct = res.data as unknown;
  if (Array.isArray(direct)) return direct as ConnectWebhookRow[];
  const raw = unwrapData<unknown>(res);
  if (Array.isArray(raw)) return raw as ConnectWebhookRow[];
  return [];
};

/** POST — create key for domain */
export const createConnectWebhookKey = async (cwDomain: string): Promise<CreateConnectWebhookResponse> => {
  const res = await axiosClient.post(BASE, { cwDomain });
  const raw = unwrapData<CreateConnectWebhookResponse>(res);
  if (!raw?.row || typeof raw.apiKey !== "string") {
    throw new Error("Invalid create response");
  }
  return raw;
};

/** POST — rotate key */
export const refreshConnectWebhookKey = async (cwId: number): Promise<CreateConnectWebhookResponse> => {
  const res = await axiosClient.post(`${BASE}/${cwId}/refresh`);
  const raw = unwrapData<CreateConnectWebhookResponse>(res);
  if (!raw?.row || typeof raw.apiKey !== "string") {
    throw new Error("Invalid refresh response");
  }
  return raw;
};

/** PATCH — update flags */
export const patchConnectWebhookKey = async (
  cwId: number,
  payload: PatchConnectWebhookPayload,
): Promise<ConnectWebhookRow> => {
  const res = await axiosClient.patch(`${BASE}/${cwId}`, payload);
  const raw = unwrapData<{ row: ConnectWebhookRow }>(res);
  const row = raw?.row ?? (raw as unknown as ConnectWebhookRow);
  if (!row?.cwId) throw new Error("Invalid patch response");
  return row;
};

/** DELETE — remove key */
export const deleteConnectWebhookKey = async (cwId: number): Promise<void> => {
  await axiosClient.delete(`${BASE}/${cwId}`);
};

/** GET — token totals & call count in date range (default: last 30 days on server) */
export const getConnectWebhookUsageSummary = async (
  cwId: number,
  params?: { from?: string; to?: string },
): Promise<UsageSummary> => {
  const res = await axiosClient.get(`${BASE}/${cwId}/usage/summary`, { params });
  const raw = unwrapData<UsageSummary>(res);
  if (raw == null || typeof raw.cwId !== "number") throw new Error("Invalid summary response");
  return raw;
};

/** GET — per-event token rows (paged) */
export const getConnectWebhookUsageEvents = async (
  cwId: number,
  params?: { from?: string; to?: string; limit?: number; offset?: number },
): Promise<UsageEventsResponse> => {
  const res = await axiosClient.get(`${BASE}/${cwId}/usage/events`, { params });
  const raw = unwrapData<UsageEventsResponse>(res);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) throw new Error("Invalid events response");
  return raw;
};
