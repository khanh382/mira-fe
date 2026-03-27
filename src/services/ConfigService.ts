import axiosClient from "@/utils/axiosClient";
import type { ApiResponse } from "@/services/AuthService";

export interface ProviderConfig {
  baseUrl?: string | null;
  apiKey?: string | null;
}

export interface AppConfig {
  id?: number;
  openaiApiKey?: string | null;
  geminiApiKey?: string | null;
  anthropicApiKey?: string | null;
  openrouterApiKey?: string | null;
  deepseekApiKey?: string | null;
  kimiApiKey?: string | null;
  zaiApiKey?: string | null;
  perplexityApiKey?: string | null;
  braveApiKey?: string | null;
  firecrawlApiKey?: string | null;
  ollama?: ProviderConfig | null;
  lmStudio?: ProviderConfig | null;
  schedulerMaxRetriesPerTick?: number | null;
  schedulerMaxConsecutiveFailedTicks?: number | null;
}

export const getConfigView = async () => {
  const response = await axiosClient.get<ApiResponse<AppConfig>>("/config/view");
  return response.data;
};

export const setConfig = async (payload: Partial<AppConfig>) => {
  const response = await axiosClient.post<ApiResponse<AppConfig>>("/config/set", payload);
  return response.data;
};
