"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, RefreshCw, Sparkles, Trash2, Wifi } from "lucide-react";
import { useLang } from "@/lang";
import type { ChatgptOauthResponseData, ProviderConfig } from "@/services/ConfigService";
import {
  connectUserConfigChatgptOauth,
  getUserConfigView,
  setUserConfig,
  type UserConfig,
  type UserConfigSetPayload,
} from "@/services/UserConfigService";
import { notify } from "@/utils/notify";

type ApiKeyField =
  | "openaiApiKey"
  | "geminiApiKey"
  | "anthropicApiKey"
  | "openrouterApiKey"
  | "deepseekApiKey"
  | "kimiApiKey"
  | "perplexityApiKey"
  | "braveApiKey"
  | "firecrawlApiKey"
  | "kieApiKey";

const API_KEY_FIELDS: ApiKeyField[] = [
  "openaiApiKey",
  "geminiApiKey",
  "anthropicApiKey",
  "openrouterApiKey",
  "deepseekApiKey",
  "kimiApiKey",
  "perplexityApiKey",
  "braveApiKey",
  "firecrawlApiKey",
  "kieApiKey",
];

const emptyProvider = (): ProviderConfig => ({ baseUrl: "", apiKey: "" });

const isMaskedValue = (value: unknown) =>
  typeof value === "string" && value.includes("*");

function normalizeProvider(p: ProviderConfig | null | undefined): ProviderConfig {
  return {
    baseUrl: (p?.baseUrl ?? "").trim() ? String(p?.baseUrl) : "",
    apiKey: (p?.apiKey ?? "") === null || (p?.apiKey ?? "") === undefined ? "" : String(p?.apiKey ?? ""),
  };
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (obj[k] !== undefined) {
      (out as Record<string, unknown>)[k as string] = obj[k];
    }
  }
  return out;
}

