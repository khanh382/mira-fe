import axiosClient from "@/utils/axiosClient";
import type { ApiResponse } from "@/services/AuthService";

const BASE = "/gog";

export type GogTokenProbeReason =
  | "usable"
  | "usable_but_auth_list_empty"
  | "expired_or_revoked"
  | "probe_failed"
  | "no_saved_auth"
  | "not_checked";

export interface GogStatusResponse {
  gogAvailable?: boolean;
  connection?: {
    hasConnectionRow?: boolean;
    googleEmail?: string | null;
    hasConsoleCredentialsJson?: boolean;
    hasGogState?: boolean;
  };
  tokenProbe?: {
    ok?: boolean;
    reason?: GogTokenProbeReason | string;
  };
  authList?: unknown;
}

export interface GogActionResponse {
  ok?: boolean;
  message?: string;
  email?: string;
  authUrl?: string;
  error?: string;
  result?: Record<string, unknown>;
  hasConsoleCredentialsJson?: boolean;
}

function unwrapData<T>(res: { data?: unknown }): T | undefined {
  const body = res?.data as ApiResponse<T> | T | undefined;
  if (body && typeof body === "object" && "data" in body && (body as ApiResponse<T>).data !== undefined) {
    return (body as ApiResponse<T>).data as T;
  }
  return body as T | undefined;
}

export const getGogStatus = async (): Promise<GogStatusResponse> => {
  const res = await axiosClient.get(`${BASE}/status`);
  return unwrapData<GogStatusResponse>(res) ?? {};
};

export const saveGogCredentials = async (
  consoleCredentialsJson: string,
  email?: string,
): Promise<GogActionResponse> => {
  const res = await axiosClient.post(`${BASE}/credentials`, {
    consoleCredentialsJson,
    email,
  });
  return unwrapData<GogActionResponse>(res) ?? {};
};

export const startGogConnect = async (payload?: {
  email?: string;
}): Promise<GogActionResponse> => {
  const res = await axiosClient.post(`${BASE}/connect/start`, payload ?? {});
  return unwrapData<GogActionResponse>(res) ?? {};
};

export const finishGogConnect = async (payload: {
  authUrl: string;
  email?: string;
}): Promise<GogActionResponse> => {
  const res = await axiosClient.patch(`${BASE}/connect/finish`, payload);
  return unwrapData<GogActionResponse>(res) ?? {};
};

export const startGogReconnect = async (payload?: {
  email?: string;
  forceReauth?: boolean;
}): Promise<GogActionResponse> => {
  const res = await axiosClient.post(`${BASE}/reconnect/start`, payload ?? {});
  return unwrapData<GogActionResponse>(res) ?? {};
};

export const finishGogReconnect = async (payload: {
  authUrl: string;
  email?: string;
}): Promise<GogActionResponse> => {
  const res = await axiosClient.patch(`${BASE}/reconnect/finish`, payload);
  return unwrapData<GogActionResponse>(res) ?? {};
};

export const resetGogConnect = async (payload: {
  password: string;
}): Promise<GogActionResponse> => {
  const res = await axiosClient.delete(`${BASE}/connect`, { data: payload });
  return unwrapData<GogActionResponse>(res) ?? {};
};
