import axiosClient from "@/utils/axiosClient";
import type { ApiResponse } from "@/services/AuthService";

export type GatewayMessageAttachment = {
  kind: "image" | "video" | "audio";
  /** Display URL (object URL or https). */
  url: string;
};

export interface GatewayMessageItem {
  id: string;
  role: string;
  content: string;
  tokensUsed?: number;
  createdAt?: string;
  /** Optional client-side / future API: media shown in bubbles. */
  attachments?: GatewayMessageAttachment[];
}

export interface GatewayHistoryData {
  threadId: string;
  messages: GatewayMessageItem[];
}

export interface GatewaySendMessageData {
  response: string;
  threadId: string;
  tokensUsed: number;
  runId?: string;
}

export const sendGatewayMessage = async (payload: {
  content: string;
  threadId?: string;
  model?: string;
  /** Public URL or data URL if backend accepts it (multimodal). */
  mediaUrl?: string;
  mediaPath?: string;
  /** Additional media (REST parity with WebSocket payload in agent docs). */
  mediaPaths?: string[];
}) => {
  const body: Record<string, unknown> = {
    content: payload.content,
    channelId: "webchat",
    threadId: payload.threadId,
    model: payload.model,
  };
  if (payload.mediaUrl) body.mediaUrl = payload.mediaUrl;
  if (payload.mediaPath) body.mediaPath = payload.mediaPath;
  if (payload.mediaPaths?.length) body.mediaPaths = payload.mediaPaths;

  const response = await axiosClient.post<ApiResponse<GatewaySendMessageData>>("/gateway/message", body);
  return response.data;
};

export const resetGatewayThread = async (reason?: string) => {
  const response = await axiosClient.post<ApiResponse<{ threadId: string; message: string }>>(
    "/gateway/reset",
    { reason },
  );
  return response.data;
};

export const getGatewayHistory = async (limit = 50) => {
  const response = await axiosClient.get<ApiResponse<GatewayHistoryData>>(
    `/gateway/history?limit=${limit}`,
  );
  return response.data;
};

export interface GatewayThreadListItem {
  threadId: string;
  title?: string | null;
  isActive?: boolean;
  activeOpenclawAgentId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export const getGatewayThreads = async () => {
  const response = await axiosClient.get<ApiResponse<{ items: GatewayThreadListItem[] }>>("/gateway/threads");
  return response.data;
};

export interface GatewaySwitchThreadData {
  threadId: string;
  isActive: boolean;
  activeOpenclawAgentId: string | null;
  message: string;
}

export const switchGatewayThread = async (threadId: string) => {
  const response = await axiosClient.post<ApiResponse<GatewaySwitchThreadData>>("/gateway/threads/switch", {
    threadId,
  });
  return response.data;
};

/** Soft-delete the active web thread (`status=life` + is_active). */
export const deleteCurrentGatewayThread = async () => {
  const response = await axiosClient.post<ApiResponse<{ threadId: string; message: string }>>(
    "/gateway/threads/delete-current",
    {},
  );
  return response.data;
};

/** Soft-delete all life web threads for the current user. */
export const deleteAllGatewayThreads = async () => {
  const response = await axiosClient.post<ApiResponse<{ deletedCount: number; message: string }>>(
    "/gateway/threads/delete-all",
    {},
  );
  return response.data;
};

export const getGatewaySkills = async () => {
  const response = await axiosClient.get<ApiResponse<any>>("/gateway/skills");
  return response.data;
};

export const getGatewayStatus = async () => {
  const response = await axiosClient.get<ApiResponse<any>>("/gateway/status");
  return response.data;
};
