import axiosClient from "@/utils/axiosClient";
import type { ApiResponse } from "@/services/AuthService";

export interface BotUserConfig {
  id?: number;
  userId?: number;
  telegramBotToken?: string | null;
  discordBotToken?: string | null;
  slackBotToken?: string | null;
  zaloBotToken?: string | null;
  createdAt?: string;
  updateAt?: string;
}

export const getBotUsersView = async () => {
  const response = await axiosClient.get<ApiResponse<BotUserConfig | null>>("/bot-users/view");
  return response.data;
};

export const setBotUsersConfig = async (payload: {
  telegram_bot_token?: string;
  discord_bot_token?: string;
  slack_bot_token?: string;
  zalo_bot_token?: string;
}) => {
  const response = await axiosClient.post<ApiResponse<BotUserConfig>>("/bot-users/set", payload);
  return response.data;
};
