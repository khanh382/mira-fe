"use client";

import React, { useEffect, useState } from "react";
import { changePassword, getCurrentUser, updateProfile, updateProfileAdvanced } from "@/services/AuthService";
import { useLang } from "@/lang";

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

  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <h1 className="text-2xl font-semibold text-[rgb(173,8,8)]">
          {tr("account.profileTitle", "Profile")}
        </h1>
        <p className="text-sm text-zinc-600">
          {tr("account.profileSubtitle", "Manage account profile and social IDs.")}
        </p>
      </div>

      {message && <p className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-700">{message}</p>}
      {error && <p className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700">{error}</p>}

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

      {showAdvancedModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
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