export default function MySettingPage() {
  const { t } = useLang();
  const tr = useCallback(
    (key: string, fallback: string) => {
      const v = t(key);
      return v === key ? fallback : v;
    },
    [t],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"providers" | "oauth" | "local">("providers");

  const [initial, setInitial] = useState<UserConfig | null>(null);
  const [keyInput, setKeyInput] = useState<Record<ApiKeyField, string>>(() =>
    Object.fromEntries(API_KEY_FIELDS.map((k) => [k, ""])) as Record<ApiKeyField, string>,
  );
  const [removeKey, setRemoveKey] = useState<Record<ApiKeyField, boolean>>(
    () => Object.fromEntries(API_KEY_FIELDS.map((k) => [k, false])) as Record<ApiKeyField, boolean>,
  );

  const [ollamaForm, setOllamaForm] = useState<ProviderConfig>(() => emptyProvider());
  const [lmForm, setLmForm] = useState<ProviderConfig>(() => emptyProvider());
  const [clearOllamaApiKey, setClearOllamaApiKey] = useState(false);
  const [clearLmApiKey, setClearLmApiKey] = useState(false);

  const [oauthRemoveBusy, setOauthRemoveBusy] = useState(false);

  const [oauthCodexBusy, setOauthCodexBusy] = useState(false);
  const [oauthCodexCallbackInput, setOauthCodexCallbackInput] = useState("");
  const [oauthCodexStatus, setOauthCodexStatus] = useState<ChatgptOauthResponseData | null>(null);
  const [oauthCodexMessage, setOauthCodexMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await getUserConfigView();
      const data = res.data ?? null;
      setInitial(data);
      setKeyInput(Object.fromEntries(API_KEY_FIELDS.map((k) => [k, ""])) as Record<ApiKeyField, string>);
      setRemoveKey(Object.fromEntries(API_KEY_FIELDS.map((k) => [k, false])) as Record<ApiKeyField, boolean>);
      setOllamaForm(normalizeProvider(data?.ollama));
      setLmForm(normalizeProvider(data?.lmStudio));
      setClearOllamaApiKey(false);
      setClearLmApiKey(false);
      setOauthCodexCallbackInput("");
      setOauthCodexMessage("");
      setOauthCodexStatus(null);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        tr("mySetting.loadError", "Could not load your configuration.");
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  /** True when GET /user-config/view returned a non-null, non-empty value for this key (incl. masked). */
  const hasStoredStringKey = useCallback(
    (field: ApiKeyField) => {
      const v = initial?.[field];
      if (v == null) return false;
      return typeof v === "string" && v.trim().length > 0;
    },
    [initial],
  );

  const storedProvider = useMemo(() => {
    return {
      ollama: normalizeProvider(initial?.ollama),
      lmStudio: normalizeProvider(initial?.lmStudio),
    };
  }, [initial]);

  const oauthStored =
    initial?.openaiOAuth &&
    (Boolean(initial.openaiOAuth.accessToken) ||
      Boolean(initial.openaiOAuth.refreshToken) ||
      Boolean(initial.openaiOAuth.expiresAt) ||
      Boolean(initial.openaiOAuth.tokenType));

  const diffProvider = useCallback(
    (form: ProviderConfig, base: ProviderConfig, clearApiKey: boolean): ProviderConfig | null => {
      const out: Partial<ProviderConfig> = {};
      const urlF = (form.baseUrl ?? "").trim();
      const urlI = (base.baseUrl ?? "").trim();
      if (urlF !== urlI) {
        out.baseUrl = urlF || null;
      }
      const keyF = form.apiKey ?? "";
      const keyMasked = isMaskedValue(keyF);
      if (clearApiKey) {
        out.apiKey = null;
      } else if (!keyMasked) {
        const t = keyF.trim();
        const hadStored = typeof base.apiKey === "string" && base.apiKey.trim().length > 0;
        if (t !== "") {
          out.apiKey = t;
        } else if (hadStored && t === "") {
          out.apiKey = null;
        }
      }
      if (Object.keys(out).length === 0) return null;
      return stripUndefined(out as Record<string, unknown>) as ProviderConfig;
    },
    [],
  );

  const patch = useMemo((): UserConfigSetPayload => {
    const out: UserConfigSetPayload = {};
    for (const field of API_KEY_FIELDS) {
      if (removeKey[field]) {
        out[field] = null;
        continue;
      }
      const typed = keyInput[field]?.trim() ?? "";
      if (typed !== "") {
        out[field] = typed;
      }
    }

    const op = diffProvider(ollamaForm, storedProvider.ollama, clearOllamaApiKey);
    if (op) out.ollama = op;

    const lp = diffProvider(lmForm, storedProvider.lmStudio, clearLmApiKey);
    if (lp) out.lmStudio = lp;

    return out;
  }, [
    clearLmApiKey,
    clearOllamaApiKey,
    diffProvider,
    keyInput,
    lmForm,
    ollamaForm,
    removeKey,
    storedProvider.lmStudio,
    storedProvider.ollama,
  ]);

  const hasChanges = useMemo(() => Object.keys(patch).length > 0, [patch]);

  const onSave = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      const res = await setUserConfig(patch);
      setInitial(res.data ?? null);
      setKeyInput(Object.fromEntries(API_KEY_FIELDS.map((k) => [k, ""])) as Record<ApiKeyField, string>);
      setRemoveKey(Object.fromEntries(API_KEY_FIELDS.map((k) => [k, false])) as Record<ApiKeyField, boolean>);
      if (res.data?.ollama) setOllamaForm(normalizeProvider(res.data.ollama));
      else setOllamaForm(emptyProvider());
      if (res.data?.lmStudio) setLmForm(normalizeProvider(res.data.lmStudio));
      else setLmForm(emptyProvider());
      setClearOllamaApiKey(false);
      setClearLmApiKey(false);
      notify.success(tr("mySetting.saved", "Your personal settings were saved."));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        tr("mySetting.saveError", "Could not save your configuration.");
      notify.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const onDiscard = () => {
    void load();
  };

  const onRemoveStoredOauth = async () => {
    if (oauthRemoveBusy || !oauthStored) return;
    setOauthRemoveBusy(true);
    try {
      await setUserConfig({ openaiOAuth: null });
      notify.success(tr("mySetting.oauthRemovedOk", "Saved OAuth has been removed."));
      await load();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        tr("mySetting.oauthRemoveError", "Could not remove saved OAuth.");
      notify.error(msg);
    } finally {
      setOauthRemoveBusy(false);
    }
  };

  const onOauthCodexStart = async () => {
    if (oauthCodexBusy) return;
    setOauthCodexBusy(true);
    setOauthCodexMessage("");
    try {
      const res = await connectUserConfigChatgptOauth({ mode: "start" });
      const data = (res?.data ?? {}) as ChatgptOauthResponseData;
      setOauthCodexStatus(data);
      setOauthCodexMessage(
        data.message ||
          tr("settings.oauthStartHint", "Opened OAuth URL. After consent, paste callback URL below and click Finish."),
      );
      if (data.authUrl && typeof window !== "undefined") {
        window.open(data.authUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        tr("settings.oauthStartError", "Could not start OAuth flow.");
      notify.error(msg);
    } finally {
      setOauthCodexBusy(false);
    }
  };

  const onOauthCodexFinish = async () => {
    if (oauthCodexBusy) return;
    if (!oauthCodexCallbackInput.trim()) {
      notify.error(tr("settings.oauthCallbackRequired", "Please paste callback URL or code."));
      return;
    }
    setOauthCodexBusy(true);
    setOauthCodexMessage("");
    try {
      const res = await connectUserConfigChatgptOauth({
        mode: "finish",
        callbackUrlOrCode: oauthCodexCallbackInput.trim(),
      });
      const data = (res?.data ?? {}) as ChatgptOauthResponseData;
      setOauthCodexStatus(data);
      if (data.ok) {
        notify.success(
          data.message ||
            tr("settings.oauthConnected", "OpenAI Codex OAuth connected successfully."),
        );
        setOauthCodexCallbackInput("");
        await load();
      } else {
        setOauthCodexMessage(
          data.message ||
            tr(
              "settings.oauthFinishHint",
              "Finish request accepted, please check callback URL and try again.",
            ),
        );
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        tr("settings.oauthFinishError", "Could not finish OAuth flow.");
      notify.error(msg);
    } finally {
      setOauthCodexBusy(false);
    }
  };

  const onOauthCodexStatus = async () => {
    if (oauthCodexBusy) return;
    setOauthCodexBusy(true);
    setOauthCodexMessage("");
    try {
      const res = await connectUserConfigChatgptOauth({ mode: "status" });
      const data = (res?.data ?? {}) as ChatgptOauthResponseData;
      setOauthCodexStatus(data);
      setOauthCodexMessage(
        data.connected
          ? tr("settings.oauthConnectedState", "OAuth is connected.")
          : tr("settings.oauthNotConnectedState", "OAuth is not connected yet."),
      );
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        tr("settings.oauthStatusError", "Could not check OAuth status.");
      notify.error(msg);
    } finally {
      setOauthCodexBusy(false);
    }
  };

  const onOauthCodexCancel = async () => {
    if (oauthCodexBusy) return;
    setOauthCodexBusy(true);
    setOauthCodexMessage("");
    try {
      const res = await connectUserConfigChatgptOauth({ mode: "cancel" });
      const data = (res?.data ?? {}) as ChatgptOauthResponseData;
      setOauthCodexStatus(data);
      notify.success(
        data.message || tr("mySetting.oauthCancelOk", "Pending OAuth flow cancelled."),
      );
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        tr("mySetting.oauthCancelError", "Could not cancel OAuth flow.");
      notify.error(msg);
    } finally {
      setOauthCodexBusy(false);
    }
  };

  const labelForKey = (field: ApiKeyField) =>
    tr(`mySetting.keys.${field}`, field.replace("ApiKey", " API key"));

  const tabBtn = (id: typeof tab, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        tab === id
          ? "bg-red-600 text-white shadow-sm shadow-red-900/20"
          : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const inputClass =
    "w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none ring-0 transition-colors placeholder:text-zinc-400 focus:border-red-400 focus:ring-2 focus:ring-red-500/20";

  return (
    <div className="relative w-full min-w-0 pb-4">
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[rgb(173,8,8)]">
                {tr("mySetting.title", "Personal credentials")}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-600">
                {tr(
                  "mySetting.subtitle",
                  "Provider keys and endpoints stored for your account only. They override global defaults when set. Values from the server are masked.",
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {tr("mySetting.reload", "Reload")}
            </button>
          </div>
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50/60 px-4 py-3 text-xs leading-relaxed text-zinc-700">
            {tr(
              "mySetting.hint",
              "Leave a field empty to keep the current saved value. Use Remove to clear your override (fall back to global config). Only changed fields are sent.",
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white py-16 text-sm text-zinc-600">
            <Loader2 className="h-5 w-5 animate-spin text-red-600" />
            {tr("mySetting.loading", "Loading your settings…")}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {tabBtn(
                "providers",
                tr("mySetting.tabProviders", "API keys"),
                <KeyRound className="h-4 w-4" />,
              )}
              {tabBtn(
                "oauth",
                tr("mySetting.tabOauth", "OpenAI OAuth"),
                <Sparkles className="h-4 w-4" />,
              )}
              {tabBtn("local", tr("mySetting.tabLocal", "Local LLMs"), <Wifi className="h-4 w-4" />)}
            </div>

            {tab === "providers" && (
              <section className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="mb-4 text-lg font-semibold text-[rgb(173,8,8)]">
                  {tr("mySetting.sectionProviders", "Cloud providers")}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {API_KEY_FIELDS.map((field) => {
                    const stored = hasStoredStringKey(field);
                    const pendingRemove = removeKey[field];
                    const showTrash = stored || pendingRemove;
                    return (
                      <div
                        key={field}
                        className={`rounded-xl border p-3 transition-colors ${
                          pendingRemove
                            ? "border-red-300 bg-red-50/80"
                            : "border-zinc-100 bg-zinc-50/40"
                        }`}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <label className="text-sm font-medium text-zinc-800">{labelForKey(field)}</label>
                          {stored && !pendingRemove ? (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                              {tr("mySetting.savedBadge", "Saved")}
                            </span>
                          ) : null}
                          {pendingRemove ? (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              {tr("mySetting.removePending", "Will remove")}
                            </span>
                          ) : null}
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            autoComplete="off"
                            value={keyInput[field]}
                            onChange={(e) => {
                              setKeyInput((prev) => ({ ...prev, [field]: e.target.value }));
                              setRemoveKey((prev) => ({ ...prev, [field]: false }));
                            }}
                            disabled={pendingRemove}
                            placeholder={
                              stored && !pendingRemove
                                ? tr("mySetting.placeholderReplace", "New key (optional)")
                                : tr("mySetting.placeholderNew", "Paste API key")
                            }
                            className={`${inputClass} ${showTrash ? "pr-10" : ""} disabled:opacity-60`}
                          />
                          {showTrash ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => {
                                setRemoveKey((prev) => ({ ...prev, [field]: !prev[field] }));
                                setKeyInput((prev) => ({ ...prev, [field]: "" }));
                              }}
                              className={`absolute top-1/2 right-2 -translate-y-1/2 rounded appearance-none border-0 bg-transparent p-1.5 shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 ${
                                pendingRemove
                                  ? "text-amber-700 hover:bg-amber-100"
                                  : "text-zinc-500 hover:bg-red-50 hover:text-red-700"
                              }`}
                              title={
                                pendingRemove
                                  ? tr("mySetting.undoRemove", "Undo")
                                  : tr("mySetting.removeKey", "Remove saved key")
                              }
                              aria-label={
                                pendingRemove
                                  ? tr("mySetting.undoRemove", "Undo")
                                  : tr("mySetting.removeKey", "Remove saved key")
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {tab === "oauth" && (
              <section className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="mb-1 text-lg font-semibold text-[rgb(173,8,8)]">
                  {tr("mySetting.sectionOauth", "OpenAI OAuth (personal)")}
                </h2>
                <p className="mb-4 text-sm text-zinc-600">
                  {tr(
                    "mySetting.oauthIntro",
                    "Connect via ChatGPT OAuth Codex (browser flow). Tokens are written to your user_config by POST /user-config/connect/chatgpt-oauth.",
                  )}
                </p>

                <div className="mb-6 rounded-xl border border-red-100 bg-red-50/50 p-4">
                  <p className="mb-1 text-sm font-semibold text-[rgb(173,8,8)]">
                    {tr("mySetting.oauthCodexTitle", "ChatGPT OAuth Codex")}
                  </p>
                  <p className="mb-3 text-xs text-zinc-600">
                    {tr(
                      "mySetting.oauthCodexHint",
                      "Same modes as global Settings (start → browser → finish). Tokens are stored only for your account (not global config).",
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void onOauthCodexStart()}
                      disabled={oauthCodexBusy}
                      className="rounded-lg bg-red-100 px-3 py-2 text-xs font-medium text-red-800 hover:bg-red-200 disabled:opacity-50"
                    >
                      {tr("settings.connectOpenaiCodexOauth", "Connect OpenAI Codex OAuth")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onOauthCodexStatus()}
                      disabled={oauthCodexBusy}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                    >
                      {tr("settings.checkOauthStatus", "Check OAuth status")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onOauthCodexCancel()}
                      disabled={oauthCodexBusy}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                    >
                      {tr("mySetting.oauthCancelFlow", "Cancel pending flow")}
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    <input
                      value={oauthCodexCallbackInput}
                      onChange={(e) => setOauthCodexCallbackInput(e.target.value)}
                      className={`${inputClass} text-xs`}
                      placeholder={tr(
                        "settings.oauthCallbackPlaceholder",
                        "Paste callback URL or code from ChatGPT OAuth",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => void onOauthCodexFinish()}
                      disabled={oauthCodexBusy || !oauthCodexCallbackInput.trim()}
                      className="rounded-lg bg-[rgb(173,8,8)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {tr("settings.finishOauthConnection", "Finish OAuth connection")}
                    </button>
                  </div>
                  {(oauthCodexStatus || oauthCodexMessage) && (
                    <div className="mt-3 rounded-lg border border-red-100 bg-white p-3 text-xs text-zinc-700">
                      {oauthCodexMessage ? <p className="mb-2">{oauthCodexMessage}</p> : null}
                      {oauthCodexStatus && "pendingTarget" in oauthCodexStatus ? (
                        <p className="mb-1">
                          {tr("mySetting.oauthPendingTarget", "Pending OAuth target")}:{" "}
                          <span className="font-mono">{String(oauthCodexStatus.pendingTarget)}</span>
                        </p>
                      ) : null}
                      {oauthCodexStatus?.connected != null && (
                        <p>
                          {tr("settings.oauthConnectedLabel", "Connected")}:{" "}
                          {oauthCodexStatus.connected ? "true" : "false"}
                        </p>
                      )}
                      {oauthCodexStatus?.usable != null && (
                        <p>
                          {tr("settings.oauthUsableLabel", "Usable")}:{" "}
                          {oauthCodexStatus.usable ? "true" : "false"}
                        </p>
                      )}
                      {oauthCodexStatus?.expiresAt ? (
                        <p>
                          {tr("settings.oauthExpiresAtLabel", "Expires at")}: {oauthCodexStatus.expiresAt}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                {oauthStored ? (
                  <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3">
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-800">
                      {tr("mySetting.oauthTokensSaved", "OAuth data on file (masked)")}
                    </span>
                    <button
                      type="button"
                      onClick={() => void onRemoveStoredOauth()}
                      disabled={oauthRemoveBusy}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-zinc-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      {tr("mySetting.oauthRemove", "Remove saved OAuth")}
                    </button>
                  </div>
                ) : null}
              </section>
            )}

            {tab === "local" && (
              <section className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="mb-4 text-lg font-semibold text-[rgb(173,8,8)]">
                  {tr("mySetting.sectionLocal", "Ollama & LM Studio")}
                </h2>
                <div className="grid gap-6 md:grid-cols-2">
                  {(
                    [
                      {
                        id: "ollama" as const,
                        title: "Ollama",
                        form: ollamaForm,
                        setForm: setOllamaForm,
                        clearKey: clearOllamaApiKey,
                        setClearKey: setClearOllamaApiKey,
                        initialP: storedProvider.ollama,
                      },
                      {
                        id: "lmStudio" as const,
                        title: "LM Studio",
                        form: lmForm,
                        setForm: setLmForm,
                        clearKey: clearLmApiKey,
                        setClearKey: setClearLmApiKey,
                        initialP: storedProvider.lmStudio,
                      },
                    ] as const
                  ).map(({ id, title, form, setForm, clearKey, setClearKey, initialP }) => {
                    const hasKeyStored =
                      typeof initialP.apiKey === "string" && initialP.apiKey.trim().length > 0;
                    const showTrash = hasKeyStored || clearKey;
                    return (
                      <div key={id} className="rounded-xl border border-zinc-100 bg-zinc-50/40 p-4">
                        <p className="mb-3 text-sm font-semibold text-zinc-900">{title}</p>
                        <label className="mb-1 block text-xs font-medium text-zinc-500">
                          {tr("mySetting.baseUrl", "Base URL")}
                        </label>
                        <input
                          value={form.baseUrl ?? ""}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, baseUrl: e.target.value }))
                          }
                          className={`${inputClass} mb-3`}
                          placeholder="http://127.0.0.1:11434"
                        />
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <label className="text-xs font-medium text-zinc-500">
                            {tr("mySetting.providerApiKey", "API key (optional)")}
                          </label>
                          {hasKeyStored && !clearKey ? (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                              {tr("mySetting.savedBadge", "Saved")}
                            </span>
                          ) : null}
                          {clearKey ? (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              {tr("mySetting.removePending", "Will remove")}
                            </span>
                          ) : null}
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={form.apiKey ?? ""}
                            onChange={(e) => {
                              setForm((prev) => ({ ...prev, apiKey: e.target.value }));
                              setClearKey(false);
                            }}
                            disabled={clearKey}
                            className={`${inputClass} ${showTrash ? "pr-10" : ""} disabled:opacity-60`}
                            placeholder={tr("mySetting.placeholderReplace", "New key (optional)")}
                          />
                          {showTrash ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => {
                                setClearKey((k) => !k);
                                setForm((prev) => ({ ...prev, apiKey: "" }));
                              }}
                              className={`absolute top-1/2 right-2 -translate-y-1/2 rounded appearance-none border-0 bg-transparent p-1.5 shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 ${
                                clearKey
                                  ? "text-amber-700 hover:bg-amber-100"
                                  : "text-zinc-500 hover:bg-red-50 hover:text-red-700"
                              }`}
                              title={
                                clearKey
                                  ? tr("mySetting.undoRemove", "Undo")
                                  : tr("mySetting.clearProviderKey", "Clear API key")
                              }
                              aria-label={
                                clearKey
                                  ? tr("mySetting.undoRemove", "Undo")
                                  : tr("mySetting.clearProviderKey", "Clear API key")
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {hasChanges && !loading ? (
        <div className="sticky bottom-0 z-40 mt-6 border-t border-red-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-600">
              {tr("mySetting.unsaved", "You have unsaved changes.")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDiscard}
                disabled={saving}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {tr("mySetting.discard", "Discard")}
              </button>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-[rgb(173,8,8)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? tr("mySetting.saving", "Saving…") : tr("mySetting.save", "Save changes")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
