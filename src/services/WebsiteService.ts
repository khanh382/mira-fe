import axiosClient from "@/utils/axiosClient";
import type { ApiResponse } from "@/services/AuthService";

export type WebsiteAuthType = "api_key" | "bearer" | "basic";

export interface MyWebsite {
  id: number;
  domain: string;
  authType: WebsiteAuthType;
  headerName: string | null;
  username: string | null;
  note: string | null;
  createdByUid: number;
  createdAt: string;
  updatedAt: string;
  hasToken: boolean;
}

export interface CreateMyWebsitePayload {
  domain: string;
  authType: WebsiteAuthType;
  headerName?: string | null;
  token: string;
  username?: string | null;
  note?: string | null;
}

export interface UpdateMyWebsitePayload {
  domain?: string;
  authType?: WebsiteAuthType;
  headerName?: string | null;
  token?: string;
  username?: string | null;
  note?: string | null;
}

const BASE = "/http-tokens/my";

export const listMyWebsites = async () => {
  return axiosClient.get<ApiResponse<MyWebsite[]>>(BASE);
};

export const getMyWebsite = async (id: number) => {
  return axiosClient.get<ApiResponse<MyWebsite>>(`${BASE}/${id}`);
};

export const createMyWebsite = async (payload: CreateMyWebsitePayload) => {
  return axiosClient.post<ApiResponse<MyWebsite>>(BASE, payload);
};

export const updateMyWebsite = async (id: number, payload: UpdateMyWebsitePayload) => {
  return axiosClient.patch<ApiResponse<MyWebsite>>(`${BASE}/${id}`, payload);
};

export const deleteMyWebsite = async (id: number) => {
  return axiosClient.delete<ApiResponse<{ success: boolean }>>(`${BASE}/${id}`);
};
