"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lang";
import { useAuth } from "@/hooks/useAuth";
import {
  AppConfig,
  ChatgptOauthResponseData,
  connectChatgptOauth,
  getConfigTimeNow,
  getConfigView,
  SchedulerTimeNowData,
  setConfig,
} from "@/services/ConfigService";

function shouldWarnSchedulerTzMismatch(data: SchedulerTimeNowData) {
  const stored = (data.storedSchedulerTimezone ?? "").trim();
  return stored !== "" && stored !== data.effectiveSchedulerTimezone;
}
import { notify } from "@/utils/notify";

type ApiKeyField =
  | "openaiApiKey"
  | "geminiApiKey"
  | "anthropicApiKey"
  | "openrouterApiKey"
  | "deepseekApiKey"
  | "kimiApiKey"
  | "kieApiKey"
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
  "kieApiKey",
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
  kieApiKey: "",
  zaiApiKey: "",
  perplexityApiKey: "",
  braveApiKey: "",
  firecrawlApiKey: "",
  ollama: { baseUrl: "", apiKey: "" },
  lmStudio: { baseUrl: "", apiKey: "" },
  schedulerMaxRetriesPerTick: 3,
  schedulerMaxConsecutiveFailedTicks: 3,
  schedulerTimezone: "",
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
  const { user, isChecking } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthCallbackInput, setOauthCallbackInput] = useState("");
  const [oauthStatus, setOauthStatus] = useState<ChatgptOauthResponseData | null>(null);
  const [oauthMessage, setOauthMessage] = useState("");
  const [initialConfig, setInitialConfig] = useState<AppConfig>(emptyConfig);
  const [form, setForm] = useState<AppConfig>(emptyConfig);
  const [schedulerTimeNow, setSchedulerTimeNow] = useState<SchedulerTimeNowData | null>(null);
  const [timeNowLoading, setTimeNowLoading] = useState(false);

  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const canAccess = user?.level === "owner";

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res: { data: AppConfig } = await getConfigView();
      const next = { ...emptyConfig, ...res.data };
      setInitialConfig(next);
      setForm(next);
      setSchedulerTimeNow(null);
    } catch (e: any) {
      notify.error(e?.response?.data?.message || tr("settings.loadError", "Could not load config."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isChecking || !canAccess) {
      setLoading(false);
      return;
    }
    loadConfig();
  }, [isChecking, canAccess]);

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
    const tzForm = (form.schedulerTimezone ?? "").trim();
    const tzInit = (initialConfig.schedulerTimezone ?? "").trim();
    if (tzForm !== tzInit) {
      payload.schedulerTimezone = tzForm === "" ? null : tzForm;
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
    try {
      const res: { data: AppConfig } = await setConfig(changedPayload);
      const next = { ...emptyConfig, ...res.data };
      setInitialConfig(next);
      setForm(next);
      setSchedulerTimeNow(null);
      notify.success(tr("settings.saved", "Config saved successfully."));
    } catch (e: any) {
      notify.error(e?.response?.data?.message || tr("settings.saveError", "Could not save config."));
    } finally {
      setSaving(false);
    }
  };

  const onFetchSchedulerTimeNow = async () => {
    if (timeNowLoading) return;
    setTimeNowLoading(true);
    try {
      const res = await getConfigTimeNow();
      setSchedulerTimeNow(res.data);
    } catch (e: any) {
      setSchedulerTimeNow(null);
      notify.error(
        e?.response?.data?.message ||
          tr("settings.schedulerClockError", "Could not load scheduler time."),
      );
    } finally {
      setTimeNowLoading(false);
    }
  };

  const onStartOauth = async () => {
    if (oauthBusy) return;
    setOauthBusy(true);
    setOauthMessage("");
    try {
      const res = await connectChatgptOauth({ mode: "start" });
      const data = (res?.data || {}) as ChatgptOauthResponseData;
      setOauthStatus(data);
      setOauthMessage(
        data.message ||
          tr(
            "settings.oauthStartHint",
            "Opened OAuth URL. After consent, paste callback URL below and click Finish.",
          ),
      );
      if (data.authUrl && typeof window !== "undefined") {
        window.open(data.authUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e: any) {
      notify.error(e?.response?.data?.message || tr("settings.oauthStartError", "Could not start OAuth flow."));
    } finally {
      setOauthBusy(false);
    }
  };

  const onFinishOauth = async () => {
    if (oauthBusy) return;
    if (!oauthCallbackInput.trim()) {
      notify.error(tr("settings.oauthCallbackRequired", "Please paste callback URL or code."));
      return;
    }
    setOauthBusy(true);
    setOauthMessage("");
    try {
      const res = await connectChatgptOauth({
        mode: "finish",
        callbackUrlOrCode: oauthCallbackInput.trim(),
      });
      const data = (res?.data || {}) as ChatgptOauthResponseData;
      setOauthStatus(data);
      if (data.ok) {
        notify.success(
          data.message ||
            tr("settings.oauthConnected", "OpenAI Codex OAuth connected successfully."),
        );
        setOauthCallbackInput("");
        await loadConfig();
      } else {
        setOauthMessage(
          data.message ||
            tr(
              "settings.oauthFinishHint",
              "Finish request accepted, please check callback URL and try again.",
            ),
        );
      }
    } catch (e: any) {
      notify.error(e?.response?.data?.message || tr("settings.oauthFinishError", "Could not finish OAuth flow."));
    } finally {
      setOauthBusy(false);
    }
  };

  const onCheckOauthStatus = async () => {
    if (oauthBusy) return;
    setOauthBusy(true);
    setOauthMessage("");
    try {
      const res = await connectChatgptOauth({ mode: "status" });
      const data = (res?.data || {}) as ChatgptOauthResponseData;
      setOauthStatus(data);
      setOauthMessage(
        data.connected
          ? tr("settings.oauthConnectedState", "OAuth is connected.")
          : tr("settings.oauthNotConnectedState", "OAuth is not connected yet."),
      );
    } catch (e: any) {
      notify.error(e?.response?.data?.message || tr("settings.oauthStatusError", "Could not check OAuth status."));
    } finally {
      setOauthBusy(false);
    }
  };

  const onCancelOauth = async () => {
    if (oauthBusy) return;
    setOauthBusy(true);
    setOauthMessage("");
    try {
      const res = await connectChatgptOauth({ mode: "cancel" });
      const data = (res?.data || {}) as ChatgptOauthResponseData;
      setOauthStatus(data);
      notify.success(
        data.message || tr("settings.oauthCancelOk", "Pending OAuth flow cancelled."),
      );
    } catch (e: any) {
      notify.error(
        e?.response?.data?.message || tr("settings.oauthCancelError", "Could not cancel OAuth flow."),
      );
    } finally {
      setOauthBusy(false);
    }
  };

  if (isChecking) {
    return (
      <div className="w-full min-w-0 space-y-3 sm:space-y-4">
        <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-zinc-600">
          {tr("settings.loading", "Loading config...")}
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="w-full min-w-0 space-y-3 sm:space-y-4">
        <div className="rounded-xl border border-red-200 bg-white p-4">
          <h1 className="text-2xl font-semibold text-[rgb(173,8,8)]">{tr("settings.title", "Settings")}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {tr("settings.forbidden", "This area is only available for owner accounts.")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-3 sm:space-y-4">
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <h1 className="text-2xl font-semibold text-[rgb(173,8,8)]">{tr("settings.title", "Settings")}</h1>
        <p className="text-sm text-zinc-600">
          {tr("settings.subtitle", "Owner-only config management for providers and scheduler.")}
        </p>
      </div>

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
                  <label className="mb-1 block text-sm text-zinc-700">
                    {field === "kieApiKey"
                      ? tr("settings.kieApiKey", "KIE API key (image generation)")
                      : String(field)}
                  </label>
                  <input
                    type={field === "kieApiKey" ? "password" : "text"}
                    autoComplete={field === "kieApiKey" ? "new-password" : "off"}
                    value={(form[field] as string) || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-red-300 focus:ring-0"
                    placeholder={
                      isMaskedValue(initialConfig[field]) ? "*************" : ""
                    }
                  />
                  {field === "kieApiKey" ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      {tr(
                        "settings.kieApiKeyHint",
                        "From kie.ai — enables image generation via the image_generate skill (gpt4o-image, seedream, nano-banana, …). Stored like other keys; masked when loaded from View config.",
                      )}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50/50 p-3">
              <p className="mb-2 text-sm font-semibold text-[rgb(173,8,8)]">
                {tr("settings.openaiCodexOauth", "OpenAI Codex OAuth")}
              </p>
              <p className="mb-3 text-xs text-zinc-600">
                {tr(
                  "settings.openaiCodexOauthHint",
                  "Use this flow to connect ChatGPT/Codex OAuth directly from Settings.",
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onStartOauth()}
                  disabled={oauthBusy}
                  className="rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700 hover:bg-red-200 disabled:opacity-50"
                >
                  {tr("settings.connectOpenaiCodexOauth", "Connect OpenAI Codex OAuth")}
                </button>
                <button
                  type="button"
                  onClick={() => void onCheckOauthStatus()}
                  disabled={oauthBusy}
                  className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {tr("settings.checkOauthStatus", "Check OAuth status")}
                </button>
                <button
                  type="button"
                  onClick={() => void onCancelOauth()}
                  disabled={oauthBusy}
                  className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs text-zinc-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {tr("settings.oauthCancelPendingFlow", "Cancel pending flow")}
                </button>
              </div>
              <div className="mt-3 space-y-2">
                <input
                  value={oauthCallbackInput}
                  onChange={(e) => setOauthCallbackInput(e.target.value)}
                  className="w-full rounded border border-red-300 px-2 py-2 text-xs"
                  placeholder={tr(
                    "settings.oauthCallbackPlaceholder",
                    "Paste callback URL or code from ChatGPT OAuth",
                  )}
                />
                <button
                  type="button"
                  onClick={() => void onFinishOauth()}
                  disabled={oauthBusy || !oauthCallbackInput.trim()}
                  className="rounded-lg bg-[rgb(173,8,8)] px-3 py-2 text-xs text-white disabled:opacity-50"
                >
                  {tr("settings.finishOauthConnection", "Finish OAuth connection")}
                </button>
              </div>
              {(oauthStatus || oauthMessage) && (
                <div className="mt-3 rounded border border-red-200 bg-white p-2 text-xs text-zinc-700">
                  {oauthMessage && <p className="mb-1">{oauthMessage}</p>}
                  {oauthStatus && "pendingTarget" in oauthStatus ? (
                    <p className="mb-1">
                      {tr("settings.oauthPendingTarget", "Pending OAuth target")}:{" "}
                      <span className="font-mono">{String(oauthStatus.pendingTarget)}</span>
                    </p>
                  ) : null}
                  {oauthStatus?.connected != null && (
                    <p>
                      {tr("settings.oauthConnectedLabel", "Connected")}:{" "}
                      {oauthStatus.connected ? "true" : "false"}
                    </p>
                  )}
                  {oauthStatus?.usable != null && (
                    <p>
                      {tr("settings.oauthUsableLabel", "Usable")}:{" "}
                      {oauthStatus.usable ? "true" : "false"}
                    </p>
                  )}
                  {oauthStatus?.tokenType ? (
                    <p>
                      {tr("settings.oauthTokenTypeLabel", "Token type")}: {oauthStatus.tokenType}
                    </p>
                  ) : null}
                  {oauthStatus?.expiresAt && (
                    <p>
                      {tr("settings.oauthExpiresAtLabel", "Expires at")}: {oauthStatus.expiresAt}
                    </p>
                  )}
                </div>
              )}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm text-zinc-700">
                  {tr("settings.schedulerMaxRetriesPerTick", "Max retries per tick")}
                </label>
                <input
                  type="number"
                  min={0}
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
                  {tr("settings.schedulerMaxConsecutiveFailedTicks", "Max consecutive failed ticks")}
                </label>
                <input
                  type="number"
                  min={0}
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
              <div>
                <label className="mb-1 block text-sm text-zinc-700">
                  {tr("settings.schedulerTimezone", "Timezone (IANA)")}
                </label>
                <input
                  type="text"
                  value={form.schedulerTimezone ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      schedulerTimezone: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-red-300 focus:ring-0"
                  placeholder="Asia/Ho_Chi_Minh"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  {tr(
                    "settings.schedulerTimezoneHint",
                    "Cron jobs use this zone. Leave empty or invalid values fall back to UTC on the server.",
                  )}
                </p>
              </div>
            </div>
            <div className="mt-4 border-t border-red-100 pt-4">
              <p className="mb-2 text-[11px] text-zinc-500">
                {tr(
                  "settings.schedulerClockSavedOnlyHint",
                  "Uses the timezone already saved on the server. Save changes first if you edited the field above.",
                )}
              </p>
              <button
                type="button"
                onClick={onFetchSchedulerTimeNow}
                disabled={timeNowLoading || loading}
                className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {timeNowLoading
                  ? tr("settings.schedulerClockLoading", "Loading…")
                  : tr("settings.checkSchedulerClock", "Check scheduler time")}
              </button>
              {schedulerTimeNow && (
                <dl className="mt-3 grid gap-2 text-sm text-zinc-800 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-zinc-500">
                      {tr("settings.schedulerEffectiveTz", "Effective timezone")}
                    </dt>
                    <dd className="font-medium">{schedulerTimeNow.effectiveSchedulerTimezone}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">
                      {tr("settings.schedulerStoredTz", "Stored timezone")}
                    </dt>
                    <dd className="font-medium">
                      {schedulerTimeNow.storedSchedulerTimezone ?? "—"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-zinc-500">
                      {tr("settings.schedulerLocalTime", "Local time (server view)")}
                    </dt>
                    <dd className="font-mono text-base">{schedulerTimeNow.localDateTime}</dd>
                    <dd className="text-xs text-zinc-600">{schedulerTimeNow.localDateTimeVi}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">
                      {tr("settings.schedulerGmtOffset", "Offset")}
                    </dt>
                    <dd>{schedulerTimeNow.gmtOffsetLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">UTC</dt>
                    <dd className="break-all font-mono text-xs">{schedulerTimeNow.utcIso}</dd>
                  </div>
                </dl>
              )}
              {schedulerTimeNow && shouldWarnSchedulerTzMismatch(schedulerTimeNow) && (
                <p className="mt-2 text-xs text-amber-800">
                  {tr(
                    "settings.schedulerTzFallbackWarning",
                    "Stored value differs from effective zone — invalid or empty IANA may fall back to UTC.",
                  )}
                </p>
              )}
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
