import axiosClient from "@/utils/axiosClient";

type LoginCredentialKey = "email" | "identifier" | "uname";

interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
}
export type { ApiResponse };

export interface LoginStep1Data {
  message: string;
  emailSent: boolean;
  retryAfterSec?: number;
  expiresAt?: string;
}

export interface AuthUser {
  uid: number;
  identifier: string;
  uname: string;
  email: string;
  level: string;
  status: string;
  activeEmail?: boolean;
  useGgauth?: boolean;
  telegramId?: string | null;
  discordId?: string | null;
  zaloId?: string | null;
  slackId?: string | null;
  createdAt?: string;
  updateAt?: string;
}

export const requestLoginCode = async (payload: {
  key: LoginCredentialKey;
  value: string;
  password: string;
}) => {
  const response = await axiosClient.post<ApiResponse<LoginStep1Data>>("/users/login", {
    [payload.key]: payload.value,
    password: payload.password,
  });
  return response.data;
};

export const verifyLoginCode = async (payload: {
  key: LoginCredentialKey;
  value: string;
  code: string;
}) => {
  const response = await axiosClient.post<ApiResponse<{ user: AuthUser }>>(
    "/users/verify-login",
    {
      [payload.key]: payload.value,
      code: payload.code,
    },
  );
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await axiosClient.get<ApiResponse<AuthUser>>("/users/me");
  return response.data;
};

export const forgotPassword = async (payload: {
  key: LoginCredentialKey;
  value: string;
}) => {
  const response = await axiosClient.post<ApiResponse<LoginStep1Data>>("/users/forgot-password", {
    [payload.key]: payload.value,
  });
  return response.data;
};

export const resetPassword = async (payload: {
  key: LoginCredentialKey;
  value: string;
  code: string;
  newPassword: string;
}) => {
  const response = await axiosClient.post<ApiResponse<{ message: string }>>(
    "/users/reset-password",
    {
      [payload.key]: payload.value,
      code: payload.code,
      newPassword: payload.newPassword,
    },
  );
  return response.data;
};

export const changePassword = async (payload: {
  current_password: string;
  new_password: string;
}) => {
  const response = await axiosClient.post<ApiResponse<{ message: string }>>(
    "/users/change-password",
    payload,
  );
  return response.data;
};

export const createUser = async (payload: {
  username: string;
  email: string;
  password: string;
  level: "colleague" | "client";
}) => {
  const response = await axiosClient.post<ApiResponse<any>>("/users/create", payload);
  return response.data;
};

export const updateUser = async (
  uid: number,
  payload: {
    level?: "colleague" | "client";
    status?: "active" | "block";
    password?: string;
  },
) => {
  const response = await axiosClient.post<ApiResponse<any>>(`/users/update/${uid}`, payload);
  return response.data;
};

export const logoutUser = async () => {
  const response = await axiosClient.post<ApiResponse<{ ok: boolean }>>("/users/logout");
  return response.data;
};

export const updateProfile = async (payload: {
  uid: number;
  telegram_id?: string;
  zalo_id?: string;
  discord_id?: string;
  slack_id?: string;
  facebook_id?: string;
}) => {
  const response = await axiosClient.post<ApiResponse<any>>("/users/update-profile", payload);
  return response.data;
};

export const updateProfileAdvanced = async (payload: {
  uname?: string;
  email?: string;
  code?: string;
}) => {
  const response = await axiosClient.post<ApiResponse<any>>("/users/update-profile-advanced", payload);
  return response.data;
};

export const refreshToken = async () => {
  const response = await axiosClient.post<ApiResponse<{ user: AuthUser }>>(
    "/users/refresh-token",
    {},
  );
  return response.data;
};