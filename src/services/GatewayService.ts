import axiosClient from "@/utils/axiosClient";
import type { ApiResponse } from "@/services/AuthService";

export interface GatewayMessageItem {
  id: string;
  role: string;
  content: string;
  tokensUsed?: number;
  createdAt?: string;
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
}) => {
  const response = await axiosClient.post<ApiResponse<GatewaySendMessageData>>("/gateway/message", {
    content: payload.content,
    channelId: "webchat",
    threadId: payload.threadId,
    model: payload.model,
  });
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

export const getGatewaySkills = async () => {
  const response = await axiosClient.get<ApiResponse<any>>("/gateway/skills");
  return response.data;
};

export const getGatewayStatus = async () => {
  const response = await axiosClient.get<ApiResponse<any>>("/gateway/status");
  return response.data;
};
