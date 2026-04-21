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
  /** kie.ai — powers image_generate skill (gpt4o-image, seedream, nano-banana, …); stored as config.cof_kie_api_key server-side */
  kieApiKey?: string | null;
  zaiApiKey?: string | null;
  perplexityApiKey?: string | null;
  braveApiKey?: string | null;
  firecrawlApiKey?: string | null;
  ollama?: ProviderConfig | null;
  lmStudio?: ProviderConfig | null;
  schedulerMaxRetriesPerTick?: number | null;
  schedulerMaxConsecutiveFailedTicks?: number | null;
}

export type ChatgptOauthMode = "start" | "finish" | "status" | "cancel";

export interface ChatgptOauthResponseData {
  mode: ChatgptOauthMode;
  authUrl?: string;
  message?: string;
  ok?: boolean;
  connected?: boolean;
  usable?: boolean;
  expiresAt?: string | null;
  tokenType?: string | null;
  cancelled?: boolean;
}

export const getConfigView = async () => {
  const response = await axiosClient.get<ApiResponse<AppConfig>>("/config/view");
  return response.data;
};

export const setConfig = async (payload: Partial<AppConfig>) => {
  const response = await axiosClient.post<ApiResponse<AppConfig>>("/config/set", payload);
  return response.data;
};

export const connectChatgptOauth = async (
  payload: { mode?: ChatgptOauthMode; callbackUrlOrCode?: string } = {},
) => {
  const response = await axiosClient.post<ApiResponse<ChatgptOauthResponseData>>(
    "/config/connect/chatgpt-oauth",
    payload,
  );
  return response.data;
};
