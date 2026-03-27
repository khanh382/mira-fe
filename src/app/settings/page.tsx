"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lang";
import { AppConfig, getConfigView, setConfig } from "@/services/ConfigService";

type ApiKeyField =
  | "openaiApiKey"
  | "geminiApiKey"
  | "anthropicApiKey"
  | "openrouterApiKey"
  | "deepseekApiKey"
  | "kimiApiKey"
  | "zaiApiKey"
  | "perplexityApiKey"
  | "braveApiKey"
  | "firecrawlApiKey";

const apiKeyFields: ApiKeyField[] = [
  "openaiApiKey",
  "geminiApiKey",
  "anthropicApiKey",
  "openrouterApiKey",
  "deepseekApiKey",
  "kimiApiKey",
  "zaiApiKey",
  "perplexityApiKey",
  "braveApiKey",
  "firecrawlApiKey",
];

const isMaskedValue = (value: unknown) =>
  typeof value === "string" && value.includes("*");

const emptyConfig: AppConfig = {
  openaiApiKey: "",
  geminiApiKey: "",
  anthropicApiKey: "",
  openrouterApiKey: "",
  deepseekApiKey: "",
  kimiApiKey: "",
  zaiApiKey: "",
  perplexityApiKey: "",
  braveApiKey: "",
  firecrawlApiKey: "",
  ollama: { baseUrl: "", apiKey: "" },
  lmStudio: { baseUrl: "", apiKey: "" },
  schedulerMaxRetriesPerTick: 3,
  schedulerMaxConsecutiveFailedTicks: 3,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-red-200 bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold text-[rgb(173,8,8)]">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [initialConfig, setInitialConfig] = useState<AppConfig>(emptyConfig);
  const [form, setForm] = useState<AppConfig>(emptyConfig);

  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  const loadConfig = async () => {
    setLoading(true);
    setError("");
    try {
      const res: { data: AppConfig } = await getConfigView();
      const next = { ...emptyConfig, ...res.data };
      setInitialConfig(next);
      setForm(next);
    } catch (e: any) {
      setError(e?.response?.data?.message || tr("settings.loadError", "Could not load config."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const changedPayload = useMemo(() => {
    const payload: Partial<AppConfig> = {};
    for (const key of apiKeyFields) {
      if (form[key] !== initialConfig[key]) {
        payload[key] = form[key];
      }
    }
    if (
      form.schedulerMaxRetriesPerTick !== initialConfig.schedulerMaxRetriesPerTick
    ) {
      payload.schedulerMaxRetriesPerTick = form.schedulerMaxRetriesPerTick;
    }
    if (
      form.schedulerMaxConsecutiveFailedTicks !==
      initialConfig.schedulerMaxConsecutiveFailedTicks
    ) {
      payload.schedulerMaxConsecutiveFailedTicks = form.schedulerMaxConsecutiveFailedTicks;
    }
    if (JSON.stringify(form.ollama) !== JSON.stringify(initialConfig.ollama)) {
      payload.ollama = form.ollama;
    }
    if (JSON.stringify(form.lmStudio) !== JSON.stringify(initialConfig.lmStudio)) {
      payload.lmStudio = form.lmStudio;
    }
    return payload;
  }, [form, initialConfig]);

  const hasChanges = useMemo(() => Object.keys(changedPayload).length > 0, [changedPayload]);

  const onSave = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res: { data: AppConfig } = await setConfig(changedPayload);
      const next = { ...emptyConfig, ...res.data };
      setInitialConfig(next);
      setForm(next);
      setSuccess(tr("settings.saved", "Config saved successfully."));
    } catch (e: any) {
      setError(e?.response?.data?.message || tr("settings.saveError", "Could not save config."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <h1 className="text-2xl font-semibold text-[rgb(173,8,8)]">{tr("settings.title", "Settings")}</h1>
        <p className="text-sm text-zinc-600">
          {tr("settings.subtitle", "Owner-only config management for providers and scheduler.")}
        </p>
      </div>

      {error && <p className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700">{error}</p>}
      {success && <p className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-700">{success}</p>}

      {loading ? (
        <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-zinc-600">
          {tr("settings.loading", "Loading config...")}
        </div>
      ) : (
        <>
          <Section title={tr("settings.apiKeys", "API Keys")}>
            <div className="grid gap-3 md:grid-cols-2">
              {apiKeyFields.map((field) => (
                <div key={field}>
                  <label className="mb-1 block text-sm text-zinc-700">{String(field)}</label>
                  <input
                    value={(form[field] as string) || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-red-300 focus:ring-0"
                    placeholder={
                      isMaskedValue(initialConfig[field]) ? "*************" : ""
                    }
                  />
                </div>
              ))}
            </div>
          </Section>

          <Section title={tr("settings.localProviders", "Local Providers")}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-red-200 p-3">
                <p className="mb-2 text-sm font-semibold text-[rgb(173,8,8)]">Ollama</p>
                <input
                  value={form.ollama?.baseUrl || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      ollama: { ...(prev.ollama || {}), baseUrl: e.target.value },
                    }))
                  }
                  className="mb-2 w-full rounded border border-red-300 px-2 py-2 text-sm"
                  placeholder="baseUrl"
                />
                <input
                  value={form.ollama?.apiKey || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      ollama: { ...(prev.ollama || {}), apiKey: e.target.value },
                    }))
                  }
                  className="w-full rounded border border-red-300 px-2 py-2 text-sm"
                  placeholder="apiKey (optional)"
                />
              </div>

              <div className="rounded-lg border border-red-200 p-3">
                <p className="mb-2 text-sm font-semibold text-[rgb(173,8,8)]">LM Studio</p>
                <input
                  value={form.lmStudio?.baseUrl || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      lmStudio: { ...(prev.lmStudio || {}), baseUrl: e.target.value },
                    }))
                  }
                  className="mb-2 w-full rounded border border-red-300 px-2 py-2 text-sm"
                  placeholder="baseUrl"
                />
                <input
                  value={form.lmStudio?.apiKey || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      lmStudio: { ...(prev.lmStudio || {}), apiKey: e.target.value },
                    }))
                  }
                  className="w-full rounded border border-red-300 px-2 py-2 text-sm"
                  placeholder="apiKey (optional)"
                />
              </div>
            </div>
          </Section>

          <Section title={tr("settings.scheduler", "Scheduler")}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-zinc-700">
                  schedulerMaxRetriesPerTick
                </label>
                <input
                  type="number"
                  value={form.schedulerMaxRetriesPerTick ?? 0}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      schedulerMaxRetriesPerTick: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-red-300 focus:ring-0"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-zinc-700">
                  schedulerMaxConsecutiveFailedTicks
                </label>
                <input
                  type="number"
                  value={form.schedulerMaxConsecutiveFailedTicks ?? 0}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      schedulerMaxConsecutiveFailedTicks: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-red-300 focus:ring-0"
                />
              </div>
            </div>
          </Section>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadConfig}
              className="rounded-lg bg-red-100 px-4 py-2 text-sm text-red-700 hover:bg-red-200"
            >
              {tr("settings.reload", "Reload")}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!hasChanges || saving}
              className="rounded-lg bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? tr("settings.saving", "Saving...") : tr("settings.save", "Save changes")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
