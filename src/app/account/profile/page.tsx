"use client";

import React, { useEffect, useState } from "react";
import { changePassword, getCurrentUser, updateProfile, updateProfileAdvanced } from "@/services/AuthService";
import { finishGogConnect, finishGogReconnect, getGogStatus, resetGogConnect, saveGogCredentials, startGogConnect, startGogReconnect } from "@/services/GogService";
import { useLang } from "@/lang";
import { notify } from "@/utils/notify";

export default function ProfilePage() {
  const { t } = useLang();
  const [uid, setUid] = useState<number | null>(null);
  const [uname, setUname] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [discordId, setDiscordId] = useState("");
  const [zaloId, setZaloId] = useState("");
  const [slackId, setSlackId] = useState("");
  const [facebookId, setFacebookId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [gogEmail, setGogEmail] = useState("");
  const [gogCredentialsJson, setGogCredentialsJson] = useState("");
  const [gogAuthUrl, setGogAuthUrl] = useState("");
  const [gogAuthLink, setGogAuthLink] = useState("");
  const [gogTokenReason, setGogTokenReason] = useState("-");
  const [gogConnectedEmail, setGogConnectedEmail] = useState("-");
  const [gogHasCredentials, setGogHasCredentials] = useState(false);
  const [gogHasState, setGogHasState] = useState(false);
  const [gogHasConnectionRow, setGogHasConnectionRow] = useState(false);
  const [gogResetPassword, setGogResetPassword] = useState("");
  const [gogLoading, setGogLoading] = useState(false);
  const [gogBusy, setGogBusy] = useState(false);
  const [gogPopupBlocked, setGogPopupBlocked] = useState(false);
  const [showGogStartModal, setShowGogStartModal] = useState(false);
  const [showGogCredentialsModal, setShowGogCredentialsModal] = useState(false);
  const [showGogFinishModal, setShowGogFinishModal] = useState(false);
  const [showGogResetModal, setShowGogResetModal] = useState(false);

  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const translateGogApiMessage = (raw?: string) => {
    if (!raw) return "";
    const normalized = raw.trim();
    const map: Record<string, string> = {
      "Google Console OAuth credentials saved": tr(
        "account.gogApiCredentialsSaved",
        "Google Console OAuth credentials updated.",
      ),
      "Auth step1 created. Open returned URL, then call PATCH /gog/connect/finish with authUrl.": tr(
        "account.gogApiStep1Created",
        "Authorization URL created. Open it, then complete step 2 with callback URL.",
      ),
      "Auth step2 completed": tr("account.gogApiStep2Completed", "Authorization completed."),
      "Manual auth completed": tr("account.gogApiManualCompleted", "Manual authorization completed."),
      "Google connection row deleted for this user": tr(
        "account.gogApiConnectionDeleted",
        "Google connection data has been reset.",
      ),
      "Google connection values cleared for this user": tr(
        "account.gogApiConnectionDeleted",
        "Google connection data has been reset.",
      ),
      "Missing email. Provide email or configure one first.": tr(
        "account.gogApiMissingEmail",
        "Missing email. Please provide email or save it first.",
      ),
      "Connection already exists. Use reconnect API instead.": tr(
        "account.gogApiAlreadyConnected",
        "Connection already exists. Please use reconnect flow.",
      ),
      "No existing connection. Use connect API first.": tr(
        "account.gogApiNoConnection",
        "No existing connection. Please connect first.",
      ),
      "consoleCredentialsJson is required": tr(
        "account.gogApiCredentialsRequired",
        "consoleCredentialsJson is required.",
      ),
      "email is required and must be valid when no google connection value exists": tr(
        "account.gogApiEmailRequiredFirstConnect",
        "Email is required and must be valid for first-time credentials setup.",
      ),
      "authUrl is required": tr("account.gogApiAuthUrlRequired", "Callback URL is required."),
    };
    return map[normalized] || normalized;
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await getCurrentUser();
        setUid(res.data.uid);
        setUname(res.data.uname || "");
        setEmail(res.data.email || "");
        setTelegramId(res.data.telegramId || "");
        setDiscordId(res.data.discordId || "");
        setZaloId(res.data.zaloId || "");
        setSlackId(res.data.slackId || "");
      } catch (e: any) {
        setError(e?.response?.data?.message || "Could not load profile.");
      }
    })();
  }, []);

  const loadGogStatus = async () => {
    setGogLoading(true);
    try {
      const res = await getGogStatus();
      const nextEmail = res.connection?.googleEmail || "";
      setGogConnectedEmail(nextEmail || "-");
      setGogEmail((prev) => prev || nextEmail);
      setGogHasConnectionRow(Boolean(res.connection?.hasConnectionRow));
      setGogHasCredentials(Boolean(res.connection?.hasConsoleCredentialsJson));
      setGogHasState(Boolean(res.connection?.hasGogState));
      setGogTokenReason(res.tokenProbe?.reason || "not_checked");
      if (!res.connection?.hasGogState) {
        setGogAuthLink("");
        setGogPopupBlocked(false);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || tr("account.gogStatusError", "Could not load Google Workspace status."));
    } finally {
      setGogLoading(false);
    }
  };

  useEffect(() => {
    void loadGogStatus();
  }, []);

  useEffect(() => {
    if (!message) return;
    notify.success(message);
    setMessage("");
  }, [message]);

  useEffect(() => {
    if (!error) return;
    notify.error(error);
    setError("");
  }, [error]);

  const onUpdateSocial = async () => {
    if (!uid) return;
    setError("");
    setMessage("");
    try {
      const res = await updateProfile({
        uid,
        telegram_id: telegramId || undefined,
        discord_id: discordId || undefined,
        zalo_id: zaloId || undefined,
        slack_id: slackId || undefined,
        facebook_id: facebookId || undefined,
      });
      setMessage(res.data?.message || tr("account.saved", "Saved successfully."));
      setShowSocialModal(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || tr("account.saveError", "Could not save."));
    }
  };

  const onUpdateAdvanced = async () => {
    setError("");
    setMessage("");
    try {
      const res = await updateProfileAdvanced({
        uname: uname || undefined,
        email: email || undefined,
        code: code || undefined,
      });
      setMessage(res.data?.message || tr("account.saved", "Saved successfully."));
      setShowAdvancedModal(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || tr("account.saveError", "Could not save."));
    }
  };

  const onChangePassword = async () => {
    setError("");
    setMessage("");
    if (newPassword !== confirmNewPassword) {
      setError(tr("account.passwordMismatch", "New password confirmation does not match."));
      return;
    }
    try {
      const res = await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setMessage(res.data?.message || tr("account.saved", "Saved successfully."));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setShowPasswordModal(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || tr("account.saveError", "Could not save."));
    }
  };

  const onSaveGogCredentials = async () => {
    if (!gogCredentialsJson.trim()) {
      setError(tr("account.gogCredentialsRequired", "Please paste Google Console credentials JSON."));
      return;
    }
    setError("");
    setMessage("");
    setGogBusy(true);
    try {
      const res = await saveGogCredentials(gogCredentialsJson.trim(), gogEmail.trim() || undefined);
      if (res.ok === false) {
        throw new Error(translateGogApiMessage(res.message) || tr("account.gogActionFailed", "Google action failed."));
      }
      if (!gogHasConnectionRow) {
        setGogHasConnectionRow(true);
      }
      setMessage(translateGogApiMessage(res.message) || tr("account.saved", "Saved successfully."));
      await loadGogStatus();
      setShowGogCredentialsModal(false);
    } catch (e: any) {
      setError(
        translateGogApiMessage(e?.response?.data?.message || e?.message)
        || tr("account.gogSaveCredentialsError", "Could not update Google credentials."),
      );
    } finally {
      setGogBusy(false);
    }
  };

  const onStartGogFlow = async (forceReauth = false) => {
    setError("");
    setMessage("");
    setGogBusy(true);
    try {
      if (!gogHasConnectionRow) {
        const trimmedCredentials = gogCredentialsJson.trim();
        if (!gogHasCredentials && !trimmedCredentials) {
          throw new Error(
            tr(
              "account.gogCredentialsRequiredOnFirstConnect",
              "Please paste Google Console credentials JSON before first connect.",
            ),
          );
        }
        if (trimmedCredentials) {
          const credentialsRes = await saveGogCredentials(
            trimmedCredentials,
            gogEmail.trim() || undefined,
          );
          if (credentialsRes.ok === false) {
            throw new Error(
              translateGogApiMessage(credentialsRes.message)
                || tr("account.gogSaveCredentialsError", "Could not update Google credentials."),
            );
          }
        }
      }

      let res;
      if (gogHasConnectionRow) {
        try {
          res = await startGogReconnect({
            email: gogEmail.trim() || undefined,
            forceReauth,
          });
        } catch (e: any) {
          const rawError = e?.response?.data?.message || e?.message || "";
          if (String(rawError).includes("No existing connection. Use connect API first.")) {
            setGogHasConnectionRow(false);
            res = await startGogConnect({
              email: gogEmail.trim() || undefined,
            });
          } else {
            throw e;
          }
        }
      } else {
        try {
          res = await startGogConnect({
            email: gogEmail.trim() || undefined,
          });
        } catch (e: any) {
          const rawError = e?.response?.data?.message || e?.message || "";
          if (String(rawError).includes("Connection already exists. Use reconnect API instead.")) {
            setGogHasConnectionRow(true);
            res = await startGogReconnect({
              email: gogEmail.trim() || undefined,
              forceReauth,
            });
          } else {
            throw e;
          }
        }
      }
      if (res.ok === false) {
        throw new Error(translateGogApiMessage(res.message) || tr("account.gogActionFailed", "Google action failed."));
      }
      const data = (res.result?.data ?? {}) as Record<string, unknown>;
      const authUrl =
        (typeof res.authUrl === "string" && res.authUrl) ||
        (typeof data.authUrl === "string" && data.authUrl) ||
        (typeof data.url === "string" && data.url) ||
        "";
      setGogAuthLink(authUrl);
      if (authUrl) {
        const popup = window.open(authUrl, "_blank", "noopener,noreferrer");
        setGogPopupBlocked(!popup);
      } else {
        setGogPopupBlocked(false);
      }
      setMessage(
        translateGogApiMessage(res.message)
          || tr("account.gogStartSuccess", "Authorization URL created and opened in a new tab. Paste callback URL below."),
      );
      await loadGogStatus();
      setShowGogStartModal(false);
    } catch (e: any) {
      setError(
        translateGogApiMessage(e?.response?.data?.message || e?.message)
          || tr("account.gogStartError", "Could not start Google connection."),
      );
    } finally {
      setGogBusy(false);
    }
  };

  const onCopyGogAuthLink = async () => {
    if (!gogAuthLink) return;
    try {
      await navigator.clipboard.writeText(gogAuthLink);
      setMessage(tr("account.gogLinkCopied", "Auth URL copied."));
      setError("");
    } catch {
      setError(tr("account.gogLinkCopyError", "Could not copy auth URL."));
    }
  };

  const onFinishGogFlow = async () => {
    if (!gogAuthUrl.trim()) {
      setError(tr("account.gogAuthUrlRequired", "Please paste callback URL."));
      return;
    }
    setError("");
    setMessage("");
    setGogBusy(true);
    try {
      const res = gogHasConnectionRow
        ? await finishGogReconnect({
            authUrl: gogAuthUrl.trim(),
            email: gogEmail.trim() || undefined,
          })
        : await finishGogConnect({
            authUrl: gogAuthUrl.trim(),
            email: gogEmail.trim() || undefined,
          });
      if (res.ok === false) {
        throw new Error(translateGogApiMessage(res.message) || tr("account.gogActionFailed", "Google action failed."));
      }
      setMessage(
        translateGogApiMessage(res.message)
          || tr("account.gogFinishSuccess", "Google Workspace connected successfully."),
      );
      setGogAuthUrl("");
      setGogAuthLink("");
      setGogPopupBlocked(false);
      await loadGogStatus();
      setShowGogFinishModal(false);
    } catch (e: any) {
      setError(
        translateGogApiMessage(e?.response?.data?.message || e?.message)
          || tr("account.gogFinishError", "Could not finish Google connection."),
      );
    } finally {
      setGogBusy(false);
    }
  };

  const onResetGogConnect = async () => {
    if (!gogResetPassword.trim()) {
      setError(tr("account.gogPasswordRequired", "Please enter your current password to reset Google connection."));
      return;
    }
    setError("");
    setMessage("");
    setGogBusy(true);
    try {
      const res = await resetGogConnect({ password: gogResetPassword.trim() });
      if (res.ok === false) {
        throw new Error(translateGogApiMessage(res.message) || tr("account.gogActionFailed", "Google action failed."));
      }
      setMessage(translateGogApiMessage(res.message) || tr("account.gogResetSuccess", "Google auth state reset."));
      setGogAuthLink("");
      setGogAuthUrl("");
      setGogPopupBlocked(false);
      setGogResetPassword("");
      await loadGogStatus();
      setShowGogResetModal(false);
    } catch (e: any) {
      setError(
        translateGogApiMessage(e?.response?.data?.message || e?.message)
          || tr("account.gogResetError", "Could not reset Google auth state."),
      );
    } finally {
      setGogBusy(false);
    }
  };

  const gogTokenReasonLabel = (() => {
    switch (gogTokenReason) {
      case "usable":
        return tr("account.gogTokenUsable", "Usable");
      case "expired_or_revoked":
        return tr("account.gogTokenExpired", "Expired or revoked");
      case "usable_but_auth_list_empty":
        return tr("account.gogTokenUsableButEmpty", "Usable (auth list empty)");
      case "probe_failed":
        return tr("account.gogTokenProbeFailed", "Probe failed");
      case "no_saved_auth":
        return tr("account.gogTokenNoSavedAuth", "No saved auth");
      case "not_checked":
        return tr("account.gogTokenNotChecked", "Not checked");
      default:
        return gogTokenReason || "-";
    }
  })();
  const gogFinishLabel = gogHasConnectionRow
    ? tr("account.gogFinishReconnect", "Finish re-auth")
    : tr("account.gogFinishConnect", "Finish connect");

  return (
    <div className="w-full min-w-0 space-y-3 sm:space-y-4">
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <h1 className="text-2xl font-semibold text-[rgb(173,8,8)]">
          {tr("account.profileTitle", "Profile")}
        </h1>
        <p className="text-sm text-zinc-600">
          {tr("account.profileSubtitle", "Manage account profile and social IDs.")}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-red-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-[rgb(173,8,8)]">
            {tr("account.advancedProfile", "Advanced profile (2-step verification)")}
          </h2>
          <div className="space-y-2 text-sm text-zinc-700">
            <p><span className="font-medium">{tr("account.username", "Username")}:</span> {uname || "-"}</p>
            <p><span className="font-medium">{tr("account.email", "Email")}:</span> {email || "-"}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAdvancedModal(true)}
              className="rounded-lg bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
            >
              {tr("account.updateAdvanced", "Update profile")}
            </button>
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              {tr("account.updatePassword", "Update password")}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-red-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-[rgb(173,8,8)]">
            {tr("account.socialTitle", "Social profile")}
          </h2>
          <div className="space-y-2 text-sm text-zinc-700">
            <p><span className="font-medium">Telegram:</span> {telegramId || "-"}</p>
            <p><span className="font-medium">Discord:</span> {discordId || "-"}</p>
            <p><span className="font-medium">Zalo:</span> {zaloId || "-"}</p>
            <p><span className="font-medium">Slack:</span> {slackId || "-"}</p>
            <p><span className="font-medium">Facebook:</span> {facebookId || "-"}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowSocialModal(true)}
            className="mt-3 rounded-lg bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
          >
            {tr("account.updateSocial", "Update social profile")}
          </button>
        </section>
      </div>

      <section className="rounded-xl border border-red-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-[rgb(173,8,8)]">
          {tr("account.gogTitle", "Google Workspace")}
        </h2>
        <p className="mb-3 text-sm text-zinc-600">
          {tr("account.gogSubtitle", "Configure credentials and connect Google Workspace for this account.")}
        </p>
        <div className="grid gap-2 text-sm text-zinc-700 md:grid-cols-2">
          <p><span className="font-medium">{tr("account.gogConnectedEmail", "Connected email")}:</span> {gogConnectedEmail}</p>
          <p><span className="font-medium">{tr("account.gogTokenState", "Token state")}:</span> {gogTokenReasonLabel}</p>
          <p><span className="font-medium">{tr("account.gogCredentialsState", "Credentials saved")}:</span> {gogHasCredentials ? tr("account.yes", "Yes") : tr("account.no", "No")}</p>
          <p><span className="font-medium">{tr("account.gogAuthState", "Auth state")}:</span> {gogHasState ? tr("account.gogAuthReady", "Ready") : tr("account.gogAuthEmpty", "Empty")}</p>
        </div>

        <div className="mt-3 grid gap-3">
          {gogAuthLink && (
            <div className="space-y-2">
              <a
                href={gogAuthLink}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-sm text-blue-700 underline"
                title={gogAuthLink}
              >
                {gogAuthLink}
              </a>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => window.open(gogAuthLink, "_blank", "noopener,noreferrer")}
                  className="rounded border border-red-300 bg-white px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  {tr("account.gogOpenAuthLink", "Open auth URL")}
                </button>
                <button
                  type="button"
                  onClick={() => void onCopyGogAuthLink()}
                  className="rounded border border-red-300 bg-white px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  {tr("account.gogCopyAuthLink", "Copy URL")}
                </button>
              </div>
              {gogPopupBlocked && (
                <p className="text-xs text-amber-700">
                  {tr("account.gogPopupBlocked", "Popup may be blocked. Please click \"Open auth URL\".")}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {gogLoading ? (
            <button
              type="button"
              className="rounded border border-red-300 bg-white px-4 py-2 text-sm text-red-700"
              disabled
            >
              {tr("account.gogLoading", "Loading...")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void loadGogStatus()}
                className="rounded border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                disabled={gogBusy}
              >
                {tr("account.gogRefreshStatus", "Refresh status")}
              </button>
              {gogHasConnectionRow && (
                <button
                  type="button"
                  onClick={() => setShowGogCredentialsModal(true)}
                  className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
                  disabled={gogBusy}
                >
                  {tr("account.gogSaveCredentials", "Save credentials")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowGogStartModal(true)}
                className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
                disabled={gogBusy}
              >
                {gogHasConnectionRow
                  ? (gogTokenReason === "expired_or_revoked"
                      ? tr("account.gogReconnectForceLabel", "Reconnect (force re-auth)")
                      : tr("account.gogReconnect", "Reconnect"))
                  : tr("account.gogConnect", "Connect")}
              </button>
              <button
                type="button"
                onClick={() => setShowGogFinishModal(true)}
                className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
                disabled={gogBusy || !gogAuthLink}
              >
                {gogFinishLabel}
              </button>
              {gogHasConnectionRow && (
                <button
                  type="button"
                  onClick={() => setShowGogResetModal(true)}
                  className="rounded border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                  disabled={gogBusy}
                >
                  {tr("account.gogReset", "Reset auth")}
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {showGogCredentialsModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-2 sm:p-4">
          <div className="w-full max-w-xl rounded-xl border border-red-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
                {tr("account.gogSaveCredentials", "Save credentials")}
              </h3>
              <button
                type="button"
                onClick={() => setShowGogCredentialsModal(false)}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
                aria-label={tr("account.close", "Close")}
                title={tr("account.close", "Close")}
              >
                x
              </button>
            </div>
            <textarea
              className="min-h-40 w-full rounded border border-red-300 px-3 py-2 text-sm"
              value={gogCredentialsJson}
              onChange={(e) => setGogCredentialsJson(e.target.value)}
              placeholder={tr("account.gogCredentialsPlaceholder", "Paste consoleCredentialsJson here")}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGogCredentialsModal(false)}
                className="rounded border border-red-300 px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
              >
                {tr("login.back", "Back")}
              </button>
              <button
                type="button"
                onClick={() => void onSaveGogCredentials()}
                className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
                disabled={gogBusy}
              >
                {tr("account.gogSaveCredentials", "Save credentials")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGogStartModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-2 sm:p-4">
          <div className="w-full max-w-xl rounded-xl border border-red-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
                {gogHasConnectionRow
                  ? (gogTokenReason === "expired_or_revoked"
                      ? tr("account.gogReconnectForceLabel", "Reconnect (force re-auth)")
                      : tr("account.gogReconnect", "Reconnect"))
                  : tr("account.gogConnect", "Connect")}
              </h3>
              <button
                type="button"
                onClick={() => setShowGogStartModal(false)}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
                aria-label={tr("account.close", "Close")}
                title={tr("account.close", "Close")}
              >
                x
              </button>
            </div>
            <input
              className="w-full rounded border border-red-300 px-3 py-2 text-sm"
              value={gogEmail}
              onChange={(e) => setGogEmail(e.target.value)}
              placeholder={tr("account.email", "Email")}
            />
            {!gogHasConnectionRow && (
              <textarea
                className="mt-3 min-h-32 w-full rounded border border-red-300 px-3 py-2 text-sm"
                value={gogCredentialsJson}
                onChange={(e) => setGogCredentialsJson(e.target.value)}
                placeholder={tr("account.gogCredentialsPlaceholder", "Paste consoleCredentialsJson here")}
              />
            )}
            <p className="mt-2 text-xs text-zinc-600">
              {!gogHasConnectionRow
                ? tr(
                    "account.gogStartFirstConnectHint",
                    "For first connect, you can paste credentials here. The system will update credentials, then start connect.",
                  )
                : tr("account.gogStartHint", "Email is optional if it is already saved on the server.")}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGogStartModal(false)}
                className="rounded border border-red-300 px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
              >
                {tr("login.back", "Back")}
              </button>
              <button
                type="button"
                onClick={() => void onStartGogFlow(gogTokenReason === "expired_or_revoked")}
                className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
                disabled={gogBusy}
              >
                {tr("account.gogConnect", "Connect")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGogFinishModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-2 sm:p-4">
          <div className="w-full max-w-xl rounded-xl border border-red-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
                {gogFinishLabel}
              </h3>
              <button
                type="button"
                onClick={() => setShowGogFinishModal(false)}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
                aria-label={tr("account.close", "Close")}
                title={tr("account.close", "Close")}
              >
                x
              </button>
            </div>
            <div className="grid gap-3">
              <input
                className="w-full rounded border border-red-300 px-3 py-2 text-sm"
                value={gogEmail}
                onChange={(e) => setGogEmail(e.target.value)}
                placeholder={tr("account.gogEmailOptional", "Email (optional)")}
              />
              <input
                className="w-full rounded border border-red-300 px-3 py-2 text-sm"
                value={gogAuthUrl}
                onChange={(e) => setGogAuthUrl(e.target.value)}
                placeholder={tr("account.gogCallbackPlaceholder", "Paste callback URL and click Finish")}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGogFinishModal(false)}
                className="rounded border border-red-300 px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
              >
                {tr("login.back", "Back")}
              </button>
              <button
                type="button"
                onClick={() => void onFinishGogFlow()}
                className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
                disabled={gogBusy || !gogAuthUrl.trim()}
              >
                {gogFinishLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGogResetModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-2 sm:p-4">
          <div className="w-full max-w-xl rounded-xl border border-red-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
                {tr("account.gogReset", "Reset auth")}
              </h3>
              <button
                type="button"
                onClick={() => setShowGogResetModal(false)}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
                aria-label={tr("account.close", "Close")}
                title={tr("account.close", "Close")}
              >
                x
              </button>
            </div>
            <input
              type="password"
              className="w-full rounded border border-red-300 px-3 py-2 text-sm"
              value={gogResetPassword}
              onChange={(e) => setGogResetPassword(e.target.value)}
              placeholder={tr("account.gogResetPasswordPlaceholder", "Enter current password for reset auth")}
            />
            <p className="mt-2 text-xs text-zinc-600">
              {tr("account.gogResetHint", "For security, reset requires your current account password.")}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGogResetModal(false)}
                className="rounded border border-red-300 px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
              >
                {tr("login.back", "Back")}
              </button>
              <button
                type="button"
                onClick={() => void onResetGogConnect()}
                className="rounded border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                disabled={gogBusy}
              >
                {tr("account.gogReset", "Reset auth")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdvancedModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-2 sm:p-4">
          <div className="w-full max-w-xl rounded-xl border border-red-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
                {tr("account.advancedProfile", "Advanced profile (2-step verification)")}
              </h3>
              <button
                type="button"
                onClick={() => setShowAdvancedModal(false)}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
                aria-label={tr("account.close", "Close")}
                title={tr("account.close", "Close")}
              >
                x
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded border border-red-300 px-3 py-2 text-sm"
                value={uname}
                onChange={(e) => setUname(e.target.value)}
                placeholder={tr("account.username", "Username")}
              />
              <input
                className="rounded border border-red-300 px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tr("account.email", "Email")}
              />
              <input
                className="rounded border border-red-300 px-3 py-2 text-sm md:col-span-2"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={tr("account.codeOptional", "verification code (optional for step 1)")}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAdvancedModal(false)}
                className="rounded border border-red-300 px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
              >
                {tr("login.back", "Back")}
              </button>
              <button
                type="button"
                onClick={() => void onUpdateAdvanced()}
                className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
              >
                {tr("account.updateAdvanced", "Update profile")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSocialModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-2 sm:p-4">
          <div className="w-full max-w-xl rounded-xl border border-red-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
                {tr("account.socialTitle", "Social profile")}
              </h3>
              <button
                type="button"
                onClick={() => setShowSocialModal(false)}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
                aria-label={tr("account.close", "Close")}
                title={tr("account.close", "Close")}
              >
                x
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input className="rounded border border-red-300 px-3 py-2 text-sm" value={telegramId} onChange={(e) => setTelegramId(e.target.value)} placeholder="telegram_id" />
              <input className="rounded border border-red-300 px-3 py-2 text-sm" value={discordId} onChange={(e) => setDiscordId(e.target.value)} placeholder="discord_id" />
              <input className="rounded border border-red-300 px-3 py-2 text-sm" value={zaloId} onChange={(e) => setZaloId(e.target.value)} placeholder="zalo_id" />
              <input className="rounded border border-red-300 px-3 py-2 text-sm" value={slackId} onChange={(e) => setSlackId(e.target.value)} placeholder="slack_id" />
              <input className="rounded border border-red-300 px-3 py-2 text-sm md:col-span-2" value={facebookId} onChange={(e) => setFacebookId(e.target.value)} placeholder="facebook_id" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSocialModal(false)}
                className="rounded border border-red-300 px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
              >
                {tr("login.back", "Back")}
              </button>
              <button
                type="button"
                onClick={() => void onUpdateSocial()}
                className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
              >
                {tr("account.updateSocial", "Update social profile")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-2 sm:p-4">
          <div className="w-full max-w-xl rounded-xl border border-red-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
                {tr("account.updatePassword", "Update password")}
              </h3>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
                aria-label={tr("account.close", "Close")}
                title={tr("account.close", "Close")}
              >
                x
              </button>
            </div>
            <div className="grid gap-3">
              <input
                type="password"
                className="rounded border border-red-300 px-3 py-2 text-sm"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={tr("account.currentPassword", "Current password")}
              />
              <input
                type="password"
                className="rounded border border-red-300 px-3 py-2 text-sm"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={tr("account.newPassword", "New password")}
              />
              <input
                type="password"
                className="rounded border border-red-300 px-3 py-2 text-sm"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder={tr("account.confirmNewPassword", "Confirm new password")}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="rounded border border-red-300 px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
              >
                {tr("login.back", "Back")}
              </button>
              <button
                type="button"
                onClick={() => void onChangePassword()}
                className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
              >
                {tr("account.updatePassword", "Update password")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
