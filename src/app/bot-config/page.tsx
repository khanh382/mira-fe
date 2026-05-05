"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lang";
import { getBotUsersView, setBotUsersConfig } from "@/services/BotUsersService";
import { notify } from "@/utils/notify";

export default function BotConfigPage() {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [initial, setInitial] = useState({
    telegram_bot_token: "",
    discord_bot_token: "",
    slack_bot_token: "",
    zalo_bot_token: "",
  });

  const [form, setForm] = useState({
    telegram_bot_token: "",
    discord_bot_token: "",
    slack_bot_token: "",
    zalo_bot_token: "",
  });

  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await getBotUsersView();
      const next = {
        telegram_bot_token: res.data?.telegramBotToken || "",
        discord_bot_token: res.data?.discordBotToken || "",
        slack_bot_token: res.data?.slackBotToken || "",
        zalo_bot_token: res.data?.zaloBotToken || "",
      };
      setInitial(next);
      setForm(next);
    } catch (e: any) {
      notify.error(e?.response?.data?.message || tr("botConfig.loadError", "Could not load bot config."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const changedPayload = useMemo(() => {
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(form)) {
      if (value !== (initial as any)[key] && value.trim()) {
        payload[key] = value.trim();
      }
    }
    return payload;
  }, [form, initial]);

  const hasChanges = Object.keys(changedPayload).length > 0;

  const onSave = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      const res = await setBotUsersConfig(changedPayload);
      const next = {
        telegram_bot_token: res.data?.telegramBotToken || "",
        discord_bot_token: res.data?.discordBotToken || "",
        slack_bot_token: res.data?.slackBotToken || "",
        zalo_bot_token: res.data?.zaloBotToken || "",
      };
      setInitial(next);
      setForm(next);
      notify.success(tr("botConfig.saved", "Bot configuration saved."));
    } catch (e: any) {
      notify.error(e?.response?.data?.message || tr("botConfig.saveError", "Could not save bot config."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-3 sm:space-y-4">
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <h1 className="text-2xl font-semibold text-[rgb(173,8,8)]">
          {tr("botConfig.title", "Bot Configuration")}
        </h1>
        <p className="text-sm text-zinc-600">
          {tr("botConfig.subtitle", "Manage tokens for Telegram, Discord, Slack and Zalo.")}
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-zinc-600">
          {tr("botConfig.loading", "Loading bot config...")}
        </div>
      ) : (
        <section className="rounded-xl border border-red-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <input className="rounded border border-red-300 px-3 py-2 text-sm" value={form.telegram_bot_token} onChange={(e) => setForm((prev) => ({ ...prev, telegram_bot_token: e.target.value }))} placeholder="telegram_bot_token" />
            <input className="rounded border border-red-300 px-3 py-2 text-sm" value={form.discord_bot_token} onChange={(e) => setForm((prev) => ({ ...prev, discord_bot_token: e.target.value }))} placeholder="discord_bot_token" />
            <input className="rounded border border-red-300 px-3 py-2 text-sm" value={form.slack_bot_token} onChange={(e) => setForm((prev) => ({ ...prev, slack_bot_token: e.target.value }))} placeholder="slack_bot_token" />
            <input className="rounded border border-red-300 px-3 py-2 text-sm" value={form.zalo_bot_token} onChange={(e) => setForm((prev) => ({ ...prev, zalo_bot_token: e.target.value }))} placeholder="zalo_bot_token" />
          </div>

          <div className="mt-3 flex gap-2">
            <button onClick={load} className="rounded-lg bg-red-100 px-4 py-2 text-sm text-red-700 hover:bg-red-200">
              {tr("botConfig.reload", "Reload")}
            </button>
            <button
              onClick={onSave}
              disabled={!hasChanges || saving}
              className="rounded-lg bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? tr("botConfig.saving", "Saving...") : tr("botConfig.save", "Save changes")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
