import axiosClient from "@/utils/axiosClient";
import type { ApiResponse } from "@/services/AuthService";

export type MemoryRagType = "text" | "json";
export type MemoryRagStatus = "active" | "inactive";

export interface MemoryRag {
  id: number;
  userId: number;
  name: string;
  code: string;
  type: MemoryRagType;
  value: string | null;
  status: MemoryRagStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMemoryGet {
  fileName: string;
  logicalPath: string;
  identifier: string;
  content: string;
  exists: boolean;
  updatedAt: string | null;
  maxBytes: number;
}

export interface WorkspaceMemoryPutResult {
  ok: boolean;
  logicalPath: string;
  updatedAt: string;
  sizeBytes: number;
}

export interface CreateMemoryRagPayload {
  name: string;
  code: string;
  type?: MemoryRagType;
  value?: string | null;
  status?: MemoryRagStatus;
}

export interface UpdateMemoryRagPayload {
  name?: string;
  code?: string;
  type?: MemoryRagType;
  value?: string | null;
  status?: MemoryRagStatus;
}

const RAGS = "/memories/rags";
const WORKSPACE = "/memories/workspace-memory";

export const listMemoryRags = async (status?: MemoryRagStatus) => {
  const params = status ? { status } : undefined;
  return axiosClient.get<ApiResponse<MemoryRag[]>>(RAGS, { params });
};

export const getMemoryRag = async (id: number) => {
  return axiosClient.get<ApiResponse<MemoryRag>>(`${RAGS}/${id}`);
};

export const createMemoryRag = async (payload: CreateMemoryRagPayload) => {
  return axiosClient.post<ApiResponse<MemoryRag>>(RAGS, payload);
};

export const updateMemoryRag = async (id: number, payload: UpdateMemoryRagPayload) => {
  return axiosClient.patch<ApiResponse<MemoryRag>>(`${RAGS}/${id}`, payload);
};

export const deleteMemoryRag = async (id: number) => {
  return axiosClient.delete<ApiResponse<{ success?: boolean }>>(`${RAGS}/${id}`);
};

export const getWorkspaceMemory = async () => {
  return axiosClient.get<ApiResponse<WorkspaceMemoryGet>>(WORKSPACE);
};

export const putWorkspaceMemory = async (content: string) => {
  return axiosClient.put<ApiResponse<WorkspaceMemoryPutResult>>(WORKSPACE, { content });
};
