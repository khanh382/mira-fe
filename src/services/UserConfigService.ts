import axiosClient from "@/utils/axiosClient";
import type { ApiResponse } from "@/services/AuthService";
import type {
  ChatgptOauthMode,
  ChatgptOauthResponseData,
  ProviderConfig,
} from "@/services/ConfigService";

export interface OpenaiOAuthConfig {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  tokenType?: string | null;
}

/** User-scoped config (GET view / POST set) — camelCase per API. */
export interface UserConfig {
  id?: number;
  userId?: number;
  openaiApiKey?: string | null;
  geminiApiKey?: string | null;
  anthropicApiKey?: string | null;
  openrouterApiKey?: string | null;
  deepseekApiKey?: string | null;
  kimiApiKey?: string | null;
  perplexityApiKey?: string | null;
  braveApiKey?: string | null;
  firecrawlApiKey?: string | null;
  kieApiKey?: string | null;
  openaiOAuth?: OpenaiOAuthConfig | null;
  ollama?: ProviderConfig | null;
  lmStudio?: ProviderConfig | null;
}

export type UserConfigSetPayload = Partial<{
  openaiApiKey: string | null;
  geminiApiKey: string | null;
  anthropicApiKey: string | null;
  openrouterApiKey: string | null;
  deepseekApiKey: string | null;
  kimiApiKey: string | null;
  perplexityApiKey: string | null;
  braveApiKey: string | null;
  firecrawlApiKey: string | null;
  kieApiKey: string | null;
  openaiOAuth: OpenaiOAuthConfig | null;
  ollama: ProviderConfig | null;
  lmStudio: ProviderConfig | null;
}>;

export const getUserConfigView = async () => {
  const response = await axiosClient.get<ApiResponse<UserConfig | null>>("/user-config/view");
  return response.data;
};

export const setUserConfig = async (payload: UserConfigSetPayload) => {
  const response = await axiosClient.post<ApiResponse<UserConfig | null>>("/user-config/set", payload);
  return response.data;
};

/** Same body/response shape as `POST /config/connect/chatgpt-oauth`, but tokens persist to `user_config`. */
export const connectUserConfigChatgptOauth = async (
  payload: { mode?: ChatgptOauthMode; callbackUrlOrCode?: string } = {},
) => {
  const response = await axiosClient.post<ApiResponse<ChatgptOauthResponseData>>(
    "/user-config/connect/chatgpt-oauth",
    payload,
  );
  return response.data;
};
